import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, responses } = await req.json();

    // --- Input validation ---
    if (!token || typeof token !== "string" || token.length > 64) {
      return new Response(
        JSON.stringify({ error: "Valid token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!responses || !Array.isArray(responses) || responses.length === 0 || responses.length > 50) {
      return new Response(
        JSON.stringify({ error: "responses array is required (1-50 items)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate each response
    for (const r of responses) {
      if (!r.question_id || typeof r.question_id !== "string" || !UUID_RE.test(r.question_id)) {
        return new Response(
          JSON.stringify({ error: "Each response must have a valid question_id (UUID)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (typeof r.numeric_value !== "number" || r.numeric_value < 0 || r.numeric_value > 10 || !Number.isInteger(r.numeric_value)) {
        return new Response(
          JSON.stringify({ error: "numeric_value must be an integer between 0 and 10" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: feedbackReq, error: frError } = await supabase
      .from("feedback_requests")
      .select("id, job_card_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (frError || !feedbackReq) {
      return new Response(JSON.stringify({ error: "Invalid feedback link" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (feedbackReq.status === "SUBMITTED") {
      return new Response(JSON.stringify({ error: "Feedback has already been submitted" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (feedbackReq.status === "EXPIRED" || new Date(feedbackReq.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "This feedback link has expired" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseRows = responses.map((r: { question_id: string; numeric_value: number }) => ({
      feedback_request_id: feedbackReq.id,
      job_card_id: feedbackReq.job_card_id,
      question_id: r.question_id,
      numeric_value: r.numeric_value,
    }));

    const { error: insertError } = await supabase.from("feedback_responses").insert(responseRows);
    if (insertError) {
      console.error("Failed to insert feedback responses:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save feedback" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("feedback_requests")
      .update({ status: "SUBMITTED", submitted_at: new Date().toISOString() })
      .eq("id", feedbackReq.id);

    await supabase.from("job_cards")
      .update({ status: "COMPLETED", closed_at: new Date().toISOString() })
      .eq("id", feedbackReq.job_card_id)
      .eq("status", "DELIVERED");

    const { data: jc } = await supabase.from("job_cards").select("created_by").eq("id", feedbackReq.job_card_id).single();
    if (jc) {
      await supabase.from("audit_trail").insert({
        job_card_id: feedbackReq.job_card_id, user_id: jc.created_by,
        from_status: "DELIVERED", to_status: "COMPLETED",
        notes: "Auto-completed: customer feedback submitted",
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("submit-feedback error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
