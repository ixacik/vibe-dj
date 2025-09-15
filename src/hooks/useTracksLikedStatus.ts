import { useQuery } from '@tanstack/react-query';
import { SpotifyService } from '@/lib/spotify-service';
import { useSpotifyStore } from '@/stores/spotify-store';

export function useTracksLikedStatus(trackIds: string[]) {
  const isAuthenticated = useSpotifyStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: ['tracks-liked-status', trackIds],
    queryFn: async () => {
      if (!trackIds.length) return {};

      const spotify = SpotifyService.getInstance();
      const statuses = await spotify.checkSavedTracks(trackIds);

      // Return a map of trackId -> isLiked
      return Object.fromEntries(
        trackIds.map((id, index) => [id, statuses[index]])
      );
    },
    enabled: isAuthenticated && trackIds.length > 0,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
  });
}

// Hook for single track
export function useIsTrackLiked(trackId: string | undefined) {
  const { data } = useTracksLikedStatus(trackId ? [trackId] : []);
  return trackId ? data?.[trackId] ?? false : false;
}