import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000, // Consider data stale after 2 seconds
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes (formerly cacheTime)
      retry: 1, // Only retry once on failure
      refetchOnWindowFocus: false, // Don't refetch on window focus for music app
    },
    mutations: {
      retry: 0, // Don't retry mutations
    },
  },
});