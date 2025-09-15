import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConversationMessage } from '@/types/conversation';

const MAX_MESSAGES = 20; // Keep last 20 messages for context

interface ConversationStore {
  messages: ConversationMessage[];
  addMessage: (message: Omit<ConversationMessage, 'timestamp'>) => void;
  clearHistory: () => void;
  getFormattedHistory: () => Array<{ role: string; content: string }>;
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set, get) => ({
      messages: [],

      addMessage: (message) => {
        set((state) => {
          const newMessages = [
            ...state.messages,
            {
              ...message,
              timestamp: Date.now(),
            },
          ];

          // Keep only the last MAX_MESSAGES
          if (newMessages.length > MAX_MESSAGES) {
            return { messages: newMessages.slice(-MAX_MESSAGES) };
          }

          return { messages: newMessages };
        });
      },

      clearHistory: () => {
        set({ messages: [] });
      },

      getFormattedHistory: () => {
        const { messages } = get();
        return messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        }));
      },
    }),
    {
      name: 'vibe-dj-conversation', // Same key as before for backwards compatibility
    }
  )
);