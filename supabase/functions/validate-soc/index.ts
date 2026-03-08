import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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
            content: `You are an expert at reading vehicle dashboard displays. Your task is to:
1. Detect if a vehicle dashboard/instrument cluster is visible in the image
2. Read the battery State of Charge (SOC) percentage displayed
3. Check for image quality issues (glare, blur, orientation)
4. Provide a confidence score

Respond ONLY with valid JSON in this exact format:
{
  "dashboard_detected": true/false,
  "soc_reading": <number 0-100 or null if not readable>,
  "confidence": <0-100 percentage>,
  "has_glare": true/false,
  "is_rotated": true/false,
  "notes": "<brief explanation>"
}

Important:
- Focus on the BATTERY SOC percentage indicator
- SOC is typically shown as a percentage (0-100%) on electric vehicle dashboards
- If the image is blurry, dark, or unclear, set confidence low
- If no dashboard/SOC display is visible, set dashboard_detected to false
- Check for glare or reflections that obscure the reading
- Check if the image appears rotated or upside down
- Return the reading as a plain integer (0-100)`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please analyze this dashboard image and extract the battery State of Charge (SOC) percentage. Also check for glare, rotation, and image quality issues."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI model");
    }

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse SOC reading");
    }

    return new Response(
      JSON.stringify({
        success: true,
        socReading: parsed.soc_reading ?? null,
        confidence: parsed.confidence ?? 0,
        dashboardDetected: parsed.dashboard_detected ?? false,
        hasGlare: parsed.has_glare ?? false,
        isRotated: parsed.is_rotated ?? false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SOC validation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        socReading: null,
        confidence: 0,
        dashboardDetected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
