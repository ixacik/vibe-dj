import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AutoModeStore {
  // State
  isAutoMode: boolean;
  lastAutoPromptSummary: string | null;

  // Actions
  toggleAutoMode: () => void;
  setLastAutoPrompt: (summary: string | null) => void;
  reset: () => void;
}

export const useAutoModeStore = create<AutoModeStore>()(
  persist(
    (set) => ({
      // Initial state
      isAutoMode: false,
      lastAutoPromptSummary: null,

      // Toggle auto mode on/off
      toggleAutoMode: () => set((state) => ({
        isAutoMode: !state.isAutoMode,
        // Keep lastAutoPromptSummary to maintain state across toggles
        // This prevents re-triggering on the same track when re-enabling
      })),

      // Set the last auto prompt to prevent duplicates
      setLastAutoPrompt: (summary) => set({ lastAutoPromptSummary: summary }),

      // Reset the store
      reset: () => set({
        isAutoMode: false,
        lastAutoPromptSummary: null
      }),
    }),
    {
      name: 'vibe-dj-auto-mode',
    }
  )
);