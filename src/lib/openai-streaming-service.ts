import OpenAI from "openai";
import { z } from "zod";
import type { PlayedTrack } from "@/types/conversation";

// Song recommendation schema
const Song = z.object({
  title: z.string().describe("The title of the song"),
  artist: z.string().describe("The artist or band name"),
  reason: z.string().describe("Why this song matches the request"),
  mood: z.string().describe("The mood/vibe of the song"),
});

const SongRecommendations = z.object({
  interpretation: z
    .string()
    .describe("How you interpreted the user's request"),
  recommendations: z
    .array(Song)
    .min(3)
    .max(5)
    .describe("List of 3-5 recommended songs"),
});

export type SongRecommendation = z.infer<typeof SongRecommendations>;

export interface StreamCallbacks {
  onDJMessageChunk: (chunk: string) => void;
  onSongRecommendations: (songs: SongRecommendation) => void;
  onError?: (error: Error) => void;
}

export class OpenAIStreamingService {
  private client: OpenAI | null = null;

  initialize(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  async streamSongRecommendations(
    request: string,
    conversationHistory: Array<{ role: string; content: string }> = [],
    recentlyPlayed: PlayedTrack[] = [],
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (!this.client) {
      throw new Error("OpenAI client not initialized. Please provide an API key.");
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

IMPORTANT: You must respond in two parts:
1. First, a conversational DJ message acknowledging their request and building excitement
2. Then, a JSON block with your song recommendations

The JSON block must follow this exact format:
\`\`\`json
{
  "interpretation": "How you interpreted the request",
  "recommendations": [
    {
      "title": "Song Title",
      "artist": "Artist Name",
      "reason": "Why this matches",
      "mood": "The mood/vibe"
    }
  ]
}
\`\`\`

Focus on the feeling, emotion, and musical elements they describe.
Maintain conversation continuity - reference previous requests when relevant.
Build on the musical journey you've been creating together.${recentTracksContext}`,
      },
    ];

    // Add conversation history (limit to last 10 exchanges)
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

    try {
      // Use streaming completion
      const stream = await this.client.chat.completions.create({
        model: "gpt-5",
        messages,
        stream: true,
      });

      let fullMessage = "";
      let djMessage = "";
      let jsonStarted = false;
      let jsonContent = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullMessage += content;

        // Check if we've hit the JSON block
        if (!jsonStarted) {
          if (fullMessage.includes("```json")) {
            jsonStarted = true;
            // Split at the JSON marker
            const parts = fullMessage.split("```json");
            djMessage = parts[0].trim();
            jsonContent = parts[1] || "";

            // Send the complete DJ message
            callbacks.onDJMessageChunk(djMessage);
          } else {
            // Still streaming DJ message
            callbacks.onDJMessageChunk(content);
          }
        } else {
          // Accumulate JSON content
          jsonContent += content;
        }
      }

      // Parse the JSON recommendations
      if (jsonStarted && jsonContent) {
        try {
          // Remove closing backticks if present
          const cleanJson = jsonContent.replace(/```\s*$/, "").trim();
          const recommendations = JSON.parse(cleanJson) as SongRecommendation;

          // Validate against schema
          const validated = SongRecommendations.parse(recommendations);
          callbacks.onSongRecommendations(validated);
        } catch (parseError) {
          console.error("Failed to parse recommendations:", parseError);
          console.error("JSON content:", jsonContent);
          callbacks.onError?.(new Error("Failed to parse song recommendations"));
        }
      }
    } catch (error) {
      console.error("Error in streaming service:", error);
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}

export const openAIStreamingService = new OpenAIStreamingService();