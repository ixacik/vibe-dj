import { useState, useEffect, useCallback } from 'react';
import type { PlayedTrack } from '@/types/conversation';

const STORAGE_KEY = 'vibe-dj-played-tracks';
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

export function usePlayedTracks() {
  const [tracks, setTracks] = useState<PlayedTrack[]>([]);

  // Load tracks from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as PlayedTrack[];
          // Filter out tracks older than 30 minutes
          const now = Date.now();
          const validTracks = parsed.filter(
            track => now - track.timestamp < TIMEOUT_MS
          );
          setTracks(validTracks);
        } catch (error) {
          console.error('Failed to parse played tracks:', error);
        }
      }
    }
  }, []);

  // Save tracks to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (tracks.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [tracks]);

  // Periodically clean up old tracks
  useEffect(() => {
    const interval = setInterval(() => {
      setTracks(prev => {
        const now = Date.now();
        return prev.filter(track => now - track.timestamp < TIMEOUT_MS);
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const addTrack = useCallback((track: Omit<PlayedTrack, 'timestamp'>) => {
    setTracks(prev => [
      ...prev,
      {
        ...track,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const addTracks = useCallback((newTracks: Array<Omit<PlayedTrack, 'timestamp'>>) => {
    const timestamp = Date.now();
    setTracks(prev => [
      ...prev,
      ...newTracks.map(track => ({
        ...track,
        timestamp,
      })),
    ]);
  }, []);

  const isRecentlyPlayed = useCallback((artist: string, title: string): boolean => {
    const now = Date.now();
    return tracks.some(
      track =>
        track.artist.toLowerCase() === artist.toLowerCase() &&
        track.title.toLowerCase() === title.toLowerCase() &&
        now - track.timestamp < TIMEOUT_MS
    );
  }, [tracks]);

  const getRecentTracks = useCallback((): PlayedTrack[] => {
    const now = Date.now();
    return tracks.filter(track => now - track.timestamp < TIMEOUT_MS);
  }, [tracks]);

  const clearTracks = useCallback(() => {
    setTracks([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return {
    tracks,
    addTrack,
    addTracks,
    isRecentlyPlayed,
    getRecentTracks,
    clearTracks,
  };
}