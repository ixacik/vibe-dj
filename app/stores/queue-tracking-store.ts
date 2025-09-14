import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface QueuedTrack {
  id: string;
  addedAt: number;
  artist: string;
  title: string;
}

interface QueueTrackingStore {
  // Tracks we've added to the queue
  userQueuedTracks: QueuedTrack[];

  // Add tracks to our tracking
  addQueuedTracks: (tracks: QueuedTrack[]) => void;

  // Remove a track (when it starts playing or is skipped)
  removeQueuedTrack: (trackId: string) => void;

  // Clear all tracked items
  clearQueuedTracks: () => void;

  // Check if a track was added by us
  isUserQueued: (trackId: string) => boolean;

  // Clean up old tracks (older than 1 hour)
  cleanupOldTracks: () => void;
}

const ONE_HOUR = 60 * 60 * 1000;

export const useQueueTrackingStore = create<QueueTrackingStore>()(
  persist(
    (set, get) => ({
      userQueuedTracks: [],

      addQueuedTracks: (tracks) => {
        set((state) => ({
          userQueuedTracks: [...state.userQueuedTracks, ...tracks]
        }));
      },

      removeQueuedTrack: (trackId) => {
        set((state) => ({
          userQueuedTracks: state.userQueuedTracks.filter(t => t.id !== trackId)
        }));
      },

      clearQueuedTracks: () => {
        set({ userQueuedTracks: [] });
      },

      isUserQueued: (trackId) => {
        return get().userQueuedTracks.some(t => t.id === trackId);
      },

      cleanupOldTracks: () => {
        const now = Date.now();
        set((state) => ({
          userQueuedTracks: state.userQueuedTracks.filter(
            t => now - t.addedAt < ONE_HOUR
          )
        }));
      },
    }),
    {
      name: 'vibe-dj-queue-tracking',
    }
  )
);