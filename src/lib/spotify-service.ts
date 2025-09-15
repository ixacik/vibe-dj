import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { SupabaseAuth } from './supabase-auth';
import type {
  SpotifyTrack,
  SpotifySearchResponse,
  SpotifyUser,
  SpotifyPlaybackState,
  SpotifyError,
  SpotifyQueue,
  SavedTrackObject
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
      const token = await SupabaseAuth.getSpotifyToken();
      if (!token) {
        throw new Error('No Spotify access token available');
      }
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    // Add error interceptor for token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<SpotifyError>) => {
        if (error.response?.status === 401) {
          try {
            // Try to refresh the session
            await SupabaseAuth.refreshSession();

            // Retry the original request with new token
            const token = await SupabaseAuth.getSpotifyToken();
            if (token && error.config) {
              error.config.headers.Authorization = `Bearer ${token}`;
              return this.api.request(error.config);
            }
          } catch (refreshError) {
            // Session refresh failed, user needs to re-authenticate
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
    // Step 1: Search for all tracks in parallel
    const searchPromises = tracks.map(async ({ artist, title }) => {
      try {
        const track = await this.searchTrackByArtistAndTitle(artist, title);
        return {
          success: !!track,
          track,
          artist,
          title,
          error: track ? undefined : `Track not found: ${artist} - ${title}`
        };
      } catch (error) {
        return {
          success: false,
          track: undefined,
          artist,
          title,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // Step 2: Add found tracks to queue in parallel
    const queuePromises = searchResults.map(async (result) => {
      if (result.success && result.track) {
        try {
          await this.addToQueue(result.track.uri);
          return {
            success: true,
            track: result.track
          };
        } catch (error) {
          return {
            success: false,
            track: result.track,
            error: error instanceof Error ? error.message : 'Failed to add to queue'
          };
        }
      }
      return {
        success: false,
        error: result.error
      };
    });

    return Promise.all(queuePromises);
  }

  async saveTracks(trackIds: string[]): Promise<void> {
    try {
      // Spotify API accepts max 50 tracks per request
      const chunks = [];
      for (let i = 0; i < trackIds.length; i += 50) {
        chunks.push(trackIds.slice(i, i + 50));
      }

      await Promise.all(
        chunks.map(chunk =>
          this.api.put('/me/tracks', { ids: chunk })
        )
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const spotifyError = error.response?.data as SpotifyError;
        throw new Error(spotifyError?.error?.message || 'Failed to save tracks');
      }
      throw error;
    }
  }

  async removeSavedTracks(trackIds: string[]): Promise<void> {
    try {
      // Spotify API accepts max 50 tracks per request
      const chunks = [];
      for (let i = 0; i < trackIds.length; i += 50) {
        chunks.push(trackIds.slice(i, i + 50));
      }

      await Promise.all(
        chunks.map(chunk =>
          this.api.delete('/me/tracks', { data: { ids: chunk } })
        )
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const spotifyError = error.response?.data as SpotifyError;
        throw new Error(spotifyError?.error?.message || 'Failed to remove tracks');
      }
      throw error;
    }
  }

  async checkSavedTracks(trackIds: string[]): Promise<boolean[]> {
    try {
      // Spotify API accepts max 50 tracks per request
      const results: boolean[] = [];

      for (let i = 0; i < trackIds.length; i += 50) {
        const chunk = trackIds.slice(i, i + 50);
        const response = await this.api.get<boolean[]>('/me/tracks/contains', {
          params: { ids: chunk.join(',') }
        });
        results.push(...response.data);
      }

      return results;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const spotifyError = error.response?.data as SpotifyError;
        throw new Error(spotifyError?.error?.message || 'Failed to check saved tracks');
      }
      throw error;
    }
  }

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

  async getDevices(): Promise<any> {
    try {
      const response = await this.api.get('/me/player/devices');
      return response.data.devices;
    } catch (error) {
      console.error('Failed to get devices:', error);
      return [];
    }
  }

  async getLikedSongs(limit: number = 50, offset: number = 0): Promise<{
    items: SavedTrackObject[];
    total: number;
    next: string | null;
  }> {
    try {
      const response = await this.api.get('/me/tracks', {
        params: { limit, offset }
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const spotifyError = error.response?.data as SpotifyError;
        throw new Error(spotifyError?.error?.message || 'Failed to fetch liked songs');
      }
      throw error;
    }
  }

}