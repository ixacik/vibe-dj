export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  recommendations?: Array<{
    artist: string;
    title: string;
  }>;
}

export interface PlayedTrack {
  artist: string;
  title: string;
  trackId?: string;
  timestamp: number;
  source: 'recommended' | 'queued';
}

export interface SessionData {
  sessionId: string;
  startedAt: number;
  lastActive: number;
}