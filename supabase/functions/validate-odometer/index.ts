import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ValidationResult {
  success: boolean;
  ocrReading: number | null;
  ocrConfidence: number;
  clusterDetected: boolean;
  socReading: number | null;
  socConfidence: number;
  socDetected: boolean;
  error?: string;
}

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

    // Use Gemini vision model to analyze the odometer image
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
            content: `You are an expert at reading vehicle instrument clusters. Your task is to:
1. Detect if an odometer/speedometer cluster is visible in the image
2. Read the odometer value (total kilometers/miles driven)
3. Check if a battery State of Charge (SOC) percentage is also visible
4. If SOC is visible, read its value
5. Provide confidence scores

Respond ONLY with valid JSON in this exact format:
{
  "cluster_detected": true/false,
  "odometer_reading": <number or null if not readable>,
  "confidence": <0-100 percentage>,
  "soc_detected": true/false,
  "soc_reading": <number 0-100 or null if not visible/readable>,
  "soc_confidence": <0-100 percentage, 0 if not detected>,
  "notes": "<brief explanation>"
}

Important:
- Focus on the ODOMETER (total distance), not the speedometer
- If the image is blurry, dark, or unclear, set confidence low
- If no odometer cluster is visible, set cluster_detected to false
- Return the odometer reading as a plain number without units
- SOC is typically shown as a battery percentage (0-100%) on electric vehicle dashboards
- If no SOC indicator is visible, set soc_detected to false and soc_reading to null
- Return SOC as a plain integer (0-100)`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please analyze this odometer image and extract the reading."
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

    // Parse the JSON response
    let parsed;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse odometer reading");
    }

    const result: ValidationResult = {
      success: true,
      ocrReading: parsed.odometer_reading ?? null,
      ocrConfidence: parsed.confidence ?? 0,
      clusterDetected: parsed.cluster_detected ?? false,
      socReading: parsed.soc_reading ?? null,
      socConfidence: parsed.soc_confidence ?? 0,
      socDetected: parsed.soc_detected ?? false,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Validation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        ocrReading: null,
        ocrConfidence: 0,
        clusterDetected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
