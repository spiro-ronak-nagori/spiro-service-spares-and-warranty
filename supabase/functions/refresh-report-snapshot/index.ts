import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Throttle: check last refresh was > 5 minutes ago
    const { data: lastRefresh } = await supabase
      .from("report_refresh_log")
      .select("triggered_at")
      .order("triggered_at", { ascending: false })
      .limit(1)
      .single();

    if (lastRefresh) {
      const lastTime = new Date(lastRefresh.triggered_at).getTime();
      const now = Date.now();
      const diffMin = (now - lastTime) / 60000;
      if (diffMin < 5) {
        return new Response(
          JSON.stringify({
            error: "THROTTLED",
            message: `Last refresh was ${Math.round(diffMin)} minutes ago. Please wait at least 5 minutes.`,
            last_refresh: lastRefresh.triggered_at,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Generate snapshots for today (current state) and last 30 days of created/delivered counts
    const today = new Date().toISOString().split("T")[0];

    // Build snapshot data using raw SQL via rpc
    // We'll use a database function for efficiency
    const { data: rpcResult, error: snapErr } = await supabase.rpc(
      "generate_report_snapshots",
      { p_target_date: today }
    );

    if (snapErr) {
      console.error("Snapshot generation error:", snapErr);
      return new Response(
        JSON.stringify({ error: snapErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rowCount = rpcResult?.rows_inserted || 0;

    // Log the refresh
    await supabase.from("report_refresh_log").insert({
      triggered_by: null,
      row_count: rowCount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        rows_generated: rowCount,
        snapshot_date: today,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Refresh error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
