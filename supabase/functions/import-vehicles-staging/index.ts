import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const bucketName = "imports";
    const fileName = "vehicles_uganda_clean_supabase_upload.csv";

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(fileName);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error: `Failed to download file: ${downloadError?.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const csvText = await fileData.text();
    const rows = parseCSV(csvText);
    const totalProcessed = rows.length;
    let rowsInserted = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 500;

    // Normalize and filter
    const validRows = rows
      .map((r, idx) => {
        const regNo = (r["reg_no"] || "").trim().toUpperCase();
        if (!regNo) {
          errors.push(`Row ${idx + 2}: empty reg_no, skipped`);
          return null;
        }
        return {
          reg_no: regNo,
          owner_name: (r["owner_name"] || "").trim() || null,
          owner_phone: r["owner_phone"] || null,
          model: (r["model"] || "").trim() || null,
          color: (r["color"] || "").trim() || null,
          purchase_date: r["purchase_date"] || null,
          last_service_date: r["last_service_date"] || null,
          last_service_odo: r["last_service_odo"] ? parseInt(r["last_service_odo"], 10) || null : null,
        };
      })
      .filter(Boolean);

    // Batch insert
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const { error: insertError, count } = await supabase
        .from("vehicles_import_staging")
        .insert(batch);

      if (insertError) {
        errors.push(`Batch starting at row ${i}: ${insertError.message}`);
      } else {
        rowsInserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({ total_processed: totalProcessed, rows_inserted: rowsInserted, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
