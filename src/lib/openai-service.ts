import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { PlayedTrack } from "@/types/conversation";

// Define the schema for a song recommendation
const Song = z.object({
  title: z.string().describe("The title of the song"),
  artist: z.string().describe("The artist or band name"),
  reason: z.string().describe("Why this song matches the request"),
  mood: z.string().describe("The mood/vibe of the song"),
});

// Define the schema for the complete response - single structured output
const DJResponse = z.object({
  djMessage: z
    .string()
    .describe(
      "A fun, casual DJ message about the vibe you're creating. Be playful and confident. Don't list song titles, just talk naturally like you're introducing the next set."
    ),
  promptSummary: z
    .string()
    .describe(
      "A brief one-sentence summary of what the user requested (e.g., 'Songs for a chill evening', 'Upbeat party music', 'Melancholic indie tracks')"
    ),
  recommendations: z
    .array(Song)
    .min(4)
    .max(5)
    .describe("List of 4-5 recommended songs"),
});

export type SongRecommendation = z.infer<typeof DJResponse>;

export class OpenAIService {
  private client: OpenAI | null = null;

  initialize(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true, // Required for client-side usage
    });
  }

  async getSongRecommendations(
    request: string,
    conversationHistory: Array<{ role: string; content: string }> = [],
    recentlyPlayed: PlayedTrack[] = [],
    lovedSongs: Array<{ artist: string; title: string }> = []
  ): Promise<SongRecommendation> {
    if (!this.client) {
      throw new Error(
        "OpenAI client not initialized. Please provide an API key."
      );
    }

    // Format recently played tracks for context
    const recentTracksContext =
      recentlyPlayed.length > 0
        ? `\n\nRECENTLY PLAYED (last 30 minutes - avoid repeating unless specifically requested):
${recentlyPlayed.map((t) => `- ${t.artist} - ${t.title}`).join("\n")}`
        : "";

    // Format loved songs for context
    const lovedSongsContext =
      lovedSongs.length > 0
        ? `\n\nUSER'S LOVED SONGS (use these to understand their taste and preferences):
${lovedSongs.slice(0, 10).map((s) => `- ${s.artist} - ${s.title}`).join("\n")}`
        : "";

    // Build messages array with conversation history
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are a fun, casual DJ vibing with your friend.
          When someone requests songs, respond with:
          1. A short conversational message about the vibe you're creating (don't list song titles, just talk naturally)
          2. Exactly 4-5 song recommendations that match their request

          NEVER ask questions or seek clarification. Just confidently interpret their request and set the mood.
          Be playful and confident about what you're about to play.${recentTracksContext}${lovedSongsContext}`,
      },
    ];

    // Add conversation history (limit to last 10 exchanges to avoid token limits)
    const recentHistory = conversationHistory.slice(-10);
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    });

    // Add current request
    messages.push({
      role: "user",
      content: request,
    });

    // Single structured request - no streaming
    const completion = await this.client.chat.completions.parse({
      model: "gpt-5-mini",
      reasoning_effort: "medium",
      messages,
      response_format: zodResponseFormat(DJResponse, "dj_response"),
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error("Failed to get structured response from OpenAI");
    }

    return parsed;
  }
}

export const openAIService = new OpenAIService();