import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OTP_RE = /^\d{4,8}$/;

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_card_id, purpose, code } = await req.json();

    // --- Input validation ---
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
    if (!code || typeof code !== "string" || !OTP_RE.test(code)) {
      return new Response(
        JSON.stringify({ error: "Valid OTP code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get the latest unexpired, unused OTP
    const { data: otpRecord, error: fetchErr } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("job_card_id", job_card_id)
      .eq("purpose", purpose)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchErr || !otpRecord) {
      return new Response(
        JSON.stringify({ verified: false, error: "No valid OTP found. Please request a new one." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if ((otpRecord.attempts ?? 0) >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({ verified: false, error: "Maximum attempts reached. Please request a new OTP." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase.from("otp_codes").update({ attempts: (otpRecord.attempts ?? 0) + 1 }).eq("id", otpRecord.id);

    const submittedHash = await hashCode(code);
    const storedHash = otpRecord.code_hash;

    if (!storedHash || submittedHash !== storedHash) {
      const remaining = MAX_ATTEMPTS - (otpRecord.attempts ?? 0) - 1;
      return new Response(
        JSON.stringify({ verified: false, error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase.from("otp_codes").update({ verified: true }).eq("id", otpRecord.id);

    return new Response(
      JSON.stringify({ verified: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-otp error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
