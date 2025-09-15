export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token: string;
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: {
    id: string;
    name: string;
  }[];
  album: {
    id: string;
    name: string;
    images: {
      url: string;
      width: number;
      height: number;
    }[];
  };
  duration_ms: number;
  popularity: number;
}

export interface EnhancedSpotifyTrack extends SpotifyTrack {
  promptSummary?: string;
  promptGroupId?: string;
  _optimistic?: boolean;
}

export interface SpotifySearchResponse {
  tracks: {
    items: SpotifyTrack[];
    total: number;
    limit: number;
    offset: number;
  };
}

export interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  images: {
    url: string;
    width: number;
    height: number;
  }[];
  product: 'free' | 'premium';
}

export interface SpotifyDevice {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number;
}

export interface SpotifyPlaybackState {
  device: SpotifyDevice;
  is_playing: boolean;
  item: SpotifyTrack | null;
  progress_ms: number;
}

export interface SpotifyError {
  error: {
    status: number;
    message: string;
  };
}

export interface SpotifyQueue {
  currently_playing: SpotifyTrack | null;
  queue: SpotifyTrack[];
}

export interface EnhancedSpotifyQueue {
  currently_playing: EnhancedSpotifyTrack | null;
  queue: EnhancedSpotifyTrack[];
}

export interface SavedTrackObject {
  added_at: string;
  track: SpotifyTrack;
}