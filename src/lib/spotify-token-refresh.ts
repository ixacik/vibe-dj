import { SupabaseAuth } from './supabase-auth';
import { useSpotifyStore } from '@/stores/spotify-store';

interface RefreshTokenResponse {
  accessToken: string;
  expiresAt: number;
  expiresIn: number;
}

export async function refreshSpotifyToken(refreshToken: string): Promise<string> {
  // Get the current session for authentication
  const session = await SupabaseAuth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  // Get Supabase project URL from environment
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  // Call the Edge Function
  const response = await fetch(
    `${supabaseUrl}/functions/v1/refresh-spotify-token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        refreshToken,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to refresh token' }));

    // If refresh token is invalid, clear session and redirect to login
    if (error.code === 'INVALID_REFRESH_TOKEN') {
      const store = useSpotifyStore.getState();
      await store.logout();

      // Clear localStorage
      localStorage.removeItem('spotify_provider_token');
      localStorage.removeItem('spotify_provider_refresh_token');
      localStorage.removeItem('spotify_token_expires_at');

      throw new Error(error.error || 'Invalid refresh token');
    }

    throw new Error(error.error || 'Failed to refresh token');
  }

  const data: RefreshTokenResponse = await response.json();

  // Update the store with the new token
  const store = useSpotifyStore.getState();
  store.setProviderTokens(data.accessToken, refreshToken, data.expiresAt);

  // Persist to localStorage
  localStorage.setItem('spotify_provider_token', data.accessToken);
  localStorage.setItem('spotify_provider_refresh_token', refreshToken);
  localStorage.setItem('spotify_token_expires_at', data.expiresAt.toString());

  return data.accessToken;
}

export async function refreshTokenIfNeeded(): Promise<string | null> {
  const store = useSpotifyStore.getState();

  // Check if we have a refresh token (from store or localStorage)
  const refreshToken = store.providerRefreshToken ||
    (typeof window !== 'undefined' ? localStorage.getItem('spotify_provider_refresh_token') : null);

  if (!refreshToken) {
    return null;
  }

  // Check if token is expiring soon
  if (!store.isTokenExpiringSoon()) {
    // Return token from store or localStorage
    return store.providerToken ||
      (typeof window !== 'undefined' ? localStorage.getItem('spotify_provider_token') : null);
  }

  try {
    // Refresh the token
    const newToken = await refreshSpotifyToken(refreshToken);
    return newToken;
  } catch (error) {
    console.error('Failed to refresh Spotify token:', error);
    throw error;
  }
}