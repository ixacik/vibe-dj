import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { SpotifyService } from '@/lib/spotify-service';
import { useSpotifyStore } from '@/stores/spotify-store';
import { useQueueTrackingStore } from '@/stores/queue-tracking-store';
import { usePromptGroupsStore } from '@/stores/prompt-groups-store';
import type { SpotifyQueue, EnhancedSpotifyQueue, EnhancedSpotifyTrack, SpotifyTrack } from '@/types/spotify';

// Shared skip state to coordinate between hooks
let globalIsSkipping = false;

/**
 * Filter queue to only show tracks we've added
 * Also deduplicates currently playing track from queue
 */
function filterUserQueue(queue: SpotifyQueue | null, isUserQueued: (id: string) => boolean): EnhancedSpotifyQueue | null {
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
    queue: filteredQueue as EnhancedSpotifyTrack[]
  };
}

/**
 * Hook for fetching and managing Spotify queue with smart polling
 */
export function useSpotifyQueue() {
  const isAuthenticated = useSpotifyStore(state => state.isAuthenticated);
  const { isUserQueued, cleanupOldTracks } = useQueueTrackingStore();
  const { getTrackPromptGroup, cleanupEmptyGroups } = usePromptGroupsStore();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['spotify', 'queue'],
    queryFn: async () => {
      // Return cached data while skipping
      if (globalIsSkipping) {
        const cached = queryClient.getQueryData<EnhancedSpotifyQueue>(['spotify', 'queue']);
        if (cached) return cached;
      }

      const spotify = SpotifyService.getInstance();
      const queue = await spotify.getQueue();

      // Clean up old tracks and empty groups periodically
      cleanupOldTracks();
      cleanupEmptyGroups();

      // Filter to only show user-added tracks
      const filteredQueue = filterUserQueue(queue, isUserQueued);

      // Enhance queue items with prompt group info
      if (filteredQueue) {
        // Enhance queue tracks
        if (filteredQueue.queue) {
          filteredQueue.queue = filteredQueue.queue.map(track => {
            const promptGroup = getTrackPromptGroup(track.id);
            return {
              ...track,
              promptGroupId: promptGroup?.id,
              promptSummary: promptGroup?.summary
            };
          });
        }

        // Enhance currently playing track
        if (filteredQueue.currently_playing) {
          const promptGroup = getTrackPromptGroup(filteredQueue.currently_playing.id);
          filteredQueue.currently_playing = {
            ...filteredQueue.currently_playing,
            promptGroupId: promptGroup?.id,
            promptSummary: promptGroup?.summary
          };
        }
      }

      return filteredQueue;
    },
    enabled: isAuthenticated && !globalIsSkipping,
    refetchInterval: (query) => {
      // Don't poll while skipping
      if (globalIsSkipping) return false;
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
  const { removeTrackFromGroups, getTrackPromptGroup, setActiveGroup } = usePromptGroupsStore();
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

  // Track currently playing track ID and update active prompt group
  useEffect(() => {
    if (query.data?.item && 'id' in query.data.item) {
      const currentTrackId = query.data.item.id;
      // Only process if track changed
      if (currentTrackId !== lastPlayingTrackId.current) {
        lastPlayingTrackId.current = currentTrackId;

        // Get and set the active prompt group
        const promptGroup = getTrackPromptGroup(currentTrackId);
        setActiveGroup(promptGroup?.id || null);

        // Remove from our tracking since it's now playing
        removeQueuedTrack(currentTrackId);
        removeTrackFromGroups(currentTrackId);
      }
    }
  }, [query.data, removeQueuedTrack, removeTrackFromGroups, getTrackPromptGroup, setActiveGroup]);

  return query;
}

/**
 * Hook for skipping to a specific track with optimistic updates
 */
export function useSkipToTrack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetTrackId: string) => {
      // Set global flag to stop polling
      globalIsSkipping = true;

      try {
        const spotify = SpotifyService.getInstance();

        // Get the FULL unfiltered queue from Spotify
        const fullQueue = await spotify.getQueue();
        if (!fullQueue?.queue) {
          throw new Error('No queue available');
        }

        // Find the target track position in the FULL queue
        const targetIndex = fullQueue.queue.findIndex(track => track.id === targetTrackId);
        if (targetIndex === -1) {
          throw new Error('Track not found in queue');
        }

        // Skip to the track (Spotify doesn't have direct play-by-id for queue items)
        // We'll skip multiple times to reach the target
        for (let i = 0; i <= targetIndex; i++) {
          await spotify.skipToNext();
          // Small delay to avoid rate limiting
          if (i < targetIndex) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        return targetTrackId;
      } finally {
        // Always reset the flag
        globalIsSkipping = false;
      }
    },
    onMutate: async (targetTrackId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['spotify', 'queue'] });

      // Snapshot the previous value
      const previousQueue = queryClient.getQueryData<EnhancedSpotifyQueue | null>(['spotify', 'queue']);

      // Optimistically update the queue
      if (previousQueue) {
        const targetTrack = previousQueue.queue.find(t => t.id === targetTrackId);
        if (targetTrack) {
          queryClient.setQueryData<EnhancedSpotifyQueue>(['spotify', 'queue'], {
            currently_playing: targetTrack,
            queue: previousQueue.queue.filter(t => t.id !== targetTrackId)
          });
        }
      }

      return { previousQueue };
    },
    onError: (_err, _targetTrackId, context) => {
      // Rollback on error
      if (context?.previousQueue) {
        queryClient.setQueryData(['spotify', 'queue'], context.previousQueue);
      }
    },
    onSettled: () => {
      // Wait a bit before refetching to ensure Spotify has updated
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['spotify', 'queue'] });
        queryClient.invalidateQueries({ queryKey: ['spotify', 'playback'] });
      }, 500);
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
  const { createPromptGroup } = usePromptGroupsStore();

  return useMutation({
    mutationFn: async ({ tracks, promptSummary }: { tracks: Array<{ artist: string; title: string }>, promptSummary?: string }) => {
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

      // Get successfully added track IDs
      const successfulTrackIds = results
        .filter(r => r.success && r.track)
        .map(r => r.track!.id);

      // Create prompt group if we have a summary and successful tracks
      if (promptSummary && successfulTrackIds.length > 0) {
        const isAutoGenerated = promptSummary.startsWith('Auto:');
        createPromptGroup(promptSummary, successfulTrackIds, isAutoGenerated);
      }

      // Track successfully added items
      const successfulTracks = results
        .filter(r => r.success && r.track)
        .map(r => ({
          id: r.track!.id,
          addedAt: Date.now(),
          artist: r.track!.artists[0].name,
          title: r.track!.name,
          promptSummary,
        }));

      if (successfulTracks.length > 0) {
        addQueuedTracks(successfulTracks);
      }

      return results;
    },
    onMutate: async ({ tracks, promptSummary }) => {
      // Cancel any outgoing refetches to prevent them from overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ['spotify', 'queue'] });

      // Snapshot the previous value for rollback
      const previousQueue = queryClient.getQueryData<EnhancedSpotifyQueue>(['spotify', 'queue']);

      // Search for tracks first to get full metadata including album art
      const spotify = SpotifyService.getInstance();
      const searchPromises = tracks.map(async ({ artist, title }) => {
        try {
          const track = await spotify.searchTrackByArtistAndTitle(artist, title);
          return track;
        } catch {
          // Return placeholder if search fails
          return {
            id: `optimistic-${Date.now()}-${Math.random()}`,
            name: title,
            artists: [{ name: artist, id: '' }],
            album: {
              name: 'Loading...',
              images: [{ url: '/vinyl-disc.svg', height: 64, width: 64 }],
              id: '',
            },
            uri: '',
            duration_ms: 0,
            popularity: 0,
            _optimistic: true,
          } as unknown as SpotifyTrack & { _optimistic: boolean };
        }
      });

      const searchResults = await Promise.all(searchPromises);

      // Create optimistic group ID
      const optimisticGroupId = `optimistic-${Date.now()}`;

      // Create optimistic tracks with full metadata
      const optimisticTracks = searchResults
        .filter(Boolean)
        .map((track: any) => ({
          ...track,
          promptGroupId: optimisticGroupId,
          promptSummary: promptSummary,
          _optimistic: true,
        })) as EnhancedSpotifyTrack[];

      // Optimistically update the queue by adding new tracks
      if (previousQueue) {
        queryClient.setQueryData<EnhancedSpotifyQueue>(['spotify', 'queue'], {
          ...previousQueue,
          queue: [...(previousQueue.queue || []), ...optimisticTracks],
        });
      }

      // Return context for potential rollback
      return { previousQueue, optimisticTracks };
    },
    onError: (_err, _variables, context) => {
      // Rollback to previous state on error
      if (context?.previousQueue) {
        queryClient.setQueryData(['spotify', 'queue'], context.previousQueue);
      }
    },
    onSettled: (_data, _error, _variables, context) => {
      // After mutation settles (success or error), sync with server
      // Use a small delay to ensure Spotify's API has updated
      setTimeout(() => {
        // First, remove optimistic tracks before refetching
        const currentQueue = queryClient.getQueryData<EnhancedSpotifyQueue>(['spotify', 'queue']);
        if (currentQueue && context?.optimisticTracks) {
          const optimisticIds = new Set(context.optimisticTracks.map(t => t.id));
          queryClient.setQueryData<EnhancedSpotifyQueue>(['spotify', 'queue'], {
            ...currentQueue,
            queue: currentQueue.queue.filter(t => !optimisticIds.has(t.id) || !t._optimistic),
          });
        }
        // Then invalidate to get fresh data
        queryClient.invalidateQueries({ queryKey: ['spotify', 'queue'] });
      }, 500);
    },
  });
}