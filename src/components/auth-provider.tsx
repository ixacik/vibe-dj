import { useEffect, PropsWithChildren } from 'react';
import { supabase } from '@/lib/supabase';
import { useSpotifyStore } from '@/stores/spotify-store';

export function AuthProvider({ children }: PropsWithChildren) {
  const { setSession, fetchUserProfile } = useSpotifyStore();

  useEffect(() => {
    // Get initial session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserProfile();
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile();
      }
    });

    // Cleanup subscription
    return () => subscription.unsubscribe();
  }, [setSession, fetchUserProfile]);

  return <>{children}</>;
}