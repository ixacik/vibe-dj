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
import { Music, LogOut, User, Loader2 } from 'lucide-react';
import { useSpotifyStore } from '@/stores/spotify-store';
import { useEffect } from 'react';

export function SpotifyAuthButton() {
  const {
    isAuthenticated,
    user,
    isLoading,
    login,
    logout,
    fetchUserProfile,
  } = useSpotifyStore();

  useEffect(() => {
    if (isAuthenticated && !user) {
      fetchUserProfile();
    }
  }, [isAuthenticated, user, fetchUserProfile]);

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
      <Button onClick={login} variant="default" className="bg-green-600 hover:bg-green-700">
        <Music className="mr-2 h-4 w-4" />
        Connect Spotify
      </Button>
    );
  }

  if (!user) {
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
          {user.product === 'premium' && (
            <Badge variant="secondary" className="ml-1">Premium</Badge>
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