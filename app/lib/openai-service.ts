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

// Define the schema for the complete response
const SongRecommendationResponse = z.object({
  interpretation: z
    .string()
    .describe("How the AI interpreted the user's request"),
  recommendations: z.array(Song).describe("List of recommended songs"),
  djNote: z
    .string()
    .describe("A friendly DJ message about the recommendations"),
});

export type SongRecommendation = z.infer<typeof SongRecommendationResponse>;

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
    recentlyPlayed: PlayedTrack[] = []
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

    // Build messages array with conversation history
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are an expert DJ with deep knowledge of music across all genres.
          When a user requests songs, you understand the emotional nuance and vibe they're looking for.
          Provide 3-5 song recommendations that match their request.
          Focus on the feeling, emotion, and musical elements they describe.

          Maintain conversation continuity - reference previous requests when relevant.
          Build on the musical journey you've been creating together.${recentTracksContext}`,
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

    const completion = await this.client.chat.completions.parse({
      model: "gpt-5",
      messages,
      response_format: zodResponseFormat(
        SongRecommendationResponse,
        "song_recommendations"
      ),
    });

    const message = completion.choices[0]?.message;
    if (!message?.parsed) {
      throw new Error("Failed to get structured response from OpenAI");
    }

    return message.parsed;
  }
}

export const openAIService = new OpenAIService();
