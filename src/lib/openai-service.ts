import { SupabaseAuth } from "./supabase-auth";

export interface SongRecommendation {
  recommendations: Array<{
    artist: string;
    title: string;
    reason: string;
  }>;
  djMessage: string;
  promptSummary: string;
  usage?: {
    model: string;
    current: number;
    limit: number;
    tier: string;
  };
}

export type AIModel = "gpt-5" | "gpt-5-mini";

export class QuotaExceededError extends Error {
  code: string;
  usage?: {
    current: number;
    limit: number;
  };

  constructor(message: string, code: string, usage?: { current: number; limit: number }) {
    super(message);
    this.name = "QuotaExceededError";
    this.code = code;
    this.usage = usage;
  }
}

export class TierRequiredError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TierRequiredError";
    this.code = code;
  }
}

export class OpenAIService {
  static async getSongRecommendations(
    prompt: string,
    conversationHistory: Array<{ role: string; content: string }>,
    recentTracks: Array<{ artist: string; title: string }>,
    selectedSongs: Array<{ artist: string; title: string }>,
    model: AIModel = "gpt-5-mini"
  ): Promise<SongRecommendation> {
    // Get the current session for auth
    const session = await SupabaseAuth.getSession();
    if (!session) {
      throw new Error("Not authenticated");
    }

    // Get Supabase project URL from environment
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error("Supabase URL not configured");
    }

    // Call the Edge Function
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-recommendations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          prompt,
          conversationHistory,
          recentTracks,
          selectedSongs,
          model,
        }),
      }
    );

    if (response.status === 402) {
      const error = await response.json();
      if (error.code === "QUOTA_EXCEEDED") {
        throw new QuotaExceededError(error.error, error.code, error.usage);
      } else if (error.code === "TIER_REQUIRED") {
        throw new TierRequiredError(error.error, error.code);
      } else if (error.code === "SUBSCRIPTION_INACTIVE") {
        throw new Error(error.error);
      }
    }

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to get recommendations" }));
      throw new Error(error.error || "Failed to get recommendations");
    }

    const data: SongRecommendation = await response.json();
    return data;
  }
}
