import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Loader2,
  AlertCircle,
  Play,
  RotateCcw,
  PlayCircle,
  CheckCircle2,
  Crown,
  Zap,
  Check,
} from "lucide-react";
import { AudioWaveform } from "@/components/audio-waveform";
import { VinylDisc } from "@/components/vinyl-disc";
import { HeartButton } from "@/components/heart-button";
import { LikedSongsCard } from "@/components/liked-songs-card";
import { UsageLimitBadge } from "@/components/usage-limit-badge";
import { PricingModal } from "@/components/pricing-modal";
import { PlaybackControlBar } from "@/components/playback-control-bar";
import { usePlaybackControls } from "@/hooks/usePlaybackControls";
import { useSelectedSongIds } from "@/stores/selected-songs-store";
import { useLikedSongs } from "@/hooks/useLikedSongs";
import { useModelStore } from "@/stores/model-store";
import {
  useSubscriptionStore,
  useSubscriptionTier,
  useSubscriptionUsage,
} from "@/stores/subscription-store";
import { useState, useEffect, Fragment, useCallback, useMemo } from "react";
import {
  OpenAIService,
  type SongRecommendation,
  QuotaExceededError,
  TierRequiredError,
} from "@/lib/openai-service";
import { useSpotifyStore } from "@/stores/spotify-store";
import { useAutoModeStore } from "@/stores/auto-mode-store";
import { useConversationStore } from "@/stores/conversation-store";
import { usePromptContextStore } from "@/stores/prompt-context-store";
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
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [lastRecommendations, setLastRecommendations] =
    useState<SongRecommendation | null>(null);

  const { isAuthenticated: isSpotifyAuthenticated, user: spotifyUser } =
    useSpotifyStore();
  const activePrompt = usePromptContextStore((state) =>
    state.getActivePrompt()
  );
  const clearPromptContexts = usePromptContextStore((state) => state.clearAll);
  const {
    isAutoMode,
    toggleAutoMode,
    lastAutoPromptSummary,
    setLastAutoPrompt,
  } = useAutoModeStore();
  const selectedSongIds = useSelectedSongIds();
  const { allSongs } = useLikedSongs();
  const selectedModel = useModelStore((state) => state.selectedModel);
  const setSelectedModel = useModelStore((state) => state.setSelectedModel);

  // Subscription store hooks
  const tier = useSubscriptionTier();
  const usage = useSubscriptionUsage();
  const { fetchSubscription, fetchUsage } = useSubscriptionStore();

  // Derive selected songs from IDs and all songs
  const selectedSongs = useMemo(() => {
    return allSongs.filter((song) => selectedSongIds.has(song.id));
  }, [allSongs, selectedSongIds]);

  // TanStack Query hooks for Spotify data
  const { data: spotifyQueue } = useSpotifyQueue();
  const { data: playbackState } = useSpotifyPlayback();
  const skipToTrackMutation = useSkipToTrack();
  const addToQueueMutation = useAddToQueue();

  // Playback controls
  const {
    playPause,
    skipToNext,
    skipToPrevious,
    seek,
    isLoading: isControlLoading,
  } = usePlaybackControls();

  // Conversation and play history hooks
  const { messages, addMessage, clearHistory, getFormattedHistory } =
    useConversationStore();
  const { addTracks, getRecentTracks, clearTracks } = usePlayedTracks();

  // Load DJ message from conversation history on mount and fetch subscription
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

    // Fetch subscription status on mount
    fetchSubscription();
    fetchUsage();
  }, [messages, fetchSubscription, fetchUsage]); // Re-run when messages change (on mount when loaded from localStorage)

  // Note: TanStack Query handles polling automatically based on authentication state

  const handleAutoContinue = useCallback(async () => {
    if (isLoading) return;

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

      // Set the DJ message and recommendations immediately
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

      // Add to Spotify queue (fire and forget - non-blocking)
      if (isSpotifyAuthenticated && spotifyUser?.product === "premium") {
        const tracks = recommendations.recommendations.map((song) => ({
          artist: song.artist,
          title: song.title,
        }));

        // Use mutate instead of mutateAsync to avoid blocking
        addToQueueMutation.mutate(
          {
            tracks,
            promptSummary: `Auto: ${recommendations.promptSummary}`,
          },
          {
            onSuccess: (results) => {
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
            },
          }
        );
      }
    } catch (error) {
      console.error("Error in auto-continue:", error);
      setIsLoading(false);
    }
  }, [
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
    if (!isAutoMode || !playbackState?.is_playing) return;

    const currentTrack =
      spotifyQueue?.currently_playing as EnhancedSpotifyTrack | null;

    // Need a valid track to continue
    if (!currentTrack?.id) return;

    // Don't trigger for auto-generated prompts to prevent infinite loops
    if (currentTrack.promptSummary?.startsWith("Auto:")) return;

    // Check if we're on the last track in the entire queue
    const totalQueueLength = (spotifyQueue?.queue || []).length;

    // Only trigger when queue is empty (playing last track)
    if (totalQueueLength === 0) {
      // Create a unique key for this trigger to prevent duplicates
      const triggerKey = `${currentTrack.id}-${Date.now()}`;

      // Check if we haven't already triggered for this specific moment
      if (lastAutoPromptSummary !== triggerKey) {
        setLastAutoPrompt(triggerKey);

        // Small delay to ensure smooth transition and prevent race conditions
        const timeoutId = setTimeout(() => {
          handleAutoContinue();
        }, 2000);

        // Cleanup on unmount or dependency change
        return () => clearTimeout(timeoutId);
      }
    }
  }, [
    spotifyQueue?.currently_playing,
    spotifyQueue?.queue,
    isAutoMode,
    playbackState?.is_playing,
    lastAutoPromptSummary,
    handleAutoContinue,
    setLastAutoPrompt,
  ]);

  const handleResetSession = () => {
    // Clear conversation history
    clearHistory();

    // Clear played tracks history
    clearTracks();

    // Clear prompt contexts
    clearPromptContexts();

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

        // Start all async operations in parallel
        const [recommendations] = await Promise.all([
          // Get AI recommendations - only pass selected songs
          OpenAIService.getSongRecommendations(
            userMessage,
            conversationHistory,
            recentTracks,
            selectedSongs.map((song) => ({
              artist: song.artist,
              title: song.name,
            })),
            selectedModel
          ),
          // Fetch usage in parallel (non-blocking)
          fetchUsage().catch((err) =>
            console.error("Failed to fetch usage:", err)
          ),
        ]);

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
        // Fire and forget - don't block UI updates
        if (isSpotifyAuthenticated && spotifyUser?.product === "premium") {
          const tracks = recommendations.recommendations.map((song) => ({
            artist: song.artist,
            title: song.title,
          }));

          // Add to queue without blocking
          addToQueueMutation.mutate(
            {
              tracks,
              promptSummary: recommendations.promptSummary,
            },
            {
              onSuccess: (results) => {
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
              },
              onError: (error) => {
                if (error instanceof Error) {
                  toast.error(error.message);
                }
              },
            }
          );
        }
      } catch (error) {
        console.error("Error getting recommendations:", error);

        if (error instanceof QuotaExceededError) {
          setUpgradeMessage(error.message);
          setShowUpgradeDialog(true);
          setDjMessage(
            "You've reached your free tier limit. Please upgrade to continue!"
          );
        } else if (error instanceof TierRequiredError) {
          setUpgradeMessage(error.message);
          setShowUpgradeDialog(true);
          setDjMessage(
            "This feature requires an upgrade. Check out our plans!"
          );
        } else {
          setDjMessage(
            "Sorry, I couldn't process that request. Please try again."
          );
        }
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
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      <div className="w-full h-full flex flex-col gap-3 px-4 py-4">
        {/* Header with theme toggle and settings */}
        <div className="flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <VinylDisc size={32} className="text-foreground" />
            <h1 className="-ml-1.5 text-2xl font-bold">VibeDJ</h1>
            <UsageLimitBadge />
          </div>
          <div className="flex items-center gap-2">
            {tier === "free" && (
              <Button
                onClick={() => setShowPricingModal(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 border-0 h-9"
              >
                <Zap className="h-4 w-4 fill-current" />
                Upgrade to Pro
              </Button>
            )}
            <SpotifyAuthButton />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowResetDialog(true)}
              title="Reset Session"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>

        {/* 2-column grid layout that fills remaining space */}
        <div className="grid grid-cols-1 lg:grid-cols-[450px_1fr] gap-3 flex-1 overflow-hidden">
          {/* Left column: Liked Songs */}
          <div className="flex flex-col gap-3 overflow-hidden">
            <LikedSongsCard />
          </div>

          {/* Right column: Queue and Input stacked */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* Current Queue Card - Fixed size */}
            <Card className="overflow-hidden flex flex-col h-full">
              {/* DJ Message at the top - flexible height with min/max constraints */}
              <div className="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-b overflow-y-auto">
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

              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl mb-0">
                      Current Queue
                    </CardTitle>
                    <CardDescription>
                      {playbackState?.is_playing
                        ? "Now playing"
                        : "No active playback"}
                    </CardDescription>
                  </div>
                  {/* Playback Controls - Mini Player */}
                  {spotifyQueue?.currently_playing && (
                    <div className="w-80">
                      <PlaybackControlBar
                        isPlaying={playbackState?.is_playing || false}
                        progress_ms={playbackState?.progress_ms || 0}
                        duration_ms={spotifyQueue.currently_playing.duration_ms}
                        trackId={spotifyQueue.currently_playing.id}
                        onPlayPause={playPause}
                        onNext={skipToNext}
                        onPrevious={skipToPrevious}
                        onSeek={seek}
                        isLoading={isControlLoading}
                        disabled={
                          !isSpotifyAuthenticated ||
                          spotifyUser?.product !== "premium"
                        }
                      />
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden flex flex-col">
                {/* Queue Items - Fills available space */}
                <div className="space-y-2 overflow-y-auto overflow-x-hidden custom-scrollbar flex-1">
                  {/* Currently Playing */}
                  {spotifyQueue?.currently_playing && (
                    <div className="w-full overflow-hidden">
                      {activePrompt && (
                        <div className="py-2">
                          <div className="flex items-center gap-2 px-3">
                            <div className="h-px flex-1 bg-foreground/20" />
                            <span className="text-xs text-foreground/60 font-medium">
                              {activePrompt.summary}
                            </span>
                            <div className="h-px flex-1 bg-foreground/20" />
                          </div>
                        </div>
                      )}
                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <div className="flex items-center gap-3 min-w-0">
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
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="font-medium text-sm truncate overflow-hidden text-ellipsis whitespace-nowrap">
                              {spotifyQueue.currently_playing.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate overflow-hidden text-ellipsis whitespace-nowrap">
                              {spotifyQueue.currently_playing.artists
                                .map((a) => a.name)
                                .join(", ")}
                            </p>
                          </div>
                          <HeartButton track={spotifyQueue.currently_playing} />
                          <AudioWaveform className="h-4 w-4 text-muted-foreground" />
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
                          <div className="w-full overflow-hidden">
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
                              <div className="flex items-center gap-3 flex-1 min-w-0">
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
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <p className="font-medium text-sm truncate overflow-hidden text-ellipsis whitespace-nowrap">
                                    {track.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate overflow-hidden text-ellipsis whitespace-nowrap">
                                    {track.artists
                                      .map((a) => a.name)
                                      .join(", ")}
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
                          isAutoMode ? "Autoqueue is ON" : "Autoqueue is OFF"
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
                        Autoqueue
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
                  <div className="flex items-center gap-2">
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
                    {tier === "pro" && selectedModel === "gpt-5" && usage && (
                      <span className="text-xs text-muted-foreground">
                        {usage.gpt5_count}/20
                      </span>
                    )}
                  </div>
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

        {!isSpotifyAuthenticated && (
          <p className="text-xs text-muted-foreground text-center pb-2">
            Connect Spotify to automatically queue recommended songs
          </p>
        )}
      </div>

      {/* Reset Session Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Session</DialogTitle>
            <DialogDescription>
              This will clear your conversation history and song
              recommendations. Your current queue will be preserved.
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

      {/* Upgrade Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-600" />
              Upgrade Required
            </DialogTitle>
            <DialogDescription className="pt-2">
              {upgradeMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Why upgrade?</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {tier === "free" && (
                  <>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span>Unlimited GPT-5-mini requests</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span>No more monthly limits</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span>Priority support</span>
                    </li>
                  </>
                )}
                {tier === "pro" && (
                  <>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span>20 GPT-5 requests/month</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span>Even better recommendations</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span>Premium support</span>
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowUpgradeDialog(false)}
            >
              Maybe Later
            </Button>
            <Button
              onClick={() => {
                setShowUpgradeDialog(false);
                setShowPricingModal(true);
              }}
              className="gap-2"
            >
              <Crown className="w-4 h-4" />
              View Plans
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing Modal */}
      <PricingModal
        open={showPricingModal}
        onOpenChange={setShowPricingModal}
      />
    </div>
  );
}
