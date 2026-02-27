import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REG_PATTERNS: Record<string, RegExp> = {
  kenya: /^K[A-Z]{3}\d{3}[A-Z]$/,
  uganda: /^U[A-Z]{2}\d{3}[A-Z]{1,2}$/,
  rwanda: /^R[A-Z]{2}\d{3}[A-Z]$/,
};

function getFormatExample(country: string): string {
  const examples: Record<string, string> = {
    kenya: "KXXX000X (e.g., KABC123D)",
    uganda: "UXX000X or UXX000XX (e.g., UAB123C or UAB123CD)",
    rwanda: "RXX000X (e.g., RAB123C)",
  };
  return examples[country] || "Unknown format";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Extract user from auth header
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");

  let userId: string | null = null;
  if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id ?? null;
  }

  try {
    const { imageBase64, workshop_id } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!workshop_id) {
      return new Response(JSON.stringify({ error: "No workshop_id provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get workshop country
    const { data: workshopData, error: wsError } = await supabase
      .from("workshops")
      .select("country")
      .eq("id", workshop_id)
      .single();

    if (wsError || !workshopData) {
      return new Response(JSON.stringify({ error: "Workshop not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const country = workshopData.country?.toLowerCase() ?? "";

    // Get user profile id for audit
    let profileId: string | null = null;
    if (userId) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .single();
      profileId = profileData?.id ?? null;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      await logAudit(supabase, profileId, workshop_id, country, "fail", "model_error");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Call Gemini Vision
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert at reading vehicle registration plates. Your task is to:
1. Determine if the image contains a vehicle registration plate (YES/NO)
2. If YES, extract the registration number text
3. Provide a confidence score

Respond ONLY with valid JSON in this exact format:
{
  "is_plate": true/false,
  "confidence": <0.0 to 1.0>,
  "reg_number": "<extracted text or null>",
  "reason": "<brief explanation or null>"
}

Important:
- Focus on the LICENSE PLATE / REGISTRATION PLATE
- Normalize: uppercase, remove spaces and hyphens
- If the image is blurry, dark, or unclear, set confidence low
- If no plate is visible, set is_plate to false`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Please analyze this image and extract the vehicle registration plate number." },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        await logAudit(supabase, profileId, workshop_id, country, "fail", "model_error");
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        await logAudit(supabase, profileId, workshop_id, country, "fail", "model_error");
        return new Response(JSON.stringify({ error: "AI service credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", response.status);
      await logAudit(supabase, profileId, workshop_id, country, "fail", "model_error");
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      await logAudit(supabase, profileId, workshop_id, country, "fail", "unreadable");
      throw new Error("No response from AI model");
    }

    // Parse JSON response
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      console.error("Failed to parse AI response");
      await logAudit(supabase, profileId, workshop_id, country, "fail", "unreadable");
      return new Response(
        JSON.stringify({ error: "Couldn't read the plate clearly. Please retake in better lighting." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if plate detected
    if (!parsed.is_plate || (parsed.confidence ?? 0) < 0.7) {
      await logAudit(supabase, profileId, workshop_id, country, "fail", parsed.is_plate ? "low_confidence" : "not_a_plate");
      return new Response(
        JSON.stringify({
          success: false,
          error: "This photo doesn't look like a registration plate. Please retake.",
          is_plate: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize reg number
    let regNumber = (parsed.reg_number ?? "").replace(/[\s\-]/g, "").toUpperCase();

    if (!regNumber) {
      await logAudit(supabase, profileId, workshop_id, country, "fail", "unreadable");
      return new Response(
        JSON.stringify({ 
          success: false,
          error: "Couldn't read the plate clearly. Please retake in better lighting." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate format if country has a pattern
    const pattern = REG_PATTERNS[country];
    if (pattern && !pattern.test(regNumber)) {
      const countryName = country.charAt(0).toUpperCase() + country.slice(1);
      await logAudit(supabase, profileId, workshop_id, country, "fail", "format_invalid");
      return new Response(
        JSON.stringify({
          success: false,
          error: `Registration plate format doesn't match the required format for ${countryName}. Expected format: ${getFormatExample(country)}. Please retake or enter manually.`,
          reg_number: regNumber,
          format_invalid: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success
    await logAudit(supabase, profileId, workshop_id, country, "success", null);

    return new Response(
      JSON.stringify({
        success: true,
        reg_number: regNumber,
        confidence: parsed.confidence,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Plate extraction error:", error);
    return new Response(
      JSON.stringify({
        error: "Unable to process image right now. Please enter manually.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function logAudit(
  supabase: any,
  userId: string | null,
  workshopId: string,
  country: string,
  result: string,
  reason: string | null
) {
  try {
    await supabase.from("plate_scan_audit_log").insert({
      user_id: userId ?? "00000000-0000-0000-0000-000000000000",
      workshop_id: workshopId,
      country: country || null,
      result,
      reason,
    });
  } catch (e) {
    console.error("Failed to log audit:", e);
  }
}
