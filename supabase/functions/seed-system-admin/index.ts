import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const SEED_EMAIL = "ronak.nagori@spironet.com";
    const SEED_PASSWORD = "Spiro@123";
    const SEED_NAME = "System Admin";

    // Check if a profile with system_admin role already exists for this email
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, role, status")
      .eq("email", SEED_EMAIL)
      .maybeSingle();

    if (existingProfile) {
      // Already exists — ensure role is system_admin and status is ACTIVE
      if (existingProfile.role !== "system_admin" || existingProfile.status !== "ACTIVE") {
        await supabaseAdmin
          .from("profiles")
          .update({ role: "system_admin", status: "ACTIVE" })
          .eq("id", existingProfile.id);
        return new Response(
          JSON.stringify({ success: true, action: "updated", message: "Existing user promoted to system_admin" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, action: "already_exists", message: "System admin user already exists" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if auth user exists with this email
    const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.find((u) => u.email === SEED_EMAIL);

    let userId: string;

    if (existingAuthUser) {
      userId = existingAuthUser.id;
      // Update password to ensure it matches
      await supabaseAdmin.auth.admin.updateUserById(userId, { password: SEED_PASSWORD });
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: SEED_EMAIL,
        password: SEED_PASSWORD,
        email_confirm: true,
      });
      if (authError) throw authError;
      userId = authData.user.id;
    }

    // Upsert profile with system_admin role
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          full_name: SEED_NAME,
          role: "system_admin",
          workshop_id: null,
          status: "ACTIVE",
          email: SEED_EMAIL,
          phone: null,
        },
        { onConflict: "user_id" }
      );

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ success: true, action: "created", message: "System admin user created successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
