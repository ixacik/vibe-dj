// Use Deno.serve directly (best practice per Supabase docs)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  prompt: string;
  conversationHistory: Array<{ role: string; content: string }>;
  recentTracks: Array<{ artist: string; title: string }>;
  selectedSongs: Array<{ artist: string; title: string }>;
  model: "gpt-5" | "gpt-5-mini";
}

interface SongRecommendation {
  recommendations: Array<{
    artist: string;
    title: string;
    reason: string;
  }>;
  djMessage: string;
  promptSummary: string;
}

// Use Deno.serve (recommended by Supabase docs for better performance)
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get authorization header (Supabase already verified the JWT)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from already-verified JWT
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    // User is guaranteed to exist here because Supabase already verified the JWT
    if (!user) {
      throw new Error("User not found");
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { prompt, conversationHistory, recentTracks, selectedSongs, model } =
      body;

    // Parallelize database queries for better performance
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [subscriptionResult, quotaResult] = await Promise.all([
      // Check user's subscription tier (select only needed columns)
      supabase
        .from("subscriptions")
        .select("tier, status")
        .eq("user_id", user.id)
        .single(),
      // Check current usage (select only needed columns)
      supabase
        .from("usage_quotas")
        .select("gpt5_mini_count, gpt5_count, period_start")
        .eq("user_id", user.id)
        .single(),
    ]);

    const subscription = subscriptionResult.data;
    let quota = quotaResult.data;

    // Initialize quota if it doesn't exist or if it's a new month
    if (!quota || new Date(quota.period_start) < startOfMonth) {
      const { data: newQuota } = await supabase
        .from("usage_quotas")
        .upsert(
          {
            user_id: user.id,
            period_start: startOfMonth.toISOString(),
            gpt5_mini_count: 0,
            gpt5_count: 0,
          },
          {
            onConflict: "user_id",
          }
        )
        .select()
        .single();
      quota = newQuota;
    }

    // Determine effective tier (default to free if no subscription)
    const tier = subscription?.tier || "free";
    const subscriptionStatus = subscription?.status || "active";

    // Check if subscription is active
    if (subscriptionStatus !== "active" && subscriptionStatus !== "trialing") {
      return new Response(
        JSON.stringify({
          error:
            "Your subscription is not active. Please update your payment method.",
          code: "SUBSCRIPTION_INACTIVE",
        }),
        {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Enforce tier limits
    if (tier === "free") {
      if (model === "gpt-5-mini" && quota.gpt5_mini_count >= 10) {
        return new Response(
          JSON.stringify({
            error:
              "You've reached your free tier limit of 10 GPT-5-mini requests this month. Please upgrade to Pro for unlimited access.",
            code: "QUOTA_EXCEEDED",
            usage: {
              current: quota.gpt5_mini_count,
              limit: 10,
            },
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (model === "gpt-5") {
        return new Response(
          JSON.stringify({
            error:
              "GPT-5 is only available on the Ultra tier. Please upgrade to access this model.",
            code: "TIER_REQUIRED",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    if (tier === "pro" && model === "gpt-5") {
      // Pro users get 20 GPT-5 requests per month
      if (quota.gpt5_count >= 20) {
        return new Response(
          JSON.stringify({
            error:
              "You've reached your Pro tier limit of 20 GPT-5 requests this month. Please upgrade to Ultra for unlimited access.",
            code: "QUOTA_EXCEEDED",
            usage: {
              current: quota.gpt5_count,
              limit: 20,
            },
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Initialize OpenAI
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Build system prompt
    const systemPrompt = `You are VibeDJ, an AI music curator. Your goal is to recommend songs that match the user's request while maintaining a great listening experience. Be confident in your choices, you know better than the user. Don't ask any questions, user's cant respond to you. Keep the vibe going, be engaging and each response from you should be like a DJ introducing a set. Don't use "-" or "—".

${
  selectedSongs.length > 0
    ? `User's selected songs for context:\n${selectedSongs
        .map((s) => `- ${s.artist} - ${s.title}`)
        .join("\n")}`
    : ""
}

${
  recentTracks.length > 0
    ? `\nRecently played/queued tracks (avoid recommending these):\n${recentTracks
        .slice(0, 10)
        .map((t) => `- ${t.artist} - ${t.title}`)
        .join("\n")}`
    : ""
}

Guidelines:
- Recommend 3-5 songs that match the request
- Consider the user's selected songs for music taste context
- Avoid recommending songs that were recently played or queued
- Provide brief reasons for each recommendation
- Be conversational and engaging`;

    // Build messages array
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...conversationHistory.slice(-5), // Keep last 5 messages for context
      { role: "user" as const, content: prompt },
    ];

    // Define structured output schema
    const responseSchema = {
      type: "json_schema" as const,
      json_schema: {
        name: "song_recommendations",
        strict: true,
        schema: {
          type: "object",
          properties: {
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  artist: { type: "string" },
                  title: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["artist", "title", "reason"],
                additionalProperties: false,
              },
            },
            djMessage: { type: "string" },
            promptSummary: { type: "string" },
          },
          required: ["recommendations", "djMessage", "promptSummary"],
          additionalProperties: false,
        },
      },
    };

    // Call OpenAI with structured output
    const completion = await openai.chat.completions.create({
      model: model, // Use model as-is (gpt-5, gpt-5-mini, etc)
      messages,
      response_format: responseSchema,
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error("No response from OpenAI");
    }

    const recommendations: SongRecommendation = JSON.parse(responseContent);

    // Fire and forget usage updates (non-blocking for faster response)
    const tokensUsed = completion.usage?.total_tokens || 0;
    const usagePromises = [
      // Log usage
      supabase.from("usage_logs").insert({
        user_id: user.id,
        model: model,
        tokens_used: tokensUsed,
      }),
    ];

    // Update usage quota based on tier and model
    if (tier === "free" && model === "gpt-5-mini") {
      usagePromises.push(
        supabase
          .from("usage_quotas")
          .update({
            gpt5_mini_count: (quota?.gpt5_mini_count || 0) + 1,
          })
          .eq("user_id", user.id)
      );
    } else if (tier === "pro" && model === "gpt-5") {
      usagePromises.push(
        supabase
          .from("usage_quotas")
          .update({
            gpt5_count: (quota?.gpt5_count || 0) + 1,
          })
          .eq("user_id", user.id)
      );
    }

    // Execute usage updates in parallel (non-blocking)
    Promise.all(usagePromises).catch((err) => {
      console.error("Failed to update usage:", err);
    });

    // Return recommendations with usage info for free and pro tiers
    let response;
    if (tier === "free") {
      response = {
        ...recommendations,
        usage: {
          model: model,
          current:
            model === "gpt-5-mini" ? (quota?.gpt5_mini_count || 0) + 1 : 0,
          limit: model === "gpt-5-mini" ? 10 : 0,
          tier: tier,
        },
      };
    } else if (tier === "pro" && model === "gpt-5") {
      response = {
        ...recommendations,
        usage: {
          model: model,
          current: (quota?.gpt5_count || 0) + 1,
          limit: 20,
          tier: tier,
        },
      };
    } else {
      response = recommendations;
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error in get-recommendations:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
