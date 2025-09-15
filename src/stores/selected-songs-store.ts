import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SelectedSongsStore {
  selectedSongIds: Set<string>;
  toggleSongSelection: (songId: string) => void;
  clearSelection: () => void;
}

export const useSelectedSongsStore = create<SelectedSongsStore>()(
  persist(
    (set) => ({
      selectedSongIds: new Set<string>(),

      toggleSongSelection: (songId: string) => {
        set((state) => {
          const newSet = new Set(state.selectedSongIds);
          if (newSet.has(songId)) {
            newSet.delete(songId);
          } else {
            newSet.add(songId);
          }
          return { selectedSongIds: newSet };
        });
      },

      clearSelection: () => {
        set({ selectedSongIds: new Set<string>() });
      },
    }),
    {
      name: 'vibe-dj-selected-songs',
      partialize: (state) => ({
        selectedSongIds: Array.from(state.selectedSongIds),
      }),
      merge: (persisted: any, current) => ({
        ...current,
        selectedSongIds: new Set(persisted?.selectedSongIds || []),
      }),
    }
  )
);

// Selectors for performance optimization as per CLAUDE.md
export const useSelectedSongIds = () => useSelectedSongsStore((state) => state.selectedSongIds);
export const useToggleSongSelection = () => useSelectedSongsStore((state) => state.toggleSongSelection);
export const useClearSelection = () => useSelectedSongsStore((state) => state.clearSelection);