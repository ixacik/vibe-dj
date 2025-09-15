import { Heart, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLovedSongsStore } from "@/stores/loved-songs-store";
import { SpotifyService } from "@/lib/spotify-service";
import { toast } from "sonner";

export function LovedSongsCard() {
  const lovedSongs = useLovedSongsStore((state) => state.lovedSongs);
  const selectedSongIds = useLovedSongsStore((state) => state.selectedSongIds);
  const removeLovedSong = useLovedSongsStore((state) => state.removeLovedSong);
  const toggleSongSelection = useLovedSongsStore(
    (state) => state.toggleSongSelection
  );

  const handleRemove = async (songId: string) => {
    try {
      const spotify = SpotifyService.getInstance();
      await spotify.removeSavedTracks([songId]);
      removeLovedSong(songId);
    } catch (error) {
      console.error("Failed to remove from Spotify library:", error);
      toast.error("Failed to update your Spotify library");
      // Still remove from local state even if Spotify fails
      removeLovedSong(songId);
    }
  };

  return (
    <Card className="h-full flex flex-col w-full">
      <CardHeader>
        <CardTitle className="text-xl mb-0 flex items-center gap-2">
          <Heart className="h-5 w-5 fill-red-500 text-red-500" />
          Loved Songs
        </CardTitle>
        <CardDescription>
          {selectedSongIds.size > 0
            ? `${selectedSongIds.size} song${
                selectedSongIds.size !== 1 ? "s" : ""
              } in AI context`
            : "Tap songs to add them to AI context"}
        </CardDescription>
      </CardHeader>
      <CardContent className="w-full">
        {lovedSongs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm text-center">
            <p>
              Click the heart icon on songs
              <br />
              to add them to your loved list
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full w-full">
            <div className="space-y-2 w-[100%]">
              {/* Selected songs at the top */}
              {selectedSongIds.size > 0 && (
                <>
                  {lovedSongs
                    .filter((song) => selectedSongIds.has(song.id))
                    .map((song) => (
                      <div
                        key={`selected-${song.id}`}
                        className="group flex items-center gap-2 p-2 rounded-lg bg-primary/10 hover:bg-primary/15 transition-all cursor-pointer w-full"
                        onClick={() => toggleSongSelection(song.id)}
                      >
                        {song.albumArt && (
                          <img
                            src={song.albumArt}
                            alt={song.album}
                            className="w-10 h-10 rounded flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {song.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {song.artist}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(song.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  {lovedSongs.some((song) => !selectedSongIds.has(song.id)) && (
                    <div className="h-px bg-border my-2" />
                  )}
                </>
              )}

              {/* All loved songs */}
              {lovedSongs
                .sort((a, b) => b.lovedAt - a.lovedAt)
                .map((song) => {
                  const isSelected = selectedSongIds.has(song.id);
                  if (isSelected) return null; // Already shown above
                  return (
                    <div
                      key={song.id}
                      className="group flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-all cursor-pointer w-full"
                      onClick={() => toggleSongSelection(song.id)}
                    >
                      {song.albumArt && (
                        <img
                          src={song.albumArt}
                          alt={song.album}
                          className="w-10 h-10 rounded flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {song.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {song.artist}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(song.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
