import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsTrackLiked } from '@/hooks/useTracksLikedStatus';
import { SpotifyService } from '@/lib/spotify-service';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SpotifyTrack } from '@/types/spotify';

interface HeartButtonProps {
  track: SpotifyTrack;
  className?: string;
}

export function HeartButton({ track, className }: HeartButtonProps) {
  const queryClient = useQueryClient();
  const isLiked = useIsTrackLiked(track.id);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const spotify = SpotifyService.getInstance();

      if (isLiked) {
        await spotify.removeSavedTracks([track.id]);
        toast.success('Removed from Liked Songs');
      } else {
        await spotify.saveTracks([track.id]);
        toast.success('Added to Liked Songs');
      }

      // Invalidate both the liked status and the liked songs list
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tracks-liked-status'] }),
        queryClient.invalidateQueries({ queryKey: ['liked-songs'] }),
      ]);
    } catch (error) {
      console.error('Failed to update Spotify library:', error);
      toast.error('Failed to update your Spotify library');
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