import { create } from 'zustand';
import { SupabaseAuth } from '@/lib/supabase-auth';
import { SpotifyService } from '@/lib/spotify-service';
import type { SpotifyUser, SpotifyTrack } from '@/types/spotify';
import type { Session } from '@supabase/supabase-js';

interface QueueResult {
  track?: SpotifyTrack;
  success: boolean;
  error?: string;
}

interface SpotifyStore {
  // State
  isAuthenticated: boolean;
  session: Session | null;
  user: SpotifyUser | null;
  isLoading: boolean;
  error: string | null;
  queueResults: QueueResult[];

  // Token management
  providerToken: string | null;
  providerRefreshToken: string | null;
  tokenExpiresAt: number | null;

  // Actions
  setSession: (session: Session | null) => void;
  setUser: (user: SpotifyUser | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProviderTokens: (token: string | null, refreshToken: string | null, expiresAt: number | null) => void;

  // Token helpers
  isTokenExpired: () => boolean;
  isTokenExpiringSoon: () => boolean;

  // Async actions
  login: () => Promise<void>;
  logout: () => Promise<void>;
  fetchUserProfile: () => Promise<void>;
  addTracksToQueue: (tracks: Array<{ artist: string; title: string }>) => Promise<QueueResult[]>;
  clearQueueResults: () => void;
}

export const useSpotifyStore = create<SpotifyStore>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  session: null,
  user: null,
  isLoading: false,
  error: null,
  queueResults: [],

  // Token management state
  providerToken: null,
  providerRefreshToken: null,
  tokenExpiresAt: null,

  // Setters
  setSession: (session) => set({
    session,
    isAuthenticated: !!session
  }),
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setProviderTokens: (token, refreshToken, expiresAt) => set({
    providerToken: token,
    providerRefreshToken: refreshToken,
    tokenExpiresAt: expiresAt
  }),

  // Token helpers
  isTokenExpired: () => {
    const expiresAt = get().tokenExpiresAt;
    if (!expiresAt) return true;
    return Date.now() >= expiresAt;
  },

  isTokenExpiringSoon: () => {
    const expiresAt = get().tokenExpiresAt;
    if (!expiresAt) return true;
    // Consider expiring soon if less than 5 minutes left
    return Date.now() >= (expiresAt - 5 * 60 * 1000);
  },


  // Login
  login: async () => {
    set({ isLoading: true, error: null });
    try {
      await SupabaseAuth.signInWithSpotify();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initiate login',
        isLoading: false
      });
    }
  },

  // Logout
  logout: async () => {
    set({ isLoading: true });
    try {
      await SupabaseAuth.signOut();
      set({
        isAuthenticated: false,
        session: null,
        user: null,
        error: null,
        queueResults: [],
        // Clear token data
        providerToken: null,
        providerRefreshToken: null,
        tokenExpiresAt: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to sign out',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  // Fetch user profile
  fetchUserProfile: async () => {
    if (!get().isAuthenticated) return;

    set({ isLoading: true, error: null });
    try {
      const spotify = SpotifyService.getInstance();
      const user = await spotify.getCurrentUser();
      set({ user, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch user profile',
        isLoading: false,
      });
    }
  },

  // Add tracks to queue
  addTracksToQueue: async (tracks) => {
    if (!get().isAuthenticated) {
      throw new Error('Not authenticated with Spotify');
    }

    set({ isLoading: true, error: null, queueResults: [] });

    try {
      const spotify = SpotifyService.getInstance();
      const results = await spotify.addMultipleToQueue(tracks);

      const queueResults: QueueResult[] = results.map(result => ({
        track: result.track,
        success: result.success,
        error: result.error,
      }));

      set({ queueResults, isLoading: false });

      // Check if all succeeded
      const allSucceeded = results.every(r => r.success);
      if (!allSucceeded) {
        const failedCount = results.filter(r => !r.success).length;
        set({ error: `Failed to add ${failedCount} track(s) to queue` });
      }

      return queueResults;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to add tracks to queue',
        isLoading: false,
      });
      throw error;
    }
  },

  clearQueueResults: () => set({ queueResults: [] }),
}));