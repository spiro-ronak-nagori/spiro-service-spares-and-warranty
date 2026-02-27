import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Public endpoint to load feedback form data by token.
 * No auth required — the token itself is the credential.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token: directToken, short_code } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let token = directToken;

    // If short_code provided, resolve it to a token
    if (!token && short_code) {
      const { data: sl } = await supabase
        .from("short_links")
        .select("feedback_request_id")
        .eq("short_code", short_code)
        .maybeSingle();

      if (!sl) {
        return new Response(
          JSON.stringify({ error: "Invalid feedback link" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: fr } = await supabase
        .from("feedback_requests")
        .select("token")
        .eq("id", sl.feedback_request_id)
        .single();

      if (!fr) {
        return new Response(
          JSON.stringify({ error: "Invalid feedback link" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      token = fr.token;
    }

    if (!token) {
      return new Response(
        JSON.stringify({ error: "token or short_code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch feedback request by token (service role bypasses RLS)
    const { data: fr, error: frError } = await supabase
      .from("feedback_requests")
      .select("id, job_card_id, status, expires_at, template_id")
      .eq("token", token)
      .maybeSingle();

    if (frError || !fr) {
      return new Response(
        JSON.stringify({ error: "Invalid feedback link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (fr.status === "SUBMITTED") {
      return new Response(
        JSON.stringify({ error: "already_submitted" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (fr.status === "EXPIRED" || new Date(fr.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "expired" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch job card context (service role bypasses RLS)
    const { data: jc } = await supabase
      .from("job_cards")
      .select("vehicle:vehicles(reg_no), workshop:workshops(name)")
      .eq("id", fr.job_card_id)
      .single();

    // Fetch questions
    const { data: questions } = await supabase
      .from("feedback_form_questions")
      .select("id, question_text, question_type, min_label, max_label, sort_order")
      .eq("template_id", fr.template_id)
      .eq("is_active", true)
      .order("sort_order");

    const workshopData = jc?.workshop as any;
    const vehicleData = jc?.vehicle as any;

    const responseBody: Record<string, unknown> = {
      feedback_request_id: fr.id,
      status: fr.status,
      workshop_name: workshopData?.name || "Workshop",
      reg_no: vehicleData?.reg_no || "",
      questions: questions || [],
    };

    // Include token in response when resolved via short_code (so redirect page can navigate)
    if (short_code && !directToken) {
      responseBody.token = token;
    }

    return new Response(
      JSON.stringify(responseBody),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("load-feedback error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
