import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SpotifyService } from "@/lib/spotify-service";
import { toast } from "sonner";
import { useSpotifyPlayback } from "./useSpotifyQueries";

export function usePlaybackControls() {
  const queryClient = useQueryClient();
  const { data: playbackState } = useSpotifyPlayback();

  const playPauseMutation = useMutation({
    mutationFn: async () => {
      const spotify = SpotifyService.getInstance();
      if (playbackState?.is_playing) {
        await spotify.pausePlayback();
        return false; // New playing state
      } else {
        await spotify.resumePlayback();
        return true; // New playing state
      }
    },
    onSuccess: (newPlayingState) => {
      // Optimistically update the playback state
      queryClient.setQueryData(["spotify", "playback"], (old: any) => ({
        ...old,
        is_playing: newPlayingState,
      }));

      // Refetch after a short delay to ensure sync
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["spotify", "playback"] });
      }, 500);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const skipToNextMutation = useMutation({
    mutationFn: async () => {
      const spotify = SpotifyService.getInstance();
      await spotify.skipToNext();
    },
    onSuccess: () => {
      // Invalidate both queue and playback queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["spotify", "queue"] });
        queryClient.invalidateQueries({ queryKey: ["spotify", "playback"] });
      }, 500);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const skipToPreviousMutation = useMutation({
    mutationFn: async () => {
      const spotify = SpotifyService.getInstance();
      await spotify.skipToPrevious();
    },
    onSuccess: () => {
      // Invalidate both queue and playback queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["spotify", "queue"] });
        queryClient.invalidateQueries({ queryKey: ["spotify", "playback"] });
      }, 500);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const seekMutation = useMutation({
    mutationFn: async (position_ms: number) => {
      const spotify = SpotifyService.getInstance();
      await spotify.seekToPosition(position_ms);
    },
    onSuccess: (_, position_ms) => {
      // Optimistically update the progress
      queryClient.setQueryData(["spotify", "playback"], (old: any) => ({
        ...old,
        progress_ms: position_ms,
      }));

      // Refetch after a short delay to ensure sync
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["spotify", "playback"] });
      }, 1000);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    playPause: playPauseMutation.mutate,
    skipToNext: skipToNextMutation.mutate,
    skipToPrevious: skipToPreviousMutation.mutate,
    seek: seekMutation.mutate,
    isLoading:
      playPauseMutation.isPending ||
      skipToNextMutation.isPending ||
      skipToPreviousMutation.isPending ||
      seekMutation.isPending,
  };
}