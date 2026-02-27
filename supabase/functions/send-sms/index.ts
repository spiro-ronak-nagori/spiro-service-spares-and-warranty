import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TRIGGERS = ["OTP_INWARDING", "INWARDED", "READY", "OTP_DELIVERY", "DELIVERED", "REOPENED"];

function renderTemplate(template: string, vars: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(vars)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}

function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
}

function generateShortCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

const SMS_TEMPLATES: Record<string, string> = {
  OTP_INWARDING: "Share OTP {{OTP}} with {{workshop_name}} to confirm service for your Spiro bike {{reg_no}}.",
  INWARDED: "Hi {{customer_name}}, your bike {{reg_no}} is accepted for service at {{workshop_name}} on {{date}}.",
  READY: "Hi {{customer_name}}, service for {{reg_no}} is done! Collect it from {{workshop_name}}.",
  OTP_DELIVERY: "Share OTP {{OTP}} with {{workshop_name}} if you are satisfied with repairs done and accept delivery for your Spiro bike {{reg_no}}.",
  DELIVERED: "Hi {{customer_name}}, your bike {{reg_no}} is delivered. Rate your experience : {{link}}",
  REOPENED: "Hi {{customer_name}}, we have reopened service for your bike {{reg_no}} at {{workshop_name}}. Inconvenience is regretted.",
};

const OTP_TRIGGERS = new Set(["OTP_INWARDING", "OTP_DELIVERY"]);

// Map country name (lowercase) to the env var holding the API key
const API_KEY_ENV_MAP: Record<string, string> = {
  kenya: "AFRICAS_TALKING_API_KEY_KE",
  uganda: "AFRICAS_TALKING_API_KEY_UG",
  rwanda: "AFRICAS_TALKING_API_KEY_RW",
};

function normalizePhone(phone: string, prefix: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
  return `${prefix}${cleaned}`;
}

function resolveContact(jobCard: any, altPhoneEnabled: boolean): { phone: string | null; name: string } {
  if (altPhoneEnabled && jobCard.contact_for_updates === "RIDER" && jobCard.rider_phone) {
    return { phone: jobCard.rider_phone, name: jobCard.rider_name || "Customer" };
  }
  return { phone: jobCard.vehicle?.owner_phone ?? null, name: jobCard.vehicle?.owner_name || "Customer" };
}

interface CountrySmsConfig {
  name: string;
  calling_code: string;
  sms_username: string;
  sms_sender_id: string;
  sms_enabled: boolean;
}

async function loadCountrySmsConfig(supabase: any, countryName: string): Promise<CountrySmsConfig | null> {
  const { data, error } = await supabase
    .from("countries_master")
    .select("name, calling_code, sms_username, sms_sender_id, sms_enabled")
    .ilike("name", countryName)
    .maybeSingle();
  if (error || !data) return null;
  return data as CountrySmsConfig;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      if (token !== serviceRoleKey && token !== anonKey) {
        const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
        if (claimsError || !claims?.claims?.sub) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const { job_card_id, trigger, otp } = await req.json();

    if (!job_card_id || typeof job_card_id !== "string" || !UUID_RE.test(job_card_id)) {
      return new Response(
        JSON.stringify({ error: "Valid job_card_id (UUID) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
      return new Response(
        JSON.stringify({ error: `Invalid trigger. Must be one of: ${VALID_TRIGGERS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const template = SMS_TEMPLATES[trigger];

    // --- Master SMS sending toggle ---
    const { data: smsSendingSetting } = await supabase
      .from("system_settings").select("value").eq("key", "ENABLE_SMS_SENDING").maybeSingle();
    const smsEnabled = smsSendingSetting?.value?.toLowerCase() === "true";

    if (OTP_TRIGGERS.has(trigger)) {
      const { data: settingRow } = await supabase
        .from("system_settings").select("value").eq("key", "ENABLE_SMS_TEST_MODE").maybeSingle();
      if (settingRow?.value?.toLowerCase() === "true") {
        console.log(`[send-sms] TEST MODE — skipping OTP SMS for trigger ${trigger}`);
        return new Response(
          JSON.stringify({ success: true, test_mode: true, trigger }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!smsEnabled) {
      console.log(`[send-sms] SMS DISABLED — skipping SMS for trigger ${trigger}`);
    }

    const { data: altPhoneSetting } = await supabase
      .from("system_settings").select("value").eq("key", "ENABLE_ALTERNATE_PHONE_NUMBER").maybeSingle();
    const altPhoneEnabled = altPhoneSetting?.value?.toLowerCase() === "true";

    const { data: jobCard, error: jcError } = await supabase
      .from("job_cards")
      .select(`*, vehicle:vehicles(reg_no, owner_name, owner_phone), workshop:workshops(name, country)`)
      .eq("id", job_card_id)
      .single();

    if (jcError || !jobCard) {
      return new Response(JSON.stringify({ error: "Job card not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicle = jobCard.vehicle;
    const workshop = jobCard.workshop;
    const countryName = workshop?.country || null;
    const { phone: rawPhone, name: customerName } = resolveContact(jobCard, altPhoneEnabled);

    if (!rawPhone) {
      return new Response(JSON.stringify({ error: "No customer phone number on vehicle record" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Load SMS config from countries_master ---
    if (!countryName) {
      console.warn(`[send-sms] No country set on workshop — skipping SMS`);
      await supabase.from("sms_audit_log").insert({
        job_card_id, trigger_status: trigger, phone_number: rawPhone,
        rendered_message: `[SKIPPED] No country on workshop`,
        workshop_id: jobCard.workshop_id, country: null, username_used: "N/A",
        api_key_alias: "NONE", http_status_code: 0, success: false,
      });
      return new Response(
        JSON.stringify({ success: false, reason: "No country on workshop" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const countryConfig = await loadCountrySmsConfig(supabase, countryName);

    if (!countryConfig) {
      console.error(`[send-sms] SMS config missing for country: ${countryName}`);
      await supabase.from("sms_audit_log").insert({
        job_card_id, trigger_status: trigger, phone_number: rawPhone,
        rendered_message: `[SKIPPED] SMS config missing for country: ${countryName}`,
        workshop_id: jobCard.workshop_id, country: countryName, username_used: "N/A",
        api_key_alias: "NONE", http_status_code: 0, success: false,
      });
      return new Response(
        JSON.stringify({ success: false, reason: `SMS config missing for country: ${countryName}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!countryConfig.sms_enabled) {
      console.log(`[send-sms] SMS disabled for country ${countryName} in countries_master`);
      await supabase.from("sms_audit_log").insert({
        job_card_id, trigger_status: "SKIPPED_COUNTRY_DISABLED", phone_number: rawPhone,
        rendered_message: `[SKIPPED] SMS disabled for country: ${countryName}`,
        workshop_id: jobCard.workshop_id, country: countryName, username_used: countryConfig.sms_username || "N/A",
        api_key_alias: "DISABLED", http_status_code: 0, success: false,
      });
      return new Response(
        JSON.stringify({ success: false, reason: `SMS disabled for country: ${countryName}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!countryConfig.sms_username || !countryConfig.sms_sender_id) {
      console.error(`[send-sms] Incomplete SMS config for ${countryName}: username=${countryConfig.sms_username}, senderId=${countryConfig.sms_sender_id}`);
      await supabase.from("sms_audit_log").insert({
        job_card_id, trigger_status: trigger, phone_number: rawPhone,
        rendered_message: `[SKIPPED] Incomplete SMS config for ${countryName}`,
        workshop_id: jobCard.workshop_id, country: countryName, username_used: countryConfig.sms_username || "N/A",
        api_key_alias: "NONE", http_status_code: 0, success: false,
      });
      return new Response(
        JSON.stringify({ success: false, reason: `Incomplete SMS config for country: ${countryName}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerPhone = normalizePhone(rawPhone, countryConfig.calling_code);

    // Resolve API key from env (NOT from DB)
    const apiKeyEnvVar = API_KEY_ENV_MAP[countryName.toLowerCase().trim()];
    if (!apiKeyEnvVar) {
      console.error(`[send-sms] No API key env mapping for country: ${countryName}`);
      return new Response(JSON.stringify({ error: `No API key mapping for ${countryName}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const atApiKey = Deno.env.get(apiKeyEnvVar);
    if (!atApiKey) {
      console.error(`[send-sms] Missing secret ${apiKeyEnvVar}`);
      return new Response(JSON.stringify({ error: `SMS API key not configured for ${countryName}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELIVERED trigger: create feedback link
    let feedbackLink = "";
    if (trigger === "DELIVERED") {
      const { data: feedbackSetting } = await supabase
        .from("system_settings").select("value").eq("key", "ENABLE_FEEDBACK_FORM").maybeSingle();
      const feedbackEnabled = feedbackSetting?.value?.toLowerCase() !== "false";
      if (feedbackEnabled) {
        feedbackLink = await createFeedbackLink(supabase, job_card_id, supabaseUrl);
      }
    }

    const templateVars: Record<string, string> = {
      customer_name: customerName,
      reg_no: vehicle?.reg_no || "N/A",
      workshop_name: workshop?.name || "Workshop",
      date: jobCard.inwarded_at
        ? new Date(jobCard.inwarded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      OTP: otp || "123456",
      link: feedbackLink,
    };

    let renderedMessage = renderTemplate(template, templateVars);
    if (trigger === "DELIVERED" && !feedbackLink) {
      renderedMessage = renderedMessage.replace(/\s*Rate your experience\s*:\s*$/i, "").trim();
    }

    let atBody: any = null;
    let httpStatus = 0;
    let success = false;
    const countryAlias = countryName.substring(0, 2).toUpperCase();

    if (!smsEnabled) {
      atBody = { skipped: "SKIPPED_SMS_DISABLED" };
    } else {
      try {
        const payload = {
          username: countryConfig.sms_username,
          message: renderedMessage,
          senderId: countryConfig.sms_sender_id,
          phoneNumbers: [customerPhone],
        };
        const atResponse = await fetch("https://api.africastalking.com/version1/messaging/bulk", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json", apiKey: atApiKey },
          body: JSON.stringify(payload),
        });
        httpStatus = atResponse.status;
        atBody = await atResponse.json().catch(() => ({ raw: "non-json response" }));
        success = httpStatus >= 200 && httpStatus < 300;
      } catch (fetchErr) {
        console.error("Africa's Talking API error:", fetchErr);
        atBody = { error: String(fetchErr) };
      }
    }

    await supabase.from("sms_audit_log").insert({
      job_card_id, trigger_status: smsEnabled ? trigger : "SKIPPED_SMS_DISABLED",
      phone_number: customerPhone, rendered_message: renderedMessage,
      workshop_id: jobCard.workshop_id, country: countryName, username_used: countryConfig.sms_username,
      api_key_alias: smsEnabled ? countryAlias : "DISABLED", at_response_body: atBody,
      http_status_code: httpStatus, success,
    });

    // Auto-complete if feedback disabled
    if (trigger === "DELIVERED" && !feedbackLink) {
      const { error: completeError } = await supabase
        .from("job_cards")
        .update({ status: "COMPLETED", closed_at: new Date().toISOString() })
        .eq("id", job_card_id);
      if (!completeError) {
        await supabase.from("audit_trail").insert({
          job_card_id, user_id: jobCard.created_by,
          from_status: "DELIVERED", to_status: "COMPLETED",
          notes: "Auto-completed: feedback form disabled",
        });
      }
    }

    return new Response(
      JSON.stringify({ success: smsEnabled ? success : true, trigger, phone: customerPhone, country_alias: countryAlias, sms_disabled: !smsEnabled, auto_completed: trigger === "DELIVERED" && !feedbackLink }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-sms error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function createFeedbackLink(supabase: any, jobCardId: string, supabaseUrl: string): Promise<string> {
  try {
    const { data: existing } = await supabase
      .from("feedback_requests").select("id, token").eq("job_card_id", jobCardId).maybeSingle();
    if (existing) {
      const { data: sl } = await supabase
        .from("short_links").select("short_code").eq("feedback_request_id", existing.id).maybeSingle();
      if (sl) return buildShortUrl(sl.short_code);
    }

    const { data: tmpl } = await supabase
      .from("feedback_form_templates").select("id").eq("is_active", true).limit(1).single();
    if (!tmpl) { console.error("[send-sms] No active feedback template"); return ""; }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: fr, error: frError } = await supabase
      .from("feedback_requests")
      .insert({ job_card_id: jobCardId, token, template_id: tmpl.id, expires_at: expiresAt, status: "PENDING" })
      .select("id").single();

    if (frError) {
      if (frError.code === "23505") {
        const { data: existingFr } = await supabase
          .from("feedback_requests").select("id, token").eq("job_card_id", jobCardId).single();
        if (existingFr) {
          const { data: sl2 } = await supabase
            .from("short_links").select("short_code").eq("feedback_request_id", existingFr.id).maybeSingle();
          return sl2 ? buildShortUrl(sl2.short_code) : "";
        }
      }
      console.error("[send-sms] Failed to create feedback request:", frError);
      return "";
    }

    const shortCode = generateShortCode();
    await supabase.from("short_links").insert({ short_code: shortCode, feedback_request_id: fr.id });
    return buildShortUrl(shortCode);
  } catch (err) {
    console.error("[send-sms] createFeedbackLink error:", err);
    return "";
  }
}

function buildShortUrl(shortCode: string): string {
  return `https://spiroservice.lovable.app/f/${shortCode}`;
}
