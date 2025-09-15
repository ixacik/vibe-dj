import { useInfiniteQuery } from '@tanstack/react-query';
import { SpotifyService } from '@/lib/spotify-service';
import { useSpotifyStore } from '@/stores/spotify-store';
import { useEffect } from 'react';
import type { SavedTrackObject } from '@/types/spotify';

export interface LikedSong {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt?: string;
  addedAt: string;
}

export function useLikedSongs() {
  const isAuthenticated = useSpotifyStore((state) => state.isAuthenticated);

  const query = useInfiniteQuery({
    queryKey: ['liked-songs'],
    queryFn: async ({ pageParam = 0 }) => {
      const spotify = SpotifyService.getInstance();
      const response = await spotify.getLikedSongs(50, pageParam);

      // Transform to our LikedSong format
      const songs: LikedSong[] = response.items.map((item: SavedTrackObject) => ({
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artists[0]?.name || 'Unknown Artist',
        album: item.track.album.name,
        albumArt: item.track.album.images[0]?.url,
        addedAt: item.added_at,
      }));

      return {
        songs,
        total: response.total,
        nextOffset: response.next ? pageParam + 50 : null,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });

  // Auto-fetch all pages in background after initial load
  useEffect(() => {
    if (query.data && query.hasNextPage && !query.isFetchingNextPage) {
      const timer = setTimeout(() => {
        query.fetchNextPage();
      }, 100); // Small delay to not block UI
      return () => clearTimeout(timer);
    }
  }, [query.data, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  // Computed values
  const allSongs = query.data?.pages.flatMap(page => page.songs) ?? [];
  const totalSongs = query.data?.pages[0]?.total ?? 0;
  const totalFetched = allSongs.length;
  const hasAllSongs = !query.hasNextPage;
  const isLoadingInitial = query.isLoading;
  const isLoadingMore = query.hasNextPage || query.isFetchingNextPage;

  return {
    ...query,
    allSongs,
    totalSongs,
    totalFetched,
    hasAllSongs,
    isLoadingInitial,
    isLoadingMore,
  };
}