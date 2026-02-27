import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const body = await req.json();
    const { email, phone, identifier, dedupe_only } = body;

    // Support both old "email" param and new "identifier" param
    // "identifier" is used by the new auth flow (could be email or phone)
    const inputEmail = email || (identifier && identifier.includes("@") ? identifier : null);
    const inputPhone = phone || (identifier && !identifier.includes("@") ? identifier : null);

    if (!inputEmail && !inputPhone) {
      return new Response(
        JSON.stringify({ error: "Email or phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = inputEmail ? inputEmail.toLowerCase().trim() : null;
    const normalizedPhone = inputPhone ? inputPhone.replace(/\s/g, "") : null;

    // Check if email/phone already exists in profiles (active users)
    if (normalizedEmail) {
      const { data: existingByEmail } = await supabaseAdmin
        .from("profiles")
        .select("id, status, user_id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingByEmail && existingByEmail.status !== "REMOVED") {
        return new Response(
          JSON.stringify({ found: false, error: "This email is already in use." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (normalizedPhone) {
      const { data: existingByPhone } = await supabaseAdmin
        .from("profiles")
        .select("id, status, user_id")
        .eq("phone", normalizedPhone)
        .maybeSingle();

      if (existingByPhone && existingByPhone.status !== "REMOVED") {
        return new Response(
          JSON.stringify({ found: false, error: "This phone number is already in use." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check for pending invite (global dedupe)
    let pendingInviteByEmail = null;
    let pendingInviteByPhone = null;

    if (normalizedEmail) {
      const { data } = await supabaseAdmin
        .from("user_invites")
        .select("id")
        .eq("email", normalizedEmail)
        .eq("status", "PENDING")
        .maybeSingle();
      pendingInviteByEmail = data;
    }

    if (normalizedPhone) {
      const { data } = await supabaseAdmin
        .from("user_invites")
        .select("id")
        .eq("phone", normalizedPhone)
        .eq("status", "PENDING")
        .maybeSingle();
      pendingInviteByPhone = data;
    }

    // If called with dedupe_only flag, just check existence
    if (dedupe_only) {
      if (pendingInviteByEmail || pendingInviteByPhone) {
        return new Response(
          JSON.stringify({ found: false, error: "This email or phone is already in use." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ found: false, available: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Standard check-invite flow for New User activation
    // Look up invite by email OR phone
    let invite = null;
    let inviteError = null;

    if (normalizedEmail) {
      const { data, error } = await supabaseAdmin
        .from("user_invites")
        .select("full_name, role, workshop_id, country, email, phone")
        .eq("email", normalizedEmail)
        .eq("status", "PENDING")
        .maybeSingle();
      invite = data;
      inviteError = error;
    }

    if (!invite && normalizedPhone) {
      const { data, error } = await supabaseAdmin
        .from("user_invites")
        .select("full_name, role, workshop_id, country, email, phone")
        .eq("phone", normalizedPhone)
        .eq("status", "PENDING")
        .maybeSingle();
      invite = data;
      inviteError = error;
    }

    if (inviteError) {
      throw inviteError;
    }

    if (!invite) {
      return new Response(
        JSON.stringify({ found: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get workshop name
    let workshopName = null;
    if (invite.workshop_id) {
      const { data: workshop } = await supabaseAdmin
        .from("workshops")
        .select("name")
        .eq("id", invite.workshop_id)
        .single();
      workshopName = workshop?.name;
    }

    return new Response(
      JSON.stringify({
        found: true,
        full_name: invite.full_name,
        role: invite.role,
        workshop_name: workshopName,
        country: invite.country,
        invite_email: invite.email,
        invite_phone: invite.phone,
        needs_email: !invite.email, // phone-only invite needs email at activation
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in check-invite:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
