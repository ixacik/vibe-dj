import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000, // Consider data stale after 2 seconds
      gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours to match persistence
      retry: 1, // Only retry once on failure
      refetchOnWindowFocus: false, // Don't refetch on window focus for music app
    },
    mutations: {
      retry: 0, // Don't retry mutations
    },
  },
});

export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'vibe-dj-query-cache',
});