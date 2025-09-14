import { useState, useEffect, useCallback } from 'react';
import type { ConversationMessage } from '@/types/conversation';

const STORAGE_KEY = 'vibe-dj-conversation';
const MAX_MESSAGES = 20; // Keep last 20 messages for context

export function useConversationHistory() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

  // Load messages from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as ConversationMessage[];
          setMessages(parsed);
        } catch (error) {
          console.error('Failed to parse conversation history:', error);
        }
      }
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined" && messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  const addMessage = useCallback((message: Omit<ConversationMessage, 'timestamp'>) => {
    setMessages(prev => {
      const newMessages = [
        ...prev,
        {
          ...message,
          timestamp: Date.now(),
        },
      ];

      // Keep only the last MAX_MESSAGES
      if (newMessages.length > MAX_MESSAGES) {
        return newMessages.slice(-MAX_MESSAGES);
      }

      return newMessages;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Format messages for OpenAI API
  const getFormattedHistory = useCallback(() => {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }, [messages]);

  return {
    messages,
    addMessage,
    clearHistory,
    getFormattedHistory,
  };
}