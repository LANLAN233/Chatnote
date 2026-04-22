export interface User {
  id: number;
  username: string;
  display_name: string | null;
  avatar: string | null;
  status: string;
  preferred_llm: string;
  theme: string;
  notifications_enabled: boolean;
  api_key_encrypted: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsUpdate {
  display_name?: string;
  preferred_llm?: string;
  api_key?: string;
  theme?: string;
  notifications_enabled?: boolean;
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

export interface RepeatRule {
  type: "none" | "daily" | "weekly" | "monthly";
  days?: number[];
  start_date?: string;
  end_date?: string;
  interval?: number;
}

export interface Schedule {
  id: number;
  user_id: number;
  server_id: number | null;
  channel_id: number | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  date: string | null;
  day_of_week: number | null;
  repeat_rule: string | null;
  reminder_minutes: number;
  color: string;
  is_all_day: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleCreate {
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  date?: string;
  day_of_week?: number;
  repeat_rule?: string;
  reminder_minutes?: number;
  color?: string;
  is_all_day?: boolean;
  server_id?: number;
  channel_id?: number;
}

export interface ScheduleUpdate {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  date?: string;
  day_of_week?: number;
  repeat_rule?: string;
  reminder_minutes?: number;
  color?: string;
  is_all_day?: boolean;
  server_id?: number;
  channel_id?: number;
}

export interface ScheduleParseRequest {
  text: string;
}

export interface ScheduleParseResponse {
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  date: string | null;
  day_of_week: number | null;
  repeat_rule: RepeatRule | null;
  is_all_day: boolean;
  confidence: number;
}