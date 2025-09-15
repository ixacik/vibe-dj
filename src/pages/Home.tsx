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
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { SpotifyAuthButton } from "@/components/spotify-auth-button";
import {
  Send,
  Settings,
  Loader2,
  AlertCircle,
  Play,
  Eye,
  EyeOff,
  Trash2,
  RotateCcw,
  PlayCircle,
  CheckCircle2,
} from "lucide-react";
import { AudioWaveform } from "@/components/audio-waveform";
import { VinylDisc } from "@/components/vinyl-disc";
import { HeartButton } from "@/components/heart-button";
import { LikedSongsCard } from "@/components/liked-songs-card";
import { useSelectedSongs } from "@/contexts/selected-songs-context";
import { useLikedSongs } from "@/hooks/useLikedSongs";
import { useModelStore } from "@/stores/model-store";
import { useState, useEffect, Fragment, useCallback, useMemo } from "react";
import { OpenAIService, type SongRecommendation } from "@/lib/openai-service";
import { useSpotifyStore } from "@/stores/spotify-store";
import { useAutoModeStore } from "@/stores/auto-mode-store";
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
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [tempApiKey, setTempApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [lastRecommendations, setLastRecommendations] =
    useState<SongRecommendation | null>(null);

  const { isAuthenticated: isSpotifyAuthenticated, user: spotifyUser } =
    useSpotifyStore();
  const {
    isAutoMode,
    toggleAutoMode,
    lastAutoPromptSummary,
    setLastAutoPrompt,
  } = useAutoModeStore();
  const { selectedSongIds } = useSelectedSongs();
  const { allSongs } = useLikedSongs();
  const selectedModel = useModelStore((state) => state.selectedModel);
  const setSelectedModel = useModelStore((state) => state.setSelectedModel);

  // Derive selected songs from IDs and all songs
  const selectedSongs = useMemo(() => {
    return allSongs.filter(song => selectedSongIds.has(song.id));
  }, [allSongs, selectedSongIds]);

  // TanStack Query hooks for Spotify data
  const { data: spotifyQueue } = useSpotifyQueue();
  const { data: playbackState } = useSpotifyPlayback();
  const skipToTrackMutation = useSkipToTrack();
  const addToQueueMutation = useAddToQueue();

  // Conversation and play history hooks
  const { messages, addMessage, clearHistory, getFormattedHistory } =
    useConversationHistory();
  const { addTracks, getRecentTracks, clearTracks } = usePlayedTracks();

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
      }
    }
  }, []);

  // Reset tempApiKey when dialog opens
  useEffect(() => {
    if (showApiKeyDialog) {
      setTempApiKey(apiKey);
      setShowApiKey(false);
    }
  }, [showApiKeyDialog, apiKey]);

  // Note: TanStack Query handles polling automatically based on authentication state

  const handleAutoContinue = useCallback(async () => {
    if (!apiKey || isLoading) return;

    setIsLoading(true);

    try {
      // Add auto message to history
      addMessage({
        role: "user",
        content: "Continue the vibe",
      });

      // Get conversation history and recently played tracks
      const conversationHistory = getFormattedHistory();
      const recentTracks = getRecentTracks();

      // Get AI recommendations - only pass selected songs
      const recommendations = await OpenAIService.getSongRecommendations(
        "Continue the vibe",
        conversationHistory,
        recentTracks,
        selectedSongs.map((song) => ({
          artist: song.artist,
          title: song.name,
        })),
        selectedModel
      );

      // Set the DJ message and recommendations
      setDjMessage(recommendations.djMessage);
      setLastRecommendations(recommendations);
      setIsLoading(false);

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
        content: recommendations.djMessage,
        recommendations: recommendations.recommendations.map((song) => ({
          artist: song.artist,
          title: song.title,
        })),
      });

      // Add to Spotify queue
      if (isSpotifyAuthenticated && spotifyUser?.product === "premium") {
        const tracks = recommendations.recommendations.map((song) => ({
          artist: song.artist,
          title: song.title,
        }));

        const results = await addToQueueMutation.mutateAsync({
          tracks,
          promptSummary: `Auto: ${recommendations.promptSummary}`,
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
      }
    } catch (error) {
      console.error("Error in auto-continue:", error);
      setIsLoading(false);
    }
  }, [
    apiKey,
    isLoading,
    addMessage,
    getFormattedHistory,
    getRecentTracks,
    addTracks,
    isSpotifyAuthenticated,
    spotifyUser,
    addToQueueMutation,
  ]);

  // Auto-mode detection logic
  useEffect(() => {
    if (!isAutoMode || !playbackState?.is_playing || !apiKey) return;

    const currentTrack =
      spotifyQueue?.currently_playing as EnhancedSpotifyTrack | null;
    if (!currentTrack?.promptGroupId || !currentTrack?.promptSummary) return;

    // Don't trigger for auto-generated prompts to prevent infinite loops
    if (currentTrack.promptSummary.startsWith("Auto:")) return;

    // Check if this is the last track of its prompt group
    const remainingFromGroup = (spotifyQueue?.queue || []).filter(
      (t) =>
        (t as EnhancedSpotifyTrack).promptGroupId === currentTrack.promptGroupId
    );

    // If no more tracks from this group and we haven't already triggered for this group
    if (
      remainingFromGroup.length === 0 &&
      lastAutoPromptSummary !== currentTrack.promptSummary
    ) {
      setLastAutoPrompt(currentTrack.promptSummary);
      // Small delay to ensure smooth transition
      setTimeout(() => {
        handleAutoContinue();
      }, 2000);
    }
  }, [
    spotifyQueue?.currently_playing,
    isAutoMode,
    apiKey,
    lastAutoPromptSummary,
    handleAutoContinue,
    setLastAutoPrompt,
    spotifyQueue?.queue,
  ]);

  const handleSaveApiKey = () => {
    if (typeof window !== "undefined") {
      if (tempApiKey.trim()) {
        localStorage.setItem("openai_api_key", tempApiKey);
        setApiKey(tempApiKey);
      } else {
        // Clear the key if empty
        localStorage.removeItem("openai_api_key");
        setApiKey("");
      }
      setShowApiKeyDialog(false);
    }
  };

  const handleClearApiKey = () => {
    setTempApiKey("");
    if (typeof window !== "undefined") {
      localStorage.removeItem("openai_api_key");
      setApiKey("");
    }
  };

  const handleResetSession = () => {
    // Clear conversation history
    clearHistory();

    // Clear played tracks history
    clearTracks();

    // Reset DJ message to default welcome message
    setDjMessage(
      "Welcome! Request your favorite tracks and I'll add them to the queue!"
    );

    // Clear last recommendations
    setLastRecommendations(null);

    // Close the dialog
    setShowResetDialog(false);

    // Show success toast
    toast.success("Session reset successfully");
  };

  const handleSend = async () => {
    if (!apiKey) {
      setShowApiKeyDialog(true);
      return;
    }

    if (inputValue.trim()) {
      // Always reset to loading state for new requests
      setIsLoading(true);

      const userMessage = inputValue.trim();

      // Clear input immediately for better UX
      setInputValue("");
      // Reset textarea height
      const textarea = document.querySelector("textarea");
      if (textarea) {
        textarea.style.height = "36px";
      }

      try {
        // Add user message to history
        addMessage({
          role: "user",
          content: userMessage,
        });

        // Get conversation history and recently played tracks
        const conversationHistory = getFormattedHistory();
        const recentTracks = getRecentTracks();

        // Get AI recommendations - only pass selected songs
        const recommendations = await OpenAIService.getSongRecommendations(
          userMessage,
          conversationHistory,
          recentTracks,
          selectedSongs.map((song) => ({
            artist: song.artist,
            title: song.name,
          })),
          selectedModel
        );

        // Set the DJ message and recommendations
        setDjMessage(recommendations.djMessage);
        setLastRecommendations(recommendations);
        setIsLoading(false);

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
          content: recommendations.djMessage,
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

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-6xl w-full flex flex-col gap-3">
        {/* Header with theme toggle and settings */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <VinylDisc size={32} className="text-foreground" />
            <h1 className="text-2xl font-bold">VibeDJ</h1>
          </div>
          <div className="flex gap-2">
            <SpotifyAuthButton />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowResetDialog(true)}
              title="Reset Session"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
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

        {/* 2-column grid layout with fixed height */}
        <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-3 h-[80vh]">
          {/* Left column: Liked Songs - stretches to match right column */}
          <LikedSongsCard />

          {/* Right column: Queue and Input stacked */}
          <div className="flex flex-col gap-3">
            {/* Current Queue Card - Fixed size */}
            <Card className="overflow-hidden flex flex-col h-full">
              {/* DJ Message at the top */}
              <div className="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-b">
                <div className="flex items-start gap-3">
                  <Badge
                    className={`mt-0.5 bg-primary text-primary-foreground ${
                      isLoading ? "animate-pulse" : ""
                    }`}
                  >
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
                <CardTitle className="text-xl mb-0">Current Queue</CardTitle>
                <CardDescription>
                  {playbackState?.is_playing
                    ? "Now playing"
                    : "No active playback"}
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
                              spotifyQueue.currently_playing.album.images[0]
                                ?.url
                            }
                            alt={spotifyQueue.currently_playing.album.name}
                            className="w-12 h-12 rounded"
                          />
                          <Badge className="absolute -top-2 -right-2 bg-primary text-[10px] px-1 py-0">
                            NOW
                          </Badge>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {spotifyQueue.currently_playing.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {spotifyQueue.currently_playing.artists
                              .map((a) => a.name)
                              .join(", ")}
                          </p>
                        </div>
                        <HeartButton track={spotifyQueue.currently_playing} />
                        <AudioWaveform className="h-4 w-4 text-muted-foreground" />
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
                          ? (spotifyQueue.queue[
                              index - 1
                            ] as EnhancedSpotifyTrack)
                          : null;

                      const showSeparator =
                        currentTrack.promptGroupId && // Has a prompt group
                        currentTrack.promptGroupId !==
                          currentlyPlaying?.promptGroupId && // Not same group as currently playing
                        (index === 0 || // First in queue
                          currentTrack.promptGroupId !==
                            previousTrack?.promptGroupId); // Different group from previous

                      // Check if this is an optimistic track
                      const isOptimistic = (track as any)._optimistic;

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
                            className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                              isOptimistic
                                ? "bg-muted/30 opacity-60 cursor-wait"
                                : "bg-muted/50 hover:bg-muted/70 cursor-pointer"
                            }`}
                            onClick={() => {
                              if (
                                !isOptimistic &&
                                spotifyUser?.product === "premium"
                              ) {
                                skipToTrackMutation.mutate(track.id, {
                                  onError: () => {
                                    toast.error("Failed to skip to track");
                                  },
                                });
                              } else if (!isOptimistic) {
                                toast.error(
                                  "Spotify Premium required to skip tracks"
                                );
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <div className="relative">
                                <img
                                  src={
                                    track.album.images[0]?.url ||
                                    "/vinyl-disc.svg"
                                  }
                                  alt={track.album.name}
                                  className="w-10 h-10 rounded"
                                />
                                {isOptimistic && (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {track.name}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {track.artists.map((a) => a.name).join(", ")}
                                </p>
                              </div>
                              {isOptimistic ? (
                                <Badge variant="outline" className="text-xs">
                                  Adding...
                                </Badge>
                              ) : (
                                <>
                                  <HeartButton track={track} />
                                  <Play className="h-3.5 w-3.5 text-muted-foreground fill-muted-foreground" />
                                </>
                              )}
                            </div>
                          </div>
                        </Fragment>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      {isSpotifyAuthenticated ? (
                        playbackState ? (
                          <p className="text-sm">
                            Queue is empty. Add some songs!
                          </p>
                        ) : (
                          <p className="text-sm">
                            Start playing music on Spotify to see your queue
                          </p>
                        )
                      ) : (
                        <p className="text-sm">
                          Connect Spotify to see your queue
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Request Input Card */}
            <Card className="relative">
              <CardContent className="p-2">
                <div className="relative flex items-center gap-2">
                  {/* Auto mode toggle */}
                  {isSpotifyAuthenticated &&
                    spotifyUser?.product === "premium" && (
                      <Button
                        variant={isAutoMode ? "default" : "outline"}
                        size="sm"
                        onClick={toggleAutoMode}
                        className="shrink-0 gap-1.5"
                        title={
                          isAutoMode ? "Autoplay is ON" : "Autoplay is OFF"
                        }
                      >
                        <div className="relative w-4 h-4">
                          <PlayCircle
                            className={`w-4 h-4 absolute inset-0 transition-all duration-300 ${
                              isAutoMode
                                ? "opacity-0 scale-50 rotate-180"
                                : "opacity-100 scale-100 rotate-0"
                            }`}
                          />
                          <CheckCircle2
                            className={`w-4 h-4 absolute inset-0 transition-all duration-300 ${
                              isAutoMode
                                ? "opacity-100 scale-100 rotate-0 animate-bounce-in"
                                : "opacity-0 scale-50 -rotate-180"
                            }`}
                          />
                        </div>
                        Autoplay
                      </Button>
                    )}
                  <div className="relative flex-1 flex items-center">
                    <textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder='Try: "Play something like John Mayer Gravity"'
                      rows={1}
                      className={`w-full px-4 py-2 text-base border-0 bg-transparent shadow-none focus-visible:ring-0 focus:outline-none focus:ring-0 focus:ring-offset-0 resize-none overflow-hidden leading-tight placeholder-truncate ${
                        inputValue.trim() ? "pr-12" : ""
                      }`}
                      style={{
                        minHeight: "36px",
                        maxHeight: "80px",
                        height: "36px",
                        lineHeight: "1.25",
                      }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = "36px";
                        target.style.height =
                          Math.min(target.scrollHeight, 80) + "px";
                      }}
                      disabled={
                        isLoading ||
                        (isSpotifyAuthenticated &&
                          spotifyUser?.product === "premium" &&
                          !playbackState?.is_playing)
                      }
                    />
                    <Button
                      onClick={handleSend}
                      size="icon"
                      disabled={
                        isLoading ||
                        !inputValue.trim() ||
                        (isSpotifyAuthenticated &&
                          spotifyUser?.product === "premium" &&
                          !playbackState?.is_playing)
                      }
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
                  {/* Model selector */}
                  <Select
                    value={selectedModel}
                    onValueChange={(value) =>
                      setSelectedModel(value as "gpt-5" | "gpt-5-mini")
                    }
                  >
                    <SelectTrigger className="w-[130px] h-9 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="gpt-5">GPT-5</SelectItem>
                      <SelectItem value="gpt-5-mini">GPT-5 Mini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
              {/* Overlay message when Spotify is not playing */}
              {isSpotifyAuthenticated &&
                spotifyUser?.product === "premium" &&
                !playbackState?.is_playing && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
                    <div className="text-center px-4">
                      <p className="text-sm font-medium">
                        Start playing music on Spotify to send your first
                        request
                      </p>
                    </div>
                  </div>
                )}
            </Card>
          </div>
        </div>

        <div className="space-y-2 mt-3">
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
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  className="pr-20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleClearApiKey}
                    disabled={!tempApiKey}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {tempApiKey && !tempApiKey.startsWith("sk-") && (
                <p className="text-xs text-destructive">
                  API key should start with 'sk-'
                </p>
              )}
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

      {/* Reset Session Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Session</DialogTitle>
            <DialogDescription>
              This will clear your conversation history and song
              recommendations. Your current queue and API key will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetSession}>
              Reset Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
