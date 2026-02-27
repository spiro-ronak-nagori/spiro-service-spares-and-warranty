import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Expire feedback requests that have passed their 2-day window.
 * Moves associated job cards from DELIVERED → COMPLETED.
 * 
 * This function should be called periodically (e.g., via cron or manual trigger).
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find all PENDING feedback requests that have expired
    const now = new Date().toISOString();
    const { data: expired, error } = await supabase
      .from("feedback_requests")
      .select("id, job_card_id")
      .eq("status", "PENDING")
      .lt("expires_at", now);

    if (error) {
      console.error("Error fetching expired feedback requests:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch expired requests" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!expired || expired.length === 0) {
      return new Response(
        JSON.stringify({ success: true, expired_count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let expiredCount = 0;

    for (const fr of expired) {
      // Mark as EXPIRED
      await supabase
        .from("feedback_requests")
        .update({ status: "EXPIRED" })
        .eq("id", fr.id);

      // Move JC to COMPLETED if still DELIVERED
      const { data: jc } = await supabase
        .from("job_cards")
        .select("id, created_by, status")
        .eq("id", fr.job_card_id)
        .eq("status", "DELIVERED")
        .maybeSingle();

      if (jc) {
        await supabase
          .from("job_cards")
          .update({ status: "COMPLETED", closed_at: new Date().toISOString() })
          .eq("id", jc.id);

        await supabase.from("audit_trail").insert({
          job_card_id: jc.id,
          user_id: jc.created_by,
          from_status: "DELIVERED",
          to_status: "COMPLETED",
          notes: "Auto-completed: feedback window expired (2 days)",
        });

        expiredCount++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, expired_count: expiredCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("expire-feedback error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
