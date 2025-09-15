export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      loved_songs: {
        Row: {
          id: string
          user_id: string
          spotify_track_id: string
          name: string
          artist: string
          album: string | null
          album_art: string | null
          loved_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          user_id: string
          spotify_track_id: string
          name: string
          artist: string
          album?: string | null
          album_art?: string | null
          loved_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          user_id?: string
          spotify_track_id?: string
          name?: string
          artist?: string
          album?: string | null
          album_art?: string | null
          loved_at?: string
          metadata?: Json
        }
      }
      user_sessions: {
        Row: {
          id: string
          user_id: string
          conversation_history: Json
          played_tracks: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          conversation_history?: Json
          played_tracks?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          conversation_history?: Json
          played_tracks?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}