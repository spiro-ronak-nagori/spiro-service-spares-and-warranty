import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT_SECONDS = 300;
const MAX_ROWS = 10000;
const ALLOWED_ROLES = ["system_admin", "super_admin", "country_admin"];

function escapeCsvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: authUser }, error: userErr } =
      await userClient.auth.getUser();
    if (userErr || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authUser.id;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Get profile + role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, country")
      .eq("user_id", userId)
      .single();

    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: insufficient role" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Rate limit
    const { data: lastExport } = await supabase
      .from("export_audit_log")
      .select("created_at")
      .eq("user_id", userId)
      .eq("export_type", "raw_csv")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastExport) {
      const elapsed =
        (Date.now() - new Date(lastExport.created_at).getTime()) / 1000;
      if (elapsed < RATE_LIMIT_SECONDS) {
        const wait = Math.ceil(RATE_LIMIT_SECONDS - elapsed);
        return new Response(
          JSON.stringify({
            error: "RATE_LIMITED",
            message: `Please wait ${wait} seconds before exporting again.`,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Parse input
    const body = await req.json();
    let { date_from, date_to, country_id, workshop_id } = body;

    if (!date_from || !date_to) {
      return new Response(
        JSON.stringify({ error: "date_from and date_to are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // RBAC: country_admin forced to their country
    if (profile.role === "country_admin") {
      country_id = profile.country;
    }

    // Call the RPC function
    const { data: rows, error: rpcErr } = await supabase.rpc(
      "export_job_cards_csv",
      {
        p_date_from: date_from,
        p_date_to: date_to,
        p_country: country_id || null,
        p_workshop_id: workshop_id || null,
      }
    );

    if (rpcErr) throw rpcErr;

    if (rows && rows.length > MAX_ROWS) {
      return new Response(
        JSON.stringify({
          error: "TOO_MANY_ROWS",
          message: `Export returned ${rows.length} rows (max ${MAX_ROWS}). Please narrow your filters.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build CSV
    const headers = [
      "workshop_name",
      "technician_name",
      "vehicle_number",
      "odometer",
      "jc_number",
      "jc_status",
      "service_issues",
      "inward_ts",
      "work_start_ts",
      "work_end_ts",
      "delivered_ts",
    ];

    let csv = headers.join(",") + "\n";

    for (const row of rows || []) {
      const line = [
        escapeCsvCell(row.workshop_name),
        escapeCsvCell(row.technician_name),
        escapeCsvCell(row.vehicle_number),
        escapeCsvCell(String(row.odometer ?? "")),
        escapeCsvCell(row.jc_number),
        escapeCsvCell(row.jc_status),
        escapeCsvCell(row.service_issues),
        escapeCsvCell(row.inward_ts || ""),
        escapeCsvCell(row.work_start_ts || ""),
        escapeCsvCell(row.work_end_ts || ""),
        escapeCsvCell(row.delivered_ts || ""),
      ].join(",");
      csv += line + "\n";
    }

    // Log export
    await supabase.from("export_audit_log").insert({
      user_id: userId,
      export_type: "raw_csv",
    });

    const filename = `jobcards_${date_from}_${date_to}.csv`;
    const encoder = new TextEncoder();

    return new Response(encoder.encode(csv), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("CSV export error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
