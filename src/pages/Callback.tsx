import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpotifyAuth } from '@/lib/spotify-auth';
import { useSpotifyStore } from '@/stores/spotify-store';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function SpotifyCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { setAuthenticated, fetchUserProfile } = useSpotifyStore();

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      if (error) {
        setError(`Spotify authorization failed: ${error}`);
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      if (!code || !state) {
        setError('Invalid callback parameters');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      try {
        await SpotifyAuth.handleCallback(code, state);
        setAuthenticated(true);
        await fetchUserProfile();
        navigate('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setTimeout(() => navigate('/'), 3000);
      }
    };

    handleCallback();
  }, [navigate, setAuthenticated, fetchUserProfile]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {error ? (
            <div className="text-center space-y-4">
              <p className="text-destructive">{error}</p>
              <p className="text-sm text-muted-foreground">Redirecting back...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-lg">Connecting to Spotify...</p>
              <p className="text-sm text-muted-foreground">Please wait while we complete the authentication</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}