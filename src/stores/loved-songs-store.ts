import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LovedSong {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt?: string;
  lovedAt: number;
}

interface LovedSongsStore {
  lovedSongs: LovedSong[];
  selectedSongIds: Set<string>;

  addLovedSong: (song: Omit<LovedSong, 'lovedAt'>) => void;
  removeLovedSong: (songId: string) => void;
  isLoved: (songId: string) => boolean;
  toggleLoved: (song: Omit<LovedSong, 'lovedAt'>) => void;
  clearLovedSongs: () => void;
  toggleSongSelection: (songId: string) => void;
  clearSelection: () => void;
  getSelectedSongs: () => LovedSong[];
  isSelected: (songId: string) => boolean;
}

export const useLovedSongsStore = create<LovedSongsStore>()(
  persist(
    (set, get) => ({
      lovedSongs: [],
      selectedSongIds: new Set(),

      addLovedSong: (song) => {
        set((state) => {
          // Prevent duplicates
          if (state.lovedSongs.some(s => s.id === song.id)) {
            return state;
          }
          return {
            lovedSongs: [...state.lovedSongs, { ...song, lovedAt: Date.now() }]
          };
        });
      },

      removeLovedSong: (songId) => {
        set((state) => ({
          lovedSongs: state.lovedSongs.filter(s => s.id !== songId),
          selectedSongIds: new Set([...state.selectedSongIds].filter(id => id !== songId))
        }));
      },

      isLoved: (songId) => {
        return get().lovedSongs.some(s => s.id === songId);
      },

      toggleLoved: (song) => {
        const { isLoved, addLovedSong, removeLovedSong } = get();
        if (isLoved(song.id)) {
          removeLovedSong(song.id);
        } else {
          addLovedSong(song);
        }
      },

      clearLovedSongs: () => {
        set({ lovedSongs: [], selectedSongIds: new Set() });
      },

      toggleSongSelection: (songId) => {
        set((state) => {
          const newSelectedIds = new Set(state.selectedSongIds);
          if (newSelectedIds.has(songId)) {
            newSelectedIds.delete(songId);
          } else {
            newSelectedIds.add(songId);
          }
          return { selectedSongIds: newSelectedIds };
        });
      },

      clearSelection: () => {
        set({ selectedSongIds: new Set() });
      },

      getSelectedSongs: () => {
        const state = get();
        return state.lovedSongs.filter(song => state.selectedSongIds.has(song.id));
      },

      isSelected: (songId) => {
        return get().selectedSongIds.has(songId);
      },
    }),
    {
      name: 'vibe-dj-loved-songs',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          return {
            ...parsed,
            state: {
              ...parsed.state,
              selectedSongIds: new Set(parsed.state.selectedSongIds || [])
            }
          };
        },
        setItem: (name, value) => {
          const serialized = {
            ...value,
            state: {
              ...value.state,
              selectedSongIds: Array.from(value.state.selectedSongIds || [])
            }
          };
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name),
      }
    }
  )
);