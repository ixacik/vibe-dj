import { SupabaseAuth } from "./supabase-auth";

export interface SongRecommendation {
  recommendations: Array<{
    artist: string;
    title: string;
    reason: string;
  }>;
  djMessage: string;
  promptSummary: string;
}

export type AIModel = "gpt-5" | "gpt-5-mini";

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
