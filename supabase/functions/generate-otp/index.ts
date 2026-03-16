import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, "0");
}

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function resolvePhone(jobCard: any): string | null {
  const altEnabled = jobCard._alt_phone_enabled;
  if (altEnabled && jobCard.contact_for_updates === "RIDER" && jobCard.rider_phone) {
    return jobCard.rider_phone;
  }
  return jobCard.vehicle?.owner_phone ?? null;
}

Deno.serve(async (req) => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Input validation ---
    const { job_card_id, purpose } = await req.json();

    if (!job_card_id || typeof job_card_id !== "string" || !UUID_RE.test(job_card_id)) {
      return new Response(
        JSON.stringify({ error: "Valid job_card_id (UUID) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!purpose || !["inwarding", "delivery"].includes(purpose)) {
      return new Response(
        JSON.stringify({ error: "purpose must be 'inwarding' or 'delivery'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch job card (with workshop country for country-level settings)
    const { data: jobCard, error: jcError } = await supabase
      .from("job_cards")
      .select("id, workshop_id, contact_for_updates, rider_phone, rider_phone_locked, vehicle:vehicles(owner_phone), workshop:workshops(country)")
      .eq("id", job_card_id)
      .single();

    if (jcError || !jobCard) {
      return new Response(
        JSON.stringify({ error: "Job card not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jcCountry = (jobCard as any).workshop?.country || null;

    // Helper: read setting from country_settings first, fallback to system_settings
    async function getSettingValue(settingKey: string): Promise<string | null> {
      if (jcCountry) {
        const { data: cs } = await supabase
          .from("country_settings")
          .select("value")
          .eq("country_name", jcCountry)
          .eq("setting_key", settingKey)
          .maybeSingle();
        if (cs?.value != null) return cs.value;
      }
      const { data: ss } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", settingKey)
        .maybeSingle();
      return ss?.value ?? null;
    }

    // Read test mode
    const isTestMode = (await getSettingValue("ENABLE_SMS_TEST_MODE"))?.toLowerCase() === "true";

    // Read alternate phone feature flag
    const altPhoneEnabled = (await getSettingValue("ENABLE_ALTERNATE_PHONE_NUMBER"))?.toLowerCase() === "true";

    // jobCard already fetched above

    const phone = resolvePhone(jobCard);
    if (!phone) {
      return new Response(
        JSON.stringify({ error: "No customer phone number on vehicle" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invalidate existing OTPs
    await supabase
      .from("otp_codes")
      .update({ verified: true })
      .eq("job_card_id", job_card_id)
      .eq("purpose", purpose)
      .eq("verified", false);

    // Generate new OTP
    const code = generateCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("otp_codes").insert({
      job_card_id,
      phone,
      code: "HASHED",
      code_hash: codeHash,
      purpose,
      expires_at: expiresAt,
      attempts: 0,
      verified: false,
    });

    if (insertError) {
      console.error("Failed to insert OTP:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to generate OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Lock rider phone on inwarding
    if (altPhoneEnabled && purpose === "inwarding" && !jobCard.rider_phone_locked) {
      await supabase
        .from("job_cards")
        .update({ rider_phone_locked: true })
        .eq("id", job_card_id);
    }

    // Test mode: return OTP directly
    if (isTestMode) {
      console.log("[generate-otp] TEST MODE — OTP returned in response");
      return new Response(
        JSON.stringify({ success: true, test_mode: true, otp: code, phone_hint: phone.slice(-4) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Production: send SMS
    const smsTrigger = purpose === "inwarding" ? "OTP_INWARDING" : "OTP_DELIVERY";
    try {
      await supabase.functions.invoke("send-sms", {
        body: { job_card_id, trigger: smsTrigger, otp: code },
      });
    } catch (smsErr) {
      console.error("SMS send failed (non-blocking):", smsErr);
    }

    return new Response(
      JSON.stringify({ success: true, test_mode: false, phone_hint: phone.slice(-4) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-otp error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
