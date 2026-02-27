import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT_SECONDS = 300;
const ALLOWED_ROLES = ["system_admin", "super_admin", "country_admin"];

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

    // Service role client for all queries
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get user profile + role
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
      .eq("export_type", "snapshot_pdf")
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

    // Query report_daily_snapshot
    let query = supabase
      .from("report_daily_snapshot")
      .select("*")
      .gte("snapshot_date", date_from)
      .lte("snapshot_date", date_to)
      .order("snapshot_date", { ascending: true });

    if (country_id) query = query.eq("country", country_id);
    if (workshop_id) query = query.eq("workshop_id", workshop_id);

    const { data: snapshots, error: snapErr } = await query;
    if (snapErr) throw snapErr;

    const rows = snapshots || [];

    // Compute KPIs
    const sum = (key: string) =>
      rows.reduce((acc: number, r: any) => acc + (Number(r[key]) || 0), 0);
    const avg = (key: string) => {
      const vals = rows
        .map((r: any) => Number(r[key]))
        .filter((v: number) => v > 0);
      return vals.length
        ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length
        : 0;
    };

    const latestDate = rows.length
      ? rows.reduce(
          (max: string, r: any) =>
            r.snapshot_date > max ? r.snapshot_date : max,
          rows[0].snapshot_date
        )
      : date_to;
    const latestRows = rows.filter((r: any) => r.snapshot_date === latestDate);

    const kpis = {
      totalCreated: sum("total_created"),
      totalDelivered: sum("total_delivered"),
      activeFloor: latestRows.reduce(
        (acc: number, r: any) => acc + (Number(r.active_floor) || 0),
        0
      ),
      pendingDelivery: latestRows.reduce(
        (acc: number, r: any) => acc + (Number(r.pending_delivery) || 0),
        0
      ),
      avgMttr: avg("avg_mttr_minutes"),
      avgTurnaround: avg("avg_turnaround_minutes"),
      reopenPercent: avg("reopen_percent"),
      avgFeedback: avg("avg_feedback_score"),
    };

    // Daily trend
    const dateMap: Record<
      string,
      { date: string; created: number; delivered: number }
    > = {};
    rows.forEach((s: any) => {
      if (!dateMap[s.snapshot_date]) {
        dateMap[s.snapshot_date] = {
          date: s.snapshot_date,
          created: 0,
          delivered: 0,
        };
      }
      dateMap[s.snapshot_date].created += s.total_created;
      dateMap[s.snapshot_date].delivered += s.total_delivered;
    });
    const dailyTrend = Object.values(dateMap).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Stage TAT
    const avgField = (key: string) => {
      const vals = rows.map((s: any) => Number(s[key])).filter((v: number) => v > 0);
      return vals.length
        ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length)
        : null;
    };
    const stageTat = [
      {
        stage: "Draft -> Inwarded",
        minutes: avgField("draft_to_inwarded_avg"),
      },
      {
        stage: "Inwarded -> In Progress",
        minutes: avgField("inwarded_to_progress_avg"),
      },
      {
        stage: "In Progress -> Ready",
        minutes: avgField("progress_to_ready_avg"),
      },
      {
        stage: "Ready -> Delivered",
        minutes: avgField("ready_to_delivered_avg"),
      },
    ];

    // WinAnsi-safe dash
    const DASH = "--";

    // Format minutes helper
    const fmtMin = (m: number | null) => {
      if (m === null || m === 0) return DASH;
      if (m < 1) return `${Math.round(m * 60)}s`;
      if (m < 60) return `${Math.round(m)}m`;
      const hrs = Math.floor(m / 60);
      const mins = Math.round(m % 60);
      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    };

    // Format hours for aging
    const fmtHours = (hours: number) => {
      if (hours < 1) return `${Math.round(hours * 60)}m`;
      if (hours < 24) return `${Math.round(hours)}h`;
      const days = Math.floor(hours / 24);
      const rem = Math.round(hours % 24);
      return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
    };

    // Build PDF
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    const A4_W = 595;
    const A4_H = 842;
    const MARGIN = 40;
    const COL_W = A4_W - 2 * MARGIN;
    let page = doc.addPage([A4_W, A4_H]);
    let y = A4_H - MARGIN;

    const ensureSpace = (needed: number) => {
      if (y - needed < MARGIN) {
        page = doc.addPage([A4_W, A4_H]);
        y = A4_H - MARGIN;
      }
    };

    const drawText = (
      text: string,
      x: number,
      size: number,
      f = font,
      color = rgb(0, 0, 0)
    ) => {
      page.drawText(text, { x, y, size, font: f, color });
    };

    // Title
    drawText("Management Reports", MARGIN, 20, boldFont);
    y -= 28;

    // Filters
    let filterLine = `Period: ${date_from} to ${date_to}`;
    if (country_id) filterLine += ` | Country: ${country_id}`;
    if (workshop_id) filterLine += ` | Workshop: ${workshop_id.substring(0, 8)}..`;
    drawText(filterLine, MARGIN, 9, font, rgb(0.4, 0.4, 0.4));
    y -= 14;

    drawText(
      `Generated: ${new Date().toISOString().replace("T", " ").substring(0, 19)} UTC`,
      MARGIN,
      8,
      font,
      rgb(0.5, 0.5, 0.5)
    );
    y -= 24;

    // KPI Section
    drawText("Key Performance Indicators", MARGIN, 13, boldFont);
    y -= 20;

    // KPI table (2 rows × 4 cols)
    const kpiHeaders = [
      "JC Created",
      "Deliveries",
      "Active Floor",
      "Pending Delivery",
    ];
    const kpiValues = [
      String(kpis.totalCreated),
      String(kpis.totalDelivered),
      String(kpis.activeFloor),
      String(kpis.pendingDelivery),
    ];
    const kpiHeaders2 = [
      "Avg MTTR",
      "Avg Turnaround",
      "Reopen %",
      "Avg Feedback",
    ];
    const kpiValues2 = [
      fmtMin(kpis.avgMttr),
      fmtMin(kpis.avgTurnaround),
      `${kpis.reopenPercent.toFixed(1)}%`,
      kpis.avgFeedback > 0 ? kpis.avgFeedback.toFixed(1) : DASH,
    ];

    const kpiColW = COL_W / 4;
    // Row 1 headers
    for (let i = 0; i < 4; i++) {
      drawText(kpiHeaders[i], MARGIN + i * kpiColW + 4, 8, font, rgb(0.4, 0.4, 0.4));
    }
    y -= 14;
    for (let i = 0; i < 4; i++) {
      drawText(kpiValues[i], MARGIN + i * kpiColW + 4, 14, boldFont);
    }
    y -= 22;
    // Row 2
    for (let i = 0; i < 4; i++) {
      drawText(kpiHeaders2[i], MARGIN + i * kpiColW + 4, 8, font, rgb(0.4, 0.4, 0.4));
    }
    y -= 14;
    for (let i = 0; i < 4; i++) {
      drawText(kpiValues2[i], MARGIN + i * kpiColW + 4, 14, boldFont);
    }
    y -= 30;

    // Separator
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4_W - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 20;

    // Daily Trend Table
    drawText("Daily Created vs Delivered", MARGIN, 13, boldFont);
    y -= 18;

    const trendColWidths = [120, 100, 100];
    const trendHeaders = ["Date", "Created", "Delivered"];

    // Header row
    let tx = MARGIN;
    for (let i = 0; i < trendHeaders.length; i++) {
      drawText(trendHeaders[i], tx + 4, 9, boldFont, rgb(0.2, 0.2, 0.2));
      tx += trendColWidths[i];
    }
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + trendColWidths.reduce((a, b) => a + b, 0), y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 12;

    for (const row of dailyTrend) {
      ensureSpace(14);
      tx = MARGIN;
      drawText(row.date, tx + 4, 8);
      tx += trendColWidths[0];
      drawText(String(row.created), tx + 4, 8);
      tx += trendColWidths[1];
      drawText(String(row.delivered), tx + 4, 8);
      y -= 13;
    }
    y -= 20;

    // Stage TAT
    ensureSpace(100);
    drawText("Stage-wise Average TAT", MARGIN, 13, boldFont);
    y -= 18;

    const tatColWidths = [220, 100];
    tx = MARGIN;
    drawText("Stage", tx + 4, 9, boldFont, rgb(0.2, 0.2, 0.2));
    tx += tatColWidths[0];
    drawText("Avg Time", tx + 4, 9, boldFont, rgb(0.2, 0.2, 0.2));
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + tatColWidths.reduce((a, b) => a + b, 0), y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 12;

    for (const row of stageTat) {
      ensureSpace(14);
      tx = MARGIN;
      drawText(row.stage, tx + 4, 8);
      tx += tatColWidths[0];
      drawText(fmtMin(row.minutes), tx + 4, 8);
      y -= 13;
    }
    y -= 20;

    // ── Aging Data (direct query — service role bypasses RLS/auth.uid checks) ──
    let agingQuery = supabase
      .from("job_cards")
      .select(`
        id,
        jc_number,
        status,
        created_at,
        updated_at,
        vehicles!inner ( reg_no ),
        workshops!inner ( name, country ),
        profiles!job_cards_assigned_to_fkey ( full_name )
      `)
      .in("status", ["INWARDED", "IN_PROGRESS", "READY", "REOPENED"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (country_id) agingQuery = agingQuery.eq("workshops.country", country_id);
    if (workshop_id) agingQuery = agingQuery.eq("workshop_id", workshop_id);

    const { data: agingRaw } = await agingQuery;

    // Also get last audit trail timestamp per JC for idle age
    const agingIds = (agingRaw || []).map((r: any) => r.id);
    let lastStatusMap: Record<string, string> = {};
    if (agingIds.length > 0) {
      const { data: auditRows } = await supabase
        .from("audit_trail")
        .select("job_card_id, created_at")
        .in("job_card_id", agingIds)
        .order("created_at", { ascending: false });
      // Take the max per job_card_id
      (auditRows || []).forEach((a: any) => {
        if (!lastStatusMap[a.job_card_id]) {
          lastStatusMap[a.job_card_id] = a.created_at;
        }
      });
    }

    const aging = (agingRaw || []).map((r: any) => ({
      jc_number: r.jc_number,
      reg_no: r.vehicles?.reg_no || "",
      workshop_name: r.workshops?.name || "",
      current_status: r.status,
      created_at: r.created_at,
      last_status_change_at: lastStatusMap[r.id] || r.updated_at,
    }));

    if (aging.length > 0) {
      // Aging buckets (Total Age)
      const bucketLabels = ["0-2h", "2-6h", "6-24h", ">24h"];
      const bucketCounts = [0, 0, 0, 0];
      aging.forEach((r: any) => {
        const hours = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
        if (hours <= 2) bucketCounts[0]++;
        else if (hours <= 6) bucketCounts[1]++;
        else if (hours <= 24) bucketCounts[2]++;
        else bucketCounts[3]++;
      });

      ensureSpace(80);
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: A4_W - MARGIN, y },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      y -= 20;

      drawText("Aging of Open Job Cards (Total Age)", MARGIN, 13, boldFont);
      y -= 18;

      const agingColWidths = [120, 80];
      tx = MARGIN;
      drawText("Bucket", tx + 4, 9, boldFont, rgb(0.2, 0.2, 0.2));
      tx += agingColWidths[0];
      drawText("Count", tx + 4, 9, boldFont, rgb(0.2, 0.2, 0.2));
      y -= 4;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: MARGIN + agingColWidths.reduce((a: number, b: number) => a + b, 0), y },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 12;

      for (let i = 0; i < 4; i++) {
        ensureSpace(14);
        tx = MARGIN;
        drawText(bucketLabels[i], tx + 4, 8);
        tx += agingColWidths[0];
        drawText(String(bucketCounts[i]), tx + 4, 8);
        y -= 13;
      }
      y -= 20;

      // Stuck Job Cards (Top 10) sorted by total age (oldest first)
      const stuckJcs = [...aging]
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(0, 10);

      if (stuckJcs.length > 0) {
        ensureSpace(60);
        drawText("Stuck Job Cards (Top 10 by Total Age)", MARGIN, 13, boldFont);
        y -= 18;

        const stuckColWidths = [90, 80, 100, 80, 80];
        const stuckHeaders = ["JC #", "Reg No", "Workshop", "Stage", "Total Age"];

        tx = MARGIN;
        for (let i = 0; i < stuckHeaders.length; i++) {
          drawText(stuckHeaders[i], tx + 4, 8, boldFont, rgb(0.2, 0.2, 0.2));
          tx += stuckColWidths[i];
        }
        y -= 4;
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: MARGIN + stuckColWidths.reduce((a: number, b: number) => a + b, 0), y },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        });
        y -= 12;

        for (const jc of stuckJcs) {
          ensureSpace(14);
          const totalAgeHrs = (Date.now() - new Date(jc.created_at).getTime()) / (1000 * 60 * 60);
          tx = MARGIN;
          drawText(jc.jc_number || DASH, tx + 4, 7);
          tx += stuckColWidths[0];
          drawText(jc.reg_no || DASH, tx + 4, 7);
          tx += stuckColWidths[1];
          drawText((jc.workshop_name || DASH).substring(0, 18), tx + 4, 7);
          tx += stuckColWidths[2];
          drawText(jc.current_status || DASH, tx + 4, 7);
          tx += stuckColWidths[3];
          drawText(fmtHours(totalAgeHrs), tx + 4, 7);
          y -= 13;
        }
      }
    }

    const pdfBytes = await doc.save();

    // Log export
    await supabase.from("export_audit_log").insert({
      user_id: userId,
      export_type: "snapshot_pdf",
    });

    const filename = `reports_snapshot_${date_from}_${date_to}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("PDF export error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
