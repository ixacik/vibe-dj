import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLovedSongsStore } from '@/stores/loved-songs-store';
import { SpotifyService } from '@/lib/spotify-service';
import { toast } from 'sonner';
import type { SpotifyTrack } from '@/types/spotify';

interface HeartButtonProps {
  track: SpotifyTrack;
  className?: string;
}

export function HeartButton({ track, className }: HeartButtonProps) {
  const { isLoved, toggleLoved } = useLovedSongsStore();
  const loved = isLoved(track.id);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const spotify = SpotifyService.getInstance();

      if (loved) {
        await spotify.removeSavedTracks([track.id]);
        toggleLoved({
          id: track.id,
          name: track.name,
          artist: track.artists[0].name,
          album: track.album.name,
          albumArt: track.album.images[0]?.url
        });
      } else {
        await spotify.saveTracks([track.id]);
        toggleLoved({
          id: track.id,
          name: track.name,
          artist: track.artists[0].name,
          album: track.album.name,
          albumArt: track.album.images[0]?.url
        });
      }
    } catch (error) {
      console.error('Failed to update Spotify library:', error);
      toast.error('Failed to update your Spotify library');
      // Still toggle local state even if Spotify fails
      toggleLoved({
        id: track.id,
        name: track.name,
        artist: track.artists[0].name,
        album: track.album.name,
        albumArt: track.album.images[0]?.url
      });
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
          loved ? "fill-red-500 text-red-500" : "text-muted-foreground"
        )}
      />
    </Button>
  );
}