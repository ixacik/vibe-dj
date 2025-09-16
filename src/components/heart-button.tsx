import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsTrackLiked } from '@/hooks/useTracksLikedStatus';
import { SpotifyService } from '@/lib/spotify-service';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SpotifyTrack } from '@/types/spotify';
import type { LikedSong } from '@/hooks/useLikedSongs';
import type { InfiniteData } from '@tanstack/react-query';

interface HeartButtonProps {
  track: SpotifyTrack;
  className?: string;
}

export function HeartButton({ track, className }: HeartButtonProps) {
  const queryClient = useQueryClient();
  const isLiked = useIsTrackLiked(track.id);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Optimistically update the liked status cache
    queryClient.setQueryData(['tracks-liked-status', [track.id]], {
      [track.id]: !isLiked
    });

    // Optimistically update the liked songs infinite query cache
    const likedSongsKey = ['liked-songs'];
    const currentData = queryClient.getQueryData<InfiniteData<{
      songs: LikedSong[];
      total: number;
      nextOffset: number | null;
    }>>(likedSongsKey);

    if (currentData) {
      if (!isLiked) {
        // Adding to liked songs - add to the first page
        const newSong: LikedSong = {
          id: track.id,
          name: track.name,
          artist: track.artists[0]?.name || 'Unknown Artist',
          album: track.album.name,
          albumArt: track.album.images[0]?.url,
          addedAt: new Date().toISOString(),
        };

        queryClient.setQueryData(likedSongsKey, {
          ...currentData,
          pages: currentData.pages.map((page, index) =>
            index === 0
              ? {
                  ...page,
                  songs: [newSong, ...page.songs],
                  total: page.total + 1
                }
              : page
          ),
        });
      } else {
        // Removing from liked songs - remove from all pages
        queryClient.setQueryData(likedSongsKey, {
          ...currentData,
          pages: currentData.pages.map(page => ({
            ...page,
            songs: page.songs.filter(song => song.id !== track.id),
            total: page.total - 1
          })),
        });
      }
    }

    try {
      const spotify = SpotifyService.getInstance();

      if (isLiked) {
        await spotify.removeSavedTracks([track.id]);
        toast.success('Removed from Liked Songs');
      } else {
        await spotify.saveTracks([track.id]);
        toast.success('Added to Liked Songs');
      }

      // Only invalidate the tracks-liked-status for other instances of the same track
      // The liked-songs cache is already updated optimistically
      queryClient.invalidateQueries({
        queryKey: ['tracks-liked-status'],
        refetchType: 'none' // Don't refetch immediately, let it happen naturally
      });
    } catch (error) {
      console.error('Failed to update Spotify library:', error);
      toast.error('Failed to update your Spotify library');

      // Revert optimistic updates on error
      queryClient.setQueryData(['tracks-liked-status', [track.id]], {
        [track.id]: isLiked
      });

      // Revert the liked songs cache
      if (currentData) {
        queryClient.setQueryData(likedSongsKey, currentData);
      }
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      onClick={handleToggle}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-colors",
          isLiked ? "fill-red-500 text-red-500" : "text-muted-foreground"
        )}
      />
    </Button>
  );
}