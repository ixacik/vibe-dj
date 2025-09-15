import { useEffect, PropsWithChildren } from 'react';
import { supabase } from '@/lib/supabase';
import { useSpotifyStore } from '@/stores/spotify-store';

const STORAGE_KEYS = {
  PROVIDER_TOKEN: 'spotify_provider_token',
  PROVIDER_REFRESH_TOKEN: 'spotify_provider_refresh_token',
  TOKEN_EXPIRES_AT: 'spotify_token_expires_at',
};

export function AuthProvider({ children }: PropsWithChildren) {
  const { setSession, fetchUserProfile, setProviderTokens } = useSpotifyStore();

  useEffect(() => {
    // Get initial session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);

      if (session) {
        // First check localStorage for existing tokens
        const storedToken = localStorage.getItem(STORAGE_KEYS.PROVIDER_TOKEN);
        const storedRefreshToken = localStorage.getItem(STORAGE_KEYS.PROVIDER_REFRESH_TOKEN);
        const storedExpiresAt = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);

        if (storedRefreshToken) {
          // Restore from localStorage
          setProviderTokens(
            storedToken,
            storedRefreshToken,
            storedExpiresAt ? parseInt(storedExpiresAt, 10) : null
          );
        } else {
          // Extract provider tokens from session (OAuth callback)
          const providerToken = (session as any)?.provider_token;
          const providerRefreshToken = (session as any)?.provider_refresh_token;

          if (providerToken && providerRefreshToken) {
            // Calculate expiry time (1 hour from now for Spotify)
            const tokenExpiresAt = Date.now() + (60 * 60 * 1000);
            setProviderTokens(providerToken, providerRefreshToken, tokenExpiresAt);

            // Persist to localStorage
            localStorage.setItem(STORAGE_KEYS.PROVIDER_TOKEN, providerToken);
            localStorage.setItem(STORAGE_KEYS.PROVIDER_REFRESH_TOKEN, providerRefreshToken);
            localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES_AT, tokenExpiresAt.toString());
          }
        }

        fetchUserProfile();
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (session && event === 'SIGNED_IN') {
        // Extract provider tokens on sign in
        const providerToken = (session as any)?.provider_token;
        const providerRefreshToken = (session as any)?.provider_refresh_token;

        if (providerToken && providerRefreshToken) {
          // Calculate expiry time (1 hour from now for Spotify)
          const tokenExpiresAt = Date.now() + (60 * 60 * 1000);
          setProviderTokens(providerToken, providerRefreshToken, tokenExpiresAt);

          // Persist to localStorage
          localStorage.setItem(STORAGE_KEYS.PROVIDER_TOKEN, providerToken);
          localStorage.setItem(STORAGE_KEYS.PROVIDER_REFRESH_TOKEN, providerRefreshToken);
          localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES_AT, tokenExpiresAt.toString());
        }

        fetchUserProfile();
      } else if (event === 'SIGNED_OUT') {
        // Clear tokens from store and localStorage
        setProviderTokens(null, null, null);
        localStorage.removeItem(STORAGE_KEYS.PROVIDER_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.PROVIDER_REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES_AT);
      }
    });

    // Cleanup subscription
    return () => subscription.unsubscribe();
  }, [setSession, fetchUserProfile, setProviderTokens]);

  return <>{children}</>;
}