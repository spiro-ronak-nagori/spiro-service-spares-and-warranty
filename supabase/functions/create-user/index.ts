import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = ["technician", "workshop_admin", "country_admin", "super_admin", "system_admin", "warranty_admin"];
// Roles that require system_admin to assign
const SYSTEM_ADMIN_ONLY_ROLES = ["super_admin", "system_admin"];
// Roles that require at least super_admin
const ELEVATED_ROLES = ["warranty_admin", "country_admin"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[1-9]\d{1,14}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerUserId = claims.claims.sub as string;

    // Check caller role
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", callerUserId)
      .single();

    if (!callerProfile || !["system_admin", "super_admin", "workshop_admin", "country_admin"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden: insufficient privileges" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only system_admin can create super_admin or system_admin users
    const body = await req.json();
    const { email, password, full_name, role, workshop_id, phone } = body;

    if (SYSTEM_ADMIN_ONLY_ROLES.includes(role) && callerProfile.role !== "system_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: only system_admin can create super_admin or system_admin users" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Input validation ---

    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!password || typeof password !== "string" || password.length < 6 || password.length > 128) {
      return new Response(JSON.stringify({ error: "Password must be 6-128 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!full_name || typeof full_name !== "string" || full_name.trim().length < 1 || full_name.length > 100) {
      return new Response(JSON.stringify({ error: "Full name is required (max 100 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (workshop_id && !UUID_RE.test(workshop_id)) {
      return new Response(JSON.stringify({ error: "Invalid workshop_id format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (phone && !PHONE_RE.test(phone.replace(/\s/g, ""))) {
      return new Response(JSON.stringify({ error: "Invalid phone format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    });

    if (authError) throw authError;

    // Upsert profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          user_id: authData.user.id,
          full_name: full_name.trim(),
          role,
          workshop_id: workshop_id || null,
          status: "ACTIVE",
          email: email.trim(),
          phone: phone ? phone.replace(/\s/g, "") : null,
        },
        { onConflict: "user_id" }
      );

    if (profileError) throw profileError;

    return new Response(JSON.stringify({ user_id: authData.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
