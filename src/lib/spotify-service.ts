import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { SpotifyAuth } from './spotify-auth';
import type {
  SpotifyTrack,
  SpotifySearchResponse,
  SpotifyUser,
  SpotifyPlaybackState,
  SpotifyError,
  SpotifyQueue
} from '@/types/spotify';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export class SpotifyService {
  private static instance: SpotifyService;
  private api: AxiosInstance;

  private constructor() {
    this.api = axios.create({
      baseURL: SPOTIFY_API_BASE,
    });

    // Add auth interceptor
    this.api.interceptors.request.use(async (config) => {
      const token = await SpotifyAuth.getValidToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    // Add error interceptor for token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<SpotifyError>) => {
        if (error.response?.status === 401) {
          try {
            await SpotifyAuth.refreshToken();
            // Retry the original request
            const token = await SpotifyAuth.getValidToken();
            if (error.config) {
              error.config.headers.Authorization = `Bearer ${token}`;
              return this.api.request(error.config);
            }
          } catch (refreshError) {
            // Refresh failed, need to re-authenticate
            SpotifyAuth.clearTokens();
            throw new Error('Session expired. Please log in again.');
          }
        }
        throw error;
      }
    );
  }

  static getInstance(): SpotifyService {
    if (!this.instance) {
      this.instance = new SpotifyService();
    }
    return this.instance;
  }

  async getCurrentUser(): Promise<SpotifyUser> {
    const response = await this.api.get<SpotifyUser>('/me');
    return response.data;
  }

  async searchTrack(query: string, limit: number = 1): Promise<SpotifyTrack[]> {
    const response = await this.api.get<SpotifySearchResponse>('/search', {
      params: {
        q: query,
        type: 'track',
        limit,
      },
    });
    return response.data.tracks.items;
  }

  async searchTrackByArtistAndTitle(artist: string, title: string): Promise<SpotifyTrack | null> {
    // Try exact match first
    let query = `artist:"${artist}" track:"${title}"`;
    let tracks = await this.searchTrack(query, 5);

    if (tracks.length > 0) {
      return tracks[0];
    }

    // Try without quotes for fuzzy matching
    query = `artist:${artist} track:${title}`;
    tracks = await this.searchTrack(query, 5);

    if (tracks.length > 0) {
      return tracks[0];
    }

    // Try just the combination
    query = `${artist} ${title}`;
    tracks = await this.searchTrack(query, 5);

    if (tracks.length > 0) {
      // Check if artist name matches at least partially
      const track = tracks.find(t =>
        t.artists.some(a =>
          a.name.toLowerCase().includes(artist.toLowerCase()) ||
          artist.toLowerCase().includes(a.name.toLowerCase())
        )
      );
      return track || tracks[0];
    }

    return null;
  }

  async addToQueue(trackUri: string): Promise<void> {
    try {
      await this.api.post('/me/player/queue', null, {
        params: {
          uri: trackUri,
        },
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const spotifyError = error.response?.data as SpotifyError;
        if (error.response?.status === 403) {
          throw new Error('Spotify Premium is required to add songs to queue');
        }
        if (error.response?.status === 404) {
          throw new Error('No active Spotify player found. Please start playing music on Spotify first.');
        }
        throw new Error(spotifyError?.error?.message || 'Failed to add track to queue');
      }
      throw error;
    }
  }

  async getCurrentPlayback(): Promise<SpotifyPlaybackState | null> {
    try {
      const response = await this.api.get<SpotifyPlaybackState>('/me/player');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 204) {
        return null; // No active playback
      }
      throw error;
    }
  }

  async getQueue(): Promise<SpotifyQueue | null> {
    try {
      const response = await this.api.get<SpotifyQueue>('/me/player/queue');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 204 || error.response?.status === 404) {
          return null; // No active playback or queue
        }
      }
      throw error;
    }
  }

  async skipToNext(): Promise<void> {
    try {
      await this.api.post('/me/player/next');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const spotifyError = error.response?.data as SpotifyError;
        if (error.response?.status === 403) {
          throw new Error('Spotify Premium is required to skip tracks');
        }
        if (error.response?.status === 404) {
          throw new Error('No active Spotify player found');
        }
        throw new Error(spotifyError?.error?.message || 'Failed to skip track');
      }
      throw error;
    }
  }

  async addMultipleToQueue(tracks: Array<{ artist: string; title: string }>): Promise<Array<{ success: boolean; track?: SpotifyTrack; error?: string }>> {
    const results = [];

    for (const { artist, title } of tracks) {
      try {
        const track = await this.searchTrackByArtistAndTitle(artist, title);
        if (track) {
          await this.addToQueue(track.uri);
          results.push({ success: true, track });
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          results.push({
            success: false,
            error: `Track not found: ${artist} - ${title}`
          });
        }
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Start playback on the user's active device
   * If no track is specified, resumes current playback or starts from liked songs
   */
  async startPlayback(trackUri?: string): Promise<void> {
    try {
      const endpoint = '/me/player/play';

      if (trackUri) {
        // Play specific track
        await this.api.put(endpoint, {
          uris: [trackUri]
        });
      } else {
        // Just resume playback or start from user's liked songs
        try {
          // First try to resume current playback
          await this.api.put(endpoint);
        } catch (error) {
          // If no current playback, start playing liked songs
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            await this.api.put(endpoint, {
              context_uri: 'spotify:collection:tracks'
            });
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error('No active device found. Please open Spotify on a device.');
        } else if (error.response?.status === 403) {
          throw new Error('Spotify Premium required for playback control.');
        }
        throw new Error(error.response?.data?.error?.message || 'Failed to start playback');
      }
      throw error;
    }
  }

  /**
   * Get available devices for playback
   */
  async getDevices(): Promise<any> {
    try {
      const response = await this.api.get('/me/player/devices');
      return response.data.devices;
    } catch (error) {
      console.error('Failed to get devices:', error);
      return [];
    }
  }
}