import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Music, LogOut, User, Loader2, Crown, Zap } from 'lucide-react';
import { SpotifyLogo } from '@/components/spotify-logo';
import { useSpotifyStore } from '@/stores/spotify-store';
import { useSubscriptionTier } from '@/stores/subscription-store';
import { useEffect } from 'react';

export function SpotifyAuthButton() {
  const {
    isAuthenticated,
    user,
    isLoading,
    error,
    login,
    logout,
    fetchUserProfile,
  } = useSpotifyStore();
  const tier = useSubscriptionTier();

  useEffect(() => {
    if (isAuthenticated && !user && !error) {
      fetchUserProfile();
    }
  }, [isAuthenticated, user, error, fetchUserProfile]);

  if (isLoading) {
    return (
      <Button variant="outline" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (!isAuthenticated) {
    return (
      <Button onClick={login} variant="default" className="bg-[#1DB954] hover:bg-[#1ed760] text-white h-9">
        <SpotifyLogo className="h-4 w-4" />
        Connect Spotify
      </Button>
    );
  }

  if (!user) {
    // If there's an error, show reconnect button instead of loading forever
    if (error) {
      return (
        <Button onClick={login} variant="destructive" className="h-9">
          <SpotifyLogo className="h-4 w-4" />
          Reconnect Spotify
        </Button>
      );
    }

    return (
      <Button variant="outline" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading profile...
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Avatar className="h-6 w-6">
            {user.images?.[0] ? (
              <AvatarImage src={user.images[0].url} alt={user.display_name} />
            ) : (
              <AvatarFallback>
                <User className="h-4 w-4" />
              </AvatarFallback>
            )}
          </Avatar>
          <span className="max-w-[150px] truncate">{user.display_name}</span>
          {tier === "free" && (
            <Badge variant="secondary" className="ml-1">
              Free Tier
            </Badge>
          )}
          {tier === "pro" && (
            <Badge className="ml-1 bg-blue-600 text-white">
              <Crown className="w-3 h-3 mr-1" />
              Pro
            </Badge>
          )}
          {tier === "ultra" && (
            <Badge className="ml-1 bg-purple-600 text-white">
              <Zap className="w-3 h-3 mr-1" />
              Ultra
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Spotify Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="mr-2 h-4 w-4" />
          {user.email}
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Music className="mr-2 h-4 w-4" />
          {user.product === 'premium' ? 'Premium Account' : 'Free Account'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}