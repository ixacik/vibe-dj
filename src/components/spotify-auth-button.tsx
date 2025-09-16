import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Loader2, CreditCard, HelpCircle } from 'lucide-react';
import { SpotifyLogo } from '@/components/spotify-logo';
import { useSpotifyStore } from '@/stores/spotify-store';
import { useSubscriptionTier } from '@/stores/subscription-store';
import { useEffect, useState } from 'react';
import { HelpModal } from '@/components/help-modal';
import { ManageSubscriptionModal } from '@/components/manage-subscription-modal';

export function SpotifyAuthButton() {
  const {
    isAuthenticated,
    user,
    isLoading,
    error,
    hasInitializedProfile,
    isInitialized,
    login,
    logout,
    fetchUserProfile,
  } = useSpotifyStore();
  const tier = useSubscriptionTier();
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);

  useEffect(() => {
    // Only fetch if authenticated, no user, no error, and haven't tried yet
    if (isAuthenticated && !user && !error && !hasInitializedProfile) {
      fetchUserProfile();
    }
  }, [isAuthenticated, user, error, hasInitializedProfile, fetchUserProfile]);

  // Don't show loading if we're just checking cached session
  if (isLoading && !isInitialized) {
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

    // Only show loading profile if we're actually fetching
    if (isLoading) {
      return (
        <Button variant="outline" disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading profile...
        </Button>
      );
    }

    // If initialized but no user, there might be an issue
    if (isInitialized && hasInitializedProfile) {
      return (
        <Button onClick={login} variant="outline" className="h-9">
          <SpotifyLogo className="h-4 w-4" />
          Reconnect Spotify
        </Button>
      );
    }

    // During initialization, return null to prevent flash
    return null;
  }

  return (
    <>
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
              Pro
            </Badge>
          )}
          {tier === "ultra" && (
            <Badge className="ml-1 bg-purple-600 text-white">
              Ultra
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled>
          <User className="mr-2 h-4 w-4" />
          <span className="flex flex-col">
            <span>{user.email}</span>
            <span className="text-xs text-muted-foreground capitalize">{tier} Tier</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setShowManageModal(true)}>
          <CreditCard className="mr-2 h-4 w-4" />
          Manage Subscription
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowHelpModal(true)}>
          <HelpCircle className="mr-2 h-4 w-4" />
          Help & Support
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-red-500 focus:text-red-500">
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <HelpModal open={showHelpModal} onOpenChange={setShowHelpModal} />
    <ManageSubscriptionModal open={showManageModal} onOpenChange={setShowManageModal} />
    </>
  );
}