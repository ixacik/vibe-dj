import type { SpotifyTokenResponse } from '@/types/spotify';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI || 'http://localhost:5173/callback';
const SCOPES = [
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-read-email',
  'user-read-private',
  'user-library-read',
  'user-library-modify',
];

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  return Array.from(array)
    .map(x => possible[x % possible.length])
    .join('');
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export class SpotifyAuth {
  private static readonly CODE_VERIFIER_KEY = 'spotify_code_verifier';
  private static readonly STATE_KEY = 'spotify_auth_state';
  private static readonly TOKEN_KEY = 'spotify_tokens';
  private static readonly TOKEN_EXPIRY_KEY = 'spotify_token_expiry';

  static async initiateAuth(): Promise<void> {
    if (!isBrowser) {
      throw new Error('Authentication can only be initiated in the browser');
    }

    const codeVerifier = generateRandomString(128);
    const state = generateRandomString(16);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    localStorage.setItem(this.CODE_VERIFIER_KEY, codeVerifier);
    localStorage.setItem(this.STATE_KEY, state);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      state,
      scope: SCOPES.join(' '),
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

    window.location.href = `${SPOTIFY_AUTH_URL}?${params}`;
  }

  static async handleCallback(code: string, state: string): Promise<SpotifyTokenResponse> {
    if (!isBrowser) {
      throw new Error('Callback can only be handled in the browser');
    }

    const savedState = localStorage.getItem(this.STATE_KEY);
    const codeVerifier = localStorage.getItem(this.CODE_VERIFIER_KEY);

    if (!savedState || savedState !== state) {
      throw new Error('Invalid state parameter');
    }

    if (!codeVerifier) {
      throw new Error('Code verifier not found');
    }

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Failed to exchange code for token');
    }

    const tokens: SpotifyTokenResponse = await response.json();
    this.storeTokens(tokens);

    // Clean up
    if (isBrowser) {
      localStorage.removeItem(this.CODE_VERIFIER_KEY);
      localStorage.removeItem(this.STATE_KEY);
    }

    return tokens;
  }

  static async refreshToken(): Promise<SpotifyTokenResponse> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Failed to refresh token');
    }

    const tokens: SpotifyTokenResponse = await response.json();
    this.storeTokens(tokens);
    return tokens;
  }

  static storeTokens(tokens: SpotifyTokenResponse): void {
    if (!isBrowser) return;

    localStorage.setItem(this.TOKEN_KEY, JSON.stringify(tokens));
    const expiryTime = Date.now() + (tokens.expires_in * 1000);
    localStorage.setItem(this.TOKEN_EXPIRY_KEY, expiryTime.toString());
  }

  static getAccessToken(): string | null {
    if (!isBrowser) return null;

    const tokensStr = localStorage.getItem(this.TOKEN_KEY);
    if (!tokensStr) return null;

    const tokens: SpotifyTokenResponse = JSON.parse(tokensStr);
    return tokens.access_token;
  }

  static getRefreshToken(): string | null {
    if (!isBrowser) return null;

    const tokensStr = localStorage.getItem(this.TOKEN_KEY);
    if (!tokensStr) return null;

    const tokens: SpotifyTokenResponse = JSON.parse(tokensStr);
    return tokens.refresh_token;
  }

  static isTokenExpired(): boolean {
    if (!isBrowser) return true;

    const expiryStr = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
    if (!expiryStr) return true;

    const expiry = parseInt(expiryStr, 10);
    // Refresh 5 minutes before expiry
    return Date.now() >= (expiry - 5 * 60 * 1000);
  }

  static async getValidToken(): Promise<string> {
    if (this.isTokenExpired()) {
      const tokens = await this.refreshToken();
      return tokens.access_token;
    }

    const token = this.getAccessToken();
    if (!token) {
      throw new Error('No access token available');
    }

    return token;
  }

  static clearTokens(): void {
    if (!isBrowser) return;

    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.TOKEN_EXPIRY_KEY);
    localStorage.removeItem(this.CODE_VERIFIER_KEY);
    localStorage.removeItem(this.STATE_KEY);
  }

  static isAuthenticated(): boolean {
    return !!this.getAccessToken() && !this.isTokenExpired();
  }
}