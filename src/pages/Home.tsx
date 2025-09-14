import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { SpotifyAuthButton } from "@/components/spotify-auth-button";
import { Send, Settings, Loader2, AlertCircle, Play } from "lucide-react";
import { useState, useEffect, Fragment } from "react";
import { openAIService, type SongRecommendation } from "@/lib/openai-service";
import { useSpotifyStore } from "@/stores/spotify-store";
import { useConversationHistory } from "@/hooks/useConversationHistory";
import { usePlayedTracks } from "@/hooks/usePlayedTracks";
import {
  useSpotifyQueue,
  useSpotifyPlayback,
  useSkipToTrack,
  useAddToQueue,
} from "@/hooks/useSpotifyQueries";
import type { EnhancedSpotifyTrack } from "@/types/spotify";
import { toast } from "sonner";

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [djMessage, setDjMessage] = useState(
    "Welcome! Request your favorite tracks and I'll add them to the queue!"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [tempApiKey, setTempApiKey] = useState("");
  const [lastRecommendations, setLastRecommendations] =
    useState<SongRecommendation | null>(null);

  const { isAuthenticated: isSpotifyAuthenticated, user: spotifyUser } =
    useSpotifyStore();

  // TanStack Query hooks for Spotify data
  const { data: spotifyQueue } = useSpotifyQueue();
  const { data: playbackState } = useSpotifyPlayback();
  const skipToTrackMutation = useSkipToTrack();
  const addToQueueMutation = useAddToQueue();

  // Conversation and play history hooks
  const { messages, addMessage, getFormattedHistory } =
    useConversationHistory();
  const { addTracks, getRecentTracks } = usePlayedTracks();

  // Load DJ message from conversation history on mount
  useEffect(() => {
    if (typeof window !== "undefined" && messages.length > 0) {
      // Find the last assistant message in the conversation
      const lastAssistantMessage = messages
        .filter((m) => m.role === "assistant")
        .pop();

      if (lastAssistantMessage?.content) {
        setDjMessage(lastAssistantMessage.content);
      }
    }
  }, [messages]); // Re-run when messages change (on mount when loaded from localStorage)

  useEffect(() => {
    // Check if API key exists in localStorage
    if (typeof window !== "undefined") {
      const storedKey = localStorage.getItem("openai_api_key");
      if (storedKey) {
        setApiKey(storedKey);
        openAIService.initialize(storedKey);
      }
    }
  }, []);

  // Note: TanStack Query handles polling automatically based on authentication state

  const handleSaveApiKey = () => {
    if (tempApiKey.trim() && typeof window !== "undefined") {
      localStorage.setItem("openai_api_key", tempApiKey);
      setApiKey(tempApiKey);
      openAIService.initialize(tempApiKey);
      setShowApiKeyDialog(false);
    }
  };

  const handleSend = async () => {
    if (!apiKey) {
      setShowApiKeyDialog(true);
      return;
    }

    if (inputValue.trim()) {
      setIsLoading(true);
      setDjMessage("Let me think about that request...");

      const userMessage = inputValue.trim();

      // Clear input immediately for better UX
      setInputValue("");

      try {
        // Add user message to history
        addMessage({
          role: "user",
          content: userMessage,
        });

        // Get conversation history and recently played tracks
        const conversationHistory = getFormattedHistory();
        const recentTracks = getRecentTracks();

        // Get AI recommendations
        const recommendations = await openAIService.getSongRecommendations(
          userMessage,
          conversationHistory,
          recentTracks
        );

        // Update DJ message
        setDjMessage(recommendations.djNote);
        setLastRecommendations(recommendations);

        // Track recommended songs
        const tracksToAdd = recommendations.recommendations.map((song) => ({
          artist: song.artist,
          title: song.title,
          source: "recommended" as const,
        }));
        addTracks(tracksToAdd);

        // Add AI response to history
        addMessage({
          role: "assistant",
          content: recommendations.djNote,
          recommendations: recommendations.recommendations.map((song) => ({
            artist: song.artist,
            title: song.title,
          })),
        });

        // Automatically add to Spotify if connected and user is Premium
        if (isSpotifyAuthenticated && spotifyUser?.product === "premium") {
          try {
            const tracks = recommendations.recommendations.map((song) => ({
              artist: song.artist,
              title: song.title,
            }));

            const results = await addToQueueMutation.mutateAsync({
              tracks,
              promptSummary: recommendations.promptSummary,
            });

            // Track successfully queued songs
            const successfulTracks = results
              .filter((r) => r.success && r.track)
              .map((r) => ({
                artist: r.track!.artists[0].name,
                title: r.track!.name,
                trackId: r.track!.id,
                source: "queued" as const,
              }));

            if (successfulTracks.length > 0) {
              addTracks(successfulTracks);
            }

            const successCount = results.filter((r) => r.success).length;
            const totalCount = results.length;

            if (successCount === totalCount) {
              toast.success(
                `Added ${successCount} songs to your Spotify queue!`
              );
              if (!playbackState || !playbackState.is_playing) {
                toast.info("Playback started automatically");
              }
            } else if (successCount > 0) {
              toast.warning(
                `Added ${successCount}/${totalCount} songs to queue. Some tracks couldn't be found.`
              );
            } else {
              toast.error("Failed to add songs to Spotify queue");
            }
          } catch (error) {
            if (error instanceof Error) {
              toast.error(error.message);
            }
          }
        }
      } catch (error) {
        console.error("Error getting recommendations:", error);
        setDjMessage(
          "Sorry, I couldn't process that request. Please check your API key and try again."
        );
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl flex flex-col gap-3">
        {/* Header with theme toggle and settings */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img
              src="/vinyl-disc.png"
              alt="VibeDJ Logo"
              className="h-8 w-8 invert dark:invert"
            />
            <h1 className="text-2xl font-bold">VibeDJ</h1>
          </div>
          <div className="flex gap-2">
            <SpotifyAuthButton />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowApiKeyDialog(true)}
              title="API Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>

        {/* Current Queue Card - Fixed size */}
        <Card
          className="overflow-hidden flex flex-col"
          style={{ height: "70vh" }}
        >
          {/* DJ Message at the top */}
          <div className="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-b">
            <div className="flex items-start gap-3">
              <Badge className={`mt-0.5 bg-primary text-primary-foreground ${isLoading ? 'animate-pulse' : ''}`}>
                DJ
              </Badge>
              <div className="flex-1">
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <p className="text-base font-medium leading-relaxed">
                    {djMessage}
                  </p>
                )}
                {lastRecommendations &&
                  isSpotifyAuthenticated &&
                  spotifyUser?.product !== "premium" && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground">
                        <AlertCircle className="inline h-3 w-3 mr-1" />
                        Spotify Premium required to add songs to queue
                      </p>
                    </div>
                  )}
              </div>
            </div>
          </div>

          <CardHeader>
            <CardTitle>Current Queue</CardTitle>
            <CardDescription>
              {playbackState?.is_playing ? "Now playing" : "No active playback"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col">
            {/* Queue Items - Fills available space */}
            <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1">
              {/* Currently Playing */}
              {spotifyQueue?.currently_playing && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={
                          spotifyQueue.currently_playing.album.images[0]?.url
                        }
                        alt={spotifyQueue.currently_playing.album.name}
                        className="w-12 h-12 rounded"
                      />
                      <Badge className="absolute -top-2 -right-2 bg-primary text-[10px] px-1 py-0">
                        NOW
                      </Badge>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {spotifyQueue.currently_playing.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {spotifyQueue.currently_playing.artists
                          .map((a) => a.name)
                          .join(", ")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Queue */}
              {spotifyQueue?.queue && spotifyQueue.queue.length > 0 ? (
                spotifyQueue.queue.map((track, index) => {
                  const currentTrack = track as EnhancedSpotifyTrack;
                  const currentlyPlaying =
                    spotifyQueue.currently_playing as EnhancedSpotifyTrack | null;
                  const previousTrack =
                    index > 0
                      ? (spotifyQueue.queue[index - 1] as EnhancedSpotifyTrack)
                      : null;

                  const showSeparator =
                    currentTrack.promptSummary && // Has a prompt summary
                    currentTrack.promptSummary !==
                      currentlyPlaying?.promptSummary && // Not same as currently playing
                    (index === 0 || // First in queue
                      currentTrack.promptSummary !==
                        previousTrack?.promptSummary); // Different from previous

                  return (
                    <Fragment key={track.id}>
                      {showSeparator && (
                        <div className="py-2">
                          <div className="flex items-center gap-2 px-3">
                            <div className="h-px flex-1 bg-foreground/20" />
                            <span className="text-xs text-foreground/60 font-medium">
                              {currentTrack.promptSummary}
                            </span>
                            <div className="h-px flex-1 bg-foreground/20" />
                          </div>
                        </div>
                      )}
                      <div
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 cursor-pointer transition-colors"
                        onClick={() => {
                          if (spotifyUser?.product === "premium") {
                            skipToTrackMutation.mutate(track.id, {
                              onError: () => {
                                toast.error("Failed to skip to track");
                              },
                            });
                          } else {
                            toast.error(
                              "Spotify Premium required to skip tracks"
                            );
                          }
                        }}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <img
                            src={track.album.images[0]?.url}
                            alt={track.album.name}
                            className="w-10 h-10 rounded"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{track.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {track.artists.map((a) => a.name).join(", ")}
                            </p>
                          </div>
                          <Play className="h-4 w-4 text-muted-foreground fill-muted-foreground" />
                        </div>
                      </div>
                    </Fragment>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {isSpotifyAuthenticated ? (
                    playbackState ? (
                      <p className="text-sm">Queue is empty. Add some songs!</p>
                    ) : (
                      <p className="text-sm">
                        Start playing music on Spotify to see your queue
                      </p>
                    )
                  ) : (
                    <p className="text-sm">Connect Spotify to see your queue</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Request Input Card */}
        <Card>
          <CardContent className="p-2">
            <div className="relative">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder='Try: "Play something like John Mayer Gravity, heartfelt and emotional"'
                className={`w-full px-4 p-2 text-base border-0 bg-transparent shadow-none focus-visible:ring-0 focus:outline-none focus:ring-0 focus:ring-offset-0 ${
                  inputValue.trim() ? "pr-12" : ""
                }`}
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                size="icon"
                disabled={isLoading || !inputValue.trim()}
                className={`absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full transition-all duration-200 ${
                  inputValue.trim()
                    ? "opacity-100 scale-100"
                    : "opacity-0 scale-0 pointer-events-none"
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {!apiKey && (
            <p className="text-xs text-muted-foreground text-center">
              Click the settings icon to add your OpenAI API key
            </p>
          )}
          {!isSpotifyAuthenticated && (
            <p className="text-xs text-muted-foreground text-center">
              Connect Spotify to automatically queue recommended songs
            </p>
          )}
        </div>
      </div>

      {/* API Key Dialog */}
      <Dialog open={showApiKeyDialog} onOpenChange={setShowApiKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>OpenAI API Settings</DialogTitle>
            <DialogDescription>
              Enter your OpenAI API key to enable AI-powered song
              recommendations. Your key is stored locally in your browser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="sk-..."
                value={tempApiKey || apiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowApiKeyDialog(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveApiKey}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
