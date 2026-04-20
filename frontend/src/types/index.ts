export interface User {
  id: number;
  username: string;
  display_name: string | null;
  avatar: string | null;
  status: string;
  preferred_llm: string;
  created_at: string;
  updated_at: string;
}

export interface Server {
  id: number;
  user_id: number;
  name: string;
  icon: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: number;
  server_id: number;
  name: string;
  type: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  channel_id: number;
  user_id: number;
  content: string;
  content_type: string;
  raw_input: string | null;
  ai_category: string | null;
  ai_summary: string | null;
  ai_confidence: number | null;
  ai_tags: string | null;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface NoteList {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message?: string;
}

export interface ServerCreate {
  name: string;
  icon?: string;
  description?: string;
  sort_order?: number;
}

export interface ServerUpdate {
  name?: string;
  icon?: string;
  description?: string;
  sort_order?: number;
}

export interface ChannelCreate {
  name: string;
  type?: string;
  description?: string;
  sort_order?: number;
}

export interface ChannelUpdate {
  name?: string;
  type?: string;
  description?: string;
  sort_order?: number;
}

export interface NoteCreate {
  channel_id: number;
  content: string;
  content_type?: string;
  raw_input?: string;
  ai_category?: string;
  ai_summary?: string;
  ai_confidence?: number;
  ai_tags?: string;
}

export interface NoteUpdate {
  content?: string;
  content_type?: string;
  ai_category?: string;
  ai_summary?: string;
  ai_confidence?: number;
  ai_tags?: string;
}

export interface ClassificationResult {
  suggested_server: string;
  suggested_channel: string;
  confidence: number;
  tags: string[];
  summary: string;
  is_new_server: boolean;
  is_new_channel: boolean;
  server_id?: number;
  channel_id?: number;
}

export interface ConsoleResult {
  type: string;
  content?: string | null;
  data?: unknown;
}

export interface SmartCreateResult {
  note: Note;
  server_id: number;
  channel_id: number;
}

export interface StatsData {
  total_servers: number;
  total_channels: number;
  total_notes: number;
  recent_notes: Note[];
}

export interface ConsoleLog {
  id: string;
  type: "input" | "output" | "error" | "system";
  content: string;
  timestamp: Date;
}