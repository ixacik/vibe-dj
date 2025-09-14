import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { SpotifyService } from '@/lib/spotify-service';
import { useSpotifyStore } from '@/stores/spotify-store';
import { useQueueTrackingStore } from '@/stores/queue-tracking-store';
import type { SpotifyQueue, SpotifyTrack } from '@/types/spotify';

/**
 * Filter queue to only show tracks we've added
 * Also deduplicates currently playing track from queue
 */
function filterUserQueue(queue: SpotifyQueue | null, isUserQueued: (id: string) => boolean): SpotifyQueue | null {
  if (!queue) return queue;

  // First deduplicate currently playing
  let filteredQueue = queue.queue;
  if (queue.currently_playing) {
    filteredQueue = filteredQueue.filter(track => track.id !== queue.currently_playing?.id);
  }

  // Then filter to only user-added tracks
  filteredQueue = filteredQueue.filter(track => isUserQueued(track.id));

  return {
    ...queue,
    queue: filteredQueue
  };
}

/**
 * Hook for fetching and managing Spotify queue with smart polling
 */
export function useSpotifyQueue() {
  const isAuthenticated = useSpotifyStore(state => state.isAuthenticated);
  const { isUserQueued, removeQueuedTrack, cleanupOldTracks } = useQueueTrackingStore();

  return useQuery({
    queryKey: ['spotify', 'queue'],
    queryFn: async () => {
      const spotify = SpotifyService.getInstance();
      const queue = await spotify.getQueue();

      // Clean up old tracks periodically
      cleanupOldTracks();

      // Filter to only show user-added tracks
      return filterUserQueue(queue, isUserQueued);
    },
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      // Poll faster when music is playing, slower when paused/stopped
      const data = query.state.data;
      if (!data) return 10000; // 10s when no data
      return data.currently_playing ? 3000 : 10000; // 3s playing, 10s paused
    },
    staleTime: 2000,
  });
}

/**
 * Hook for fetching playback state and tracking played songs
 */
export function useSpotifyPlayback() {
  const isAuthenticated = useSpotifyStore(state => state.isAuthenticated);
  const { removeQueuedTrack } = useQueueTrackingStore();
  const lastPlayingTrackId = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['spotify', 'playback'],
    queryFn: async () => {
      const spotify = SpotifyService.getInstance();
      return spotify.getCurrentPlayback();
    },
    enabled: isAuthenticated,
    refetchInterval: 5000, // Check every 5 seconds
    staleTime: 3000,
  });

  // Remove track from our tracking when it starts playing
  useEffect(() => {
    if (query.data?.item && 'id' in query.data.item) {
      const currentTrackId = query.data.item.id;

      // Only remove if this is a new track (not the same one as before)
      if (currentTrackId !== lastPlayingTrackId.current) {
        lastPlayingTrackId.current = currentTrackId;
        removeQueuedTrack(currentTrackId);
      }
    }
  }, [query.data, removeQueuedTrack]);

  return query;
}

/**
 * Hook for skipping to a specific track with optimistic updates
 */
export function useSkipToTrack() {
  const queryClient = useQueryClient();
  const { removeQueuedTrack } = useQueueTrackingStore();

  return useMutation({
    mutationFn: async (targetTrackId: string) => {
      const spotify = SpotifyService.getInstance();

      // Get current queue to find track position
      const currentQueue = queryClient.getQueryData<SpotifyQueue | null>(['spotify', 'queue']);
      if (!currentQueue?.queue) {
        throw new Error('No queue available');
      }

      const targetIndex = currentQueue.queue.findIndex(track => track.id === targetTrackId);
      if (targetIndex === -1) {
        throw new Error('Track not found in queue');
      }

      // Skip to the track (Spotify doesn't have direct play-by-id for queue items)
      // We'll skip multiple times to reach the target
      for (let i = 0; i <= targetIndex; i++) {
        await spotify.skipToNext();
        // Small delay to avoid rate limiting
        if (i < targetIndex) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Remove the track from our tracking since it's now playing
      removeQueuedTrack(targetTrackId);

      return targetTrackId;
    },
    onMutate: async (targetTrackId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['spotify', 'queue'] });

      // Snapshot the previous value
      const previousQueue = queryClient.getQueryData<SpotifyQueue | null>(['spotify', 'queue']);

      // Optimistically update the queue
      if (previousQueue) {
        const targetTrack = previousQueue.queue.find(t => t.id === targetTrackId);
        if (targetTrack) {
          queryClient.setQueryData<SpotifyQueue>(['spotify', 'queue'], {
            currently_playing: targetTrack,
            queue: previousQueue.queue.filter(t => t.id !== targetTrackId)
          });
        }
      }

      return { previousQueue };
    },
    onError: (err, targetTrackId, context) => {
      // Rollback on error
      if (context?.previousQueue) {
        queryClient.setQueryData(['spotify', 'queue'], context.previousQueue);
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: ['spotify', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['spotify', 'playback'] });
    },
  });
}

/**
 * Hook for adding tracks to queue
 */
export function useAddToQueue() {
  const queryClient = useQueryClient();
  const addTracksToQueue = useSpotifyStore(state => state.addTracksToQueue);
  const { addQueuedTracks } = useQueueTrackingStore();

  return useMutation({
    mutationFn: async (tracks: Array<{ artist: string; title: string }>) => {
      const spotify = SpotifyService.getInstance();

      // Check if anything is currently playing
      const playbackState = await spotify.getCurrentPlayback();

      // If nothing is playing, start playback first
      if (!playbackState || !playbackState.is_playing) {
        try {
          await spotify.startPlayback();
          // Small delay to let playback start
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.warn('Could not start playback automatically:', error);
          // Continue anyway - user might need to manually start playback
        }
      }

      const results = await addTracksToQueue(tracks);

      // Track successfully added items
      const successfulTracks = results
        .filter(r => r.success && r.track)
        .map(r => ({
          id: r.track!.id,
          addedAt: Date.now(),
          artist: r.track!.artists[0].name,
          title: r.track!.name,
        }));

      if (successfulTracks.length > 0) {
        addQueuedTracks(successfulTracks);
      }

      return results;
    },
    onSuccess: () => {
      // Invalidate queue to refetch latest state
      queryClient.invalidateQueries({ queryKey: ['spotify', 'queue'] });
    },
  });
}