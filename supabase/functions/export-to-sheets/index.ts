import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPREADSHEET_ID = "1PtxlhrtxP1igFhodNbZ6c7vfNQNAR-LoMS_mWcCOjew";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

// ---------- Google Auth ----------
async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );

  const textEncoder = new TextEncoder();
  const signingInput = `${header}.${payload}`;

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    textEncoder.encode(signingInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    throw new Error(`Token exchange failed [${tokenRes.status}]: ${txt}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

// ---------- Sheets helpers with retries ----------
async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, opts);
    if (res.ok || res.status < 500) return res;
    if (attempt < retries) {
      console.warn(`Sheets API ${res.status}, retry ${attempt + 1}/${retries}`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    } else {
      return res;
    }
  }
  throw new Error("Unreachable");
}

async function ensureTab(token: string, tabTitle: string): Promise<void> {
  const res = await fetchWithRetry(
    `${SHEETS_API}/${SPREADSHEET_ID}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await res.json();
  const exists = meta.sheets?.some((s: any) => s.properties.title === tabTitle);
  if (exists) return;

  await fetchWithRetry(`${SHEETS_API}/${SPREADSHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tabTitle } } }],
    }),
  });
}

async function clearAndWrite(
  token: string,
  tabTitle: string,
  headers: string[],
  rows: any[][]
): Promise<number> {
  await fetchWithRetry(
    `${SHEETS_API}/${SPREADSHEET_ID}/values/${encodeURIComponent(tabTitle)}:clear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    }
  );

  const values = [headers, ...rows];
  const CHUNK = 5000;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    const startRow = i + 1;
    const range = `${tabTitle}!A${startRow}`;
    await fetchWithRetry(
      `${SHEETS_API}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: chunk }),
      }
    );
  }

  return rows.length;
}

// ---------- Auth: two paths ----------
async function authenticateCaller(
  req: Request,
  supabase: any
): Promise<{ userId: string; triggeredBy: string }> {
  // Path 1: Cron token (verified against system_settings table)
  const cronToken = req.headers.get("x-cron-token");
  if (cronToken) {
    const { data: setting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "export_cron_token")
      .single();
    if (setting && setting.value === cronToken) {
      return { userId: "cron", triggeredBy: "cron" };
    }
    throw { status: 401, message: "Invalid cron token" };
  }

  // Path 2: Bearer JWT (manual)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw { status: 401, message: "Unauthorized" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } =
    await supabaseUser.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    throw { status: 401, message: "Unauthorized" };
  }

  const userId = claimsData.claims.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (!profile || profile.role !== "system_admin") {
    throw { status: 403, message: "Forbidden: system_admin only" };
  }

  return { userId, triggeredBy: userId };
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Authenticate
    const { triggeredBy } = await authenticateCaller(req, supabase);

    // Advisory lock to prevent overlapping runs (lock id = hash of function name)
    const LOCK_ID = 867530901; // arbitrary unique int
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) throw new Error("SUPABASE_DB_URL not configured");

    const { default: postgres } = await import(
      "https://deno.land/x/postgresjs@v3.4.5/mod.js"
    );
    const sql = postgres(dbUrl, { max: 1 });

    let lockAcquired = false;
    try {
      const [{ pg_try_advisory_lock: acquired }] =
        await sql`SELECT pg_try_advisory_lock(${LOCK_ID})`;
      lockAcquired = acquired;

      if (!lockAcquired) {
        await sql.end();
        return new Response(
          JSON.stringify({ error: "ALREADY_RUNNING", message: "Export already in progress" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Google Sheets auth
      const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
      if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
      const sa: ServiceAccountKey = JSON.parse(saJson);
      const accessToken = await getAccessToken(sa);

      // Query data
      let opsData: any[], issueData: any[], feedbackData: any[];
      opsData = await sql`SELECT * FROM reporting.jc_ops_tat_last7d`;
      issueData = await sql`SELECT * FROM reporting.issue_by_odo_bucket_clean_30d`;
      feedbackData = await sql`SELECT * FROM public.vw_feedback_responses_report`;

      // Write to sheets
      const tabConfigs = [
        { tab: "data_ops", data: opsData },
        { tab: "data_issue", data: issueData },
        { tab: "data_feedback", data: feedbackData },
      ];

      const result: Record<string, number> = {};
      for (const { tab, data } of tabConfigs) {
        await ensureTab(accessToken, tab);
        const headers = data.length > 0 ? Object.keys(data[0]) : [];
        const rows = data.map((r: any) =>
          headers.map((h) => {
            const v = r[h];
            return v === null || v === undefined ? "" : String(v);
          })
        );
        result[`${tab}_rows`] = await clearAndWrite(accessToken, tab, headers, rows);
      }

      // Log success
      await supabase.from("sheet_export_log").insert({
        triggered_by: triggeredBy === "cron" ? null : triggeredBy,
        status: "DONE",
        finished_at: new Date().toISOString(),
        rows_ops: result.data_ops_rows || 0,
        rows_issue: result.data_issue_rows || 0,
        rows_feedback: result.data_feedback_rows || 0,
      });

      // Release lock
      await sql`SELECT pg_advisory_unlock(${LOCK_ID})`;
      await sql.end();

      return new Response(
        JSON.stringify({
          success: true,
          data_ops_rows: result.data_ops_rows,
          data_issue_rows: result.data_issue_rows,
          data_feedback_rows: result.data_feedback_rows,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (innerErr: any) {
      // Log failure
      try {
        await supabase.from("sheet_export_log").insert({
          triggered_by: triggeredBy === "cron" ? null : triggeredBy,
          status: "ERROR",
          finished_at: new Date().toISOString(),
          error: innerErr.message || String(innerErr),
        });
      } catch (_) { /* best effort */ }

      if (lockAcquired) {
        try { await sql`SELECT pg_advisory_unlock(${LOCK_ID})`; } catch (_) {}
      }
      try { await sql.end(); } catch (_) {}
      throw innerErr;
    }
  } catch (err: any) {
    console.error("Export error:", err);
    const status = err.status || 500;
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
