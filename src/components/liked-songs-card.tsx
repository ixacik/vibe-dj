import { Heart, RefreshCw, Search } from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useLikedSongs, type LikedSong } from "@/hooks/useLikedSongs";
import { useSpotifyStore } from "@/stores/spotify-store";
import { useSelectedSongIds, useToggleSongSelection } from "@/stores/selected-songs-store";

export function LikedSongsCard() {
  const [searchQuery, setSearchQuery] = useState("");
  const isAuthenticated = useSpotifyStore((state) => state.isAuthenticated);
  const selectedSongIds = useSelectedSongIds();
  const toggleSongSelection = useToggleSongSelection();

  const {
    allSongs,
    totalSongs,
    totalFetched,
    hasAllSongs,
    isLoadingInitial,
    isLoadingMore,
    refetch,
  } = useLikedSongs();

  // Filter songs based on search query
  const filteredSongs = useMemo(() => {
    if (!searchQuery) {
      // Show all fetched songs when not searching
      return allSongs;
    }

    const query = searchQuery.toLowerCase();
    return allSongs.filter(
      (song) =>
        song.name.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        song.album.toLowerCase().includes(query)
    );
  }, [allSongs, searchQuery]);

  // Selected songs for display
  const selectedSongs = useMemo(() => {
    return allSongs.filter((song) => selectedSongIds.has(song.id));
  }, [allSongs, selectedSongIds]);

  return (
    <Card className="h-full flex flex-col w-full overflow-hidden">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl mb-0 flex items-center gap-2">
              <Heart className="h-5 w-5 fill-red-500 text-red-500" />
              Liked Songs
            </CardTitle>
            <CardDescription>
              {selectedSongIds.size > 0
                ? `${selectedSongIds.size} song${
                    selectedSongIds.size !== 1 ? "s" : ""
                  } in AI context`
                : "Tap songs to add them to AI context"}
            </CardDescription>
          </div>
          {isAuthenticated && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isLoadingInitial || isLoadingMore}
              className="h-8 w-8"
              title="Refresh liked songs"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoadingMore ? "animate-spin" : ""}`}
              />
            </Button>
          )}
        </div>

        {/* Search input - only show when we have songs */}
        {!isLoadingInitial && allSongs.length > 0 && (
          <div className="relative mt-3">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                hasAllSongs
                  ? `Search ${totalSongs} songs...`
                  : `Search ${totalFetched} of ${totalSongs} songs (loading...)`
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
            {isLoadingMore && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                Loading...
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        {!isAuthenticated ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm text-center">
            <p>
              Connect Spotify to see
              <br />
              your liked songs
            </p>
          </div>
        ) : isLoadingInitial ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading liked songs...
          </div>
        ) : allSongs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm text-center">
            <p>
              No liked songs yet
              <br />
              Like songs on Spotify to see them here
            </p>
          </div>
        ) : (
          <VirtualSongList
            filteredSongs={filteredSongs}
            selectedSongs={selectedSongs}
            selectedSongIds={selectedSongIds}
            toggleSongSelection={toggleSongSelection}
            searchQuery={searchQuery}
            isLoadingMore={isLoadingMore}
            totalSongs={totalSongs}
            totalFetched={totalFetched}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface VirtualSongListProps {
  filteredSongs: LikedSong[];
  selectedSongs: LikedSong[];
  selectedSongIds: Set<string>;
  toggleSongSelection: (songId: string) => void;
  searchQuery: string;
  isLoadingMore: boolean;
  totalSongs: number;
  totalFetched: number;
}

function VirtualSongList({
  filteredSongs,
  selectedSongs,
  selectedSongIds,
  toggleSongSelection,
  searchQuery,
  isLoadingMore,
  totalSongs,
  totalFetched,
}: VirtualSongListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Separate selected and non-selected songs for rendering
  const { selectedForDisplay, nonSelectedForDisplay } = useMemo(() => {
    if (searchQuery) {
      // When searching, virtualize all results
      return {
        selectedForDisplay: [],
        nonSelectedForDisplay: filteredSongs,
      };
    }
    // When not searching, render selected songs statically, virtualize the rest
    const nonSelected = filteredSongs.filter(
      (song) => !selectedSongIds.has(song.id)
    );
    return {
      selectedForDisplay: selectedSongs,
      nonSelectedForDisplay: nonSelected,
    };
  }, [filteredSongs, selectedSongs, selectedSongIds, searchQuery]);

  // Show separator only when we have both selected and non-selected songs
  const showSeparator =
    selectedForDisplay.length > 0 && nonSelectedForDisplay.length > 0;

  // Only virtualize non-selected songs (or all when searching)
  const virtualizedSongs = searchQuery ? filteredSongs : nonSelectedForDisplay;
  const itemCount =
    virtualizedSongs.length + (isLoadingMore && !searchQuery ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 64, // Consistent height for all items
    overscan: 5, // Render 5 items outside of viewport
  });

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-auto custom-scrollbar"
      style={{ contain: "strict" }}
    >
      {/* Render selected songs statically (not virtualized) */}
      {selectedForDisplay.map((song) => (
        <div key={song.id} className="mb-1">
          <div
            className="group flex items-center gap-2 p-2 rounded-lg transition-all cursor-pointer bg-primary/10 hover:bg-primary/15"
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
              <p className="text-sm font-medium truncate">{song.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {song.artist}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Separator between selected and non-selected */}
      {showSeparator && (
        <div className="py-2">
          <Separator className="w-full" />
        </div>
      )}

      {/* Virtualized non-selected songs */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const { index, start, size } = virtualItem;

          // Check if this is the loading indicator
          const isLoadingItem = index === virtualizedSongs.length;

          if (isLoadingItem) {
            return (
              <div
                key="loading"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${size}px`,
                  transform: `translateY(${start}px)`,
                }}
                className="flex items-center justify-center py-4 text-sm text-muted-foreground"
              >
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Loading more songs ({totalFetched} of {totalSongs})...
              </div>
            );
          }

          const song = virtualizedSongs[index];
          if (!song) return null; // Safety check

          const isSelected = selectedSongIds.has(song.id);

          return (
            <div
              key={song.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${size}px`,
                transform: `translateY(${start}px)`,
              }}
            >
              <div
                className={`group flex items-center gap-2 p-2 rounded-lg transition-all cursor-pointer ${
                  isSelected
                    ? "bg-primary/10 hover:bg-primary/15"
                    : "hover:bg-muted/50"
                }`}
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
                  <p className="text-sm font-medium truncate">{song.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {song.artist}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Show loading indicator when searching and more songs are loading */}
        {searchQuery && isLoadingMore && (
          <div className="absolute bottom-0 left-0 right-0 text-center py-2 text-sm text-muted-foreground bg-background/95">
            Loading more songs to search...
          </div>
        )}

        {/* Show message when search has no results */}
        {searchQuery && filteredSongs.length === 0 && !isLoadingMore && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No songs match "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
}
