import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generateSyntheticEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `u_${digits}@phone.spironet.local`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { email, phone, password, activation_email } = await req.json();

    if (!email && !phone) {
      return new Response(
        JSON.stringify({ error: "Email or phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    const normalizedPhone = phone ? phone.replace(/\s/g, "") : null;

    // 1. Find pending invite by email or phone
    let invite = null;

    if (normalizedEmail) {
      const { data } = await supabaseAdmin
        .from("user_invites")
        .select("*")
        .eq("email", normalizedEmail)
        .eq("status", "PENDING")
        .maybeSingle();
      invite = data;
    }

    if (!invite && normalizedPhone) {
      const { data } = await supabaseAdmin
        .from("user_invites")
        .select("*")
        .eq("phone", normalizedPhone)
        .eq("status", "PENDING")
        .maybeSingle();
      invite = data;
    }

    if (!invite) {
      return new Response(
        JSON.stringify({ error: "No pending invite found for this email or phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Determine the auth email
    let authEmail = invite.email;

    if (!authEmail) {
      // Phone-only invite: user may optionally provide email
      const providedEmail = activation_email ? activation_email.toLowerCase().trim() : null;

      if (providedEmail) {
        // User provided a real email — validate uniqueness
        const { data: emailCheck } = await supabaseAdmin
          .from("profiles")
          .select("id, status")
          .eq("email", providedEmail)
          .maybeSingle();
        if (emailCheck && emailCheck.status !== "REMOVED") {
          return new Response(
            JSON.stringify({ error: "This email is already in use by another account" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        authEmail = providedEmail;
      } else {
        // No email provided — generate synthetic email from phone
        authEmail = generateSyntheticEmail(invite.phone);
      }
    }

    // 3. Check for existing profile (re-activation case)
    let existingProfile = null;
    if (authEmail) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("id, status, user_id")
        .eq("email", authEmail)
        .maybeSingle();
      existingProfile = data;
    }
    if (!existingProfile && invite.phone) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("id, status, user_id")
        .eq("phone", invite.phone)
        .maybeSingle();
      existingProfile = data;
    }

    if (existingProfile) {
      if (existingProfile.status !== "REMOVED") {
        return new Response(
          JSON.stringify({
            error: "An account with this email already exists. Please sign in instead.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Re-activate
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        existingProfile.user_id,
        { password }
      );

      if (updateAuthError) {
        return new Response(
          JSON.stringify({ error: "Failed to update account: " + updateAuthError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: profileUpdateError } = await supabaseAdmin
        .from("profiles")
        .update({
          full_name: invite.full_name,
          email: authEmail,
          phone: invite.phone || null,
          role: invite.role,
          workshop_id: invite.workshop_id,
          status: "ACTIVE",
          country: invite.country || null,
        })
        .eq("id", existingProfile.id);

      if (profileUpdateError) {
        return new Response(
          JSON.stringify({ error: "Failed to reactivate profile: " + profileUpdateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // 4. Create new auth user
      const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
          email: authEmail,
          password: password,
          email_confirm: true,
        });

      let authUserId: string;

      if (authError || !authData?.user) {
        const msg = authError?.message || "Failed to create account";

        // Ghost user recovery: auth user exists but profile doesn't
        if (msg.includes("already been registered") || msg.includes("already exists")) {
          // Look up the existing auth user by email — listUsers filter is fuzzy,
          // so we must verify the exact email match to avoid user_id mismatches.
          const { data: listData, error: listError } =
            await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 50 });

          const ghostUser = listData?.users?.find(
            (u) => u.email?.toLowerCase() === authEmail.toLowerCase()
          );
          if (listError || !ghostUser) {
            console.error("Ghost user lookup failed for email:", authEmail, listError);
            return new Response(
              JSON.stringify({
                error: "An account with this email already exists but could not be recovered. Please contact your administrator.",
              }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Update the ghost user's password so they can sign in
          const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(
            ghostUser.id,
            { password }
          );
          if (pwError) {
            return new Response(
              JSON.stringify({ error: "Failed to update account: " + pwError.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          authUserId = ghostUser.id;
        } else {
          return new Response(
            JSON.stringify({ error: msg }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        authUserId = authData.user.id;
      }

      // 5. Create / recover profile
      // First, check if a stale profile exists for a DIFFERENT user_id but same email/phone.
      // This can happen if a previous trigger or failed invite created a mismatched profile.
      if (authEmail) {
        const { data: staleByEmail } = await supabaseAdmin
          .from("profiles")
          .select("id, user_id")
          .eq("email", authEmail)
          .neq("user_id", authUserId)
          .maybeSingle();

        if (staleByEmail) {
          console.warn(`Fixing stale profile ${staleByEmail.id}: user_id ${staleByEmail.user_id} -> ${authUserId}`);
          await supabaseAdmin
            .from("profiles")
            .update({ user_id: authUserId })
            .eq("id", staleByEmail.id);
        }
      }

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          user_id: authUserId,
          full_name: invite.full_name,
          email: authEmail,
          phone: invite.phone || null,
          role: invite.role,
          workshop_id: invite.workshop_id,
          status: "ACTIVE",
          country: invite.country || null,
        }, { onConflict: "user_id" });

      if (profileError) {
        return new Response(
          JSON.stringify({
            error: "Failed to create profile: " + profileError.message,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 6. Update invite
    const inviteUpdate: Record<string, unknown> = {
      status: "ACCEPTED",
      accepted_at: new Date().toISOString(),
    };
    if (!invite.email && authEmail) {
      inviteUpdate.email = authEmail;
    }

    await supabaseAdmin
      .from("user_invites")
      .update(inviteUpdate)
      .eq("id", invite.id);

    // 7. Auto-create warranty_admin_assignments if scope was stored on the invite
    if (invite.role === "warranty_admin") {
      // Resolve auth user id for assignment
      let assignUserId: string | null = null;

      if (existingProfile) {
        assignUserId = existingProfile.user_id;
      } else {
        // Look up the profile we just upserted
        const { data: newProfile } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .eq("email", authEmail)
          .maybeSingle();
        assignUserId = newProfile?.user_id || null;
      }

      if (assignUserId) {
        const countryIds = invite.assignment_country_ids || [];
        const workshopIds = invite.assignment_workshop_ids || [];

        await supabaseAdmin
          .from("warranty_admin_assignments")
          .insert({
            admin_user_id: assignUserId,
            country_ids: countryIds,
            workshop_ids: workshopIds,
            active: true,
            created_by: invite.invited_by,
          });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account activated successfully. You can now sign in.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in accept-invite:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
