export interface User {
  id: number;
  username: string;
  display_name: string | null;
  avatar: string | null;
  status: string;
  preferred_llm: string;
  enabled_providers: string[] | null;
  theme: string;
  notifications_enabled: boolean;
  api_key_encrypted: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsUpdate {
  display_name?: string;
  preferred_llm?: string;
  enabled_providers?: string[];
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
  primary_channel_id?: number | null;
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

export interface Attachment {
  id: number;
  note_id: number;
  filename: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
  created_at: string;
}

export interface NoteReplyPreview {
  id: number;
  content: string;
  user_id: number;
  created_at: string;
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
  is_pinned: boolean;
  reply_to_id: number | null;
  user_tags: string | null;
  thread_id?: number | null;
  reply_preview?: NoteReplyPreview | null;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  attachments?: Attachment[];
}

export interface NoteList {
  items: Note[];
  total: number;
  page: number;
  page_size: number;
}

export type SearchSource = 'vector' | 'fulltext' | 'hybrid';

export interface NoteSearchResult {
  note_id: number;
  content: string;
  score: number;
  source: SearchSource;
  channel_id?: number | null;
  user_id?: number | null;
  ai_summary?: string | null;
  ai_tags?: string | null;
  created_at?: string | null;
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
  reply_to_id?: number;
  user_tags?: string;
}

export interface NoteUpdate {
  content?: string;
  content_type?: string;
  ai_category?: string;
  ai_summary?: string;
  ai_confidence?: number;
  ai_tags?: string;
  user_tags?: string;
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

export interface ConsoleImportRequest {
  content: string;
  server_id?: number;
  channel_id?: number;
  target_text?: string;
}

export interface ConsoleImportResult {
  note: Note;
  server_id: number;
  channel_id: number;
}

export interface SmartCreateResult {
  note: Note;
  server_id: number;
  channel_id: number;
}

export interface WeeklyTrendItem {
  date: string;
  count: number;
}

export interface ServerDistributionItem {
  server_name: string;
  note_count: number;
}

export interface TopTagItem {
  tag: string;
  count: number;
}

export interface RecentNote extends Note {
  channel_name: string;
  server_id: number;
  server_name: string;
}

export interface StatsData {
  total_servers: number;
  total_channels: number;
  total_notes: number;
  study_streak: number;
  weekly_trend: WeeklyTrendItem[];
  server_distribution: ServerDistributionItem[];
  top_tags: TopTagItem[];
  yesterday_notes: Note[];
  inbox_pending_count: number;
  recent_notes: RecentNote[];
}

export interface InboxItem {
  id: number;
  user_id: number;
  content: string;
  raw_input: string | null;
  ai_suggested_server: string | null;
  ai_suggested_channel: string | null;
  ai_tags: string | null;
  ai_summary: string | null;
  ai_confidence: number | null;
  ai_reviewed?: boolean;
  ensemble_consistency?: string | null;
  fast_confidence?: number;
  strong_confidence?: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface InboxItemCreate {
  content: string;
  raw_input?: string;
}

export interface InboxItemArchiveRequest {
  server_id?: number;
  channel_id?: number;
  create_server_name?: string;
  create_channel_name?: string;
}

export interface ConsoleLog {
  id: string;
  type: "input" | "output" | "error" | "system";
  content: string;
  timestamp: Date;
}

export interface QuerySource {
  note_id?: number;
  excerpt: string;
  channel: string;
  server: string;
}

export interface ToolCall {
  tool_name: string;
  input: Record<string, unknown> | null;
  error?: string | null;
}

export interface ToolResult {
  tool_name: string;
  input?: Record<string, unknown> | null;
  output: string | null;
  error?: string | null;
}

export interface ConsoleMessageMetadata {
  sources?: QuerySource[];
  server_name?: string;
  channel_name?: string;
  total_notes_fetched?: number;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  // Web preview
  url?: string;
  title?: string;
  web_summary?: string;
  favicon?: string;
  // Code execution
  code?: string;
  output?: string;
  language?: string;
  // Agent pipeline stages
  stages?: AiProgressStage[];
}

export interface ConsoleMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  type: string;
  created_at: string;
  metadata?: ConsoleMessageMetadata;
}

export interface ConsoleSession {
  id: number;
  user_id: number;
  server_id: number | null;
  title: string;
  loaded_context?: string | null;
  created_at: string;
  updated_at: string;
  messages?: ConsoleMessage[];
}

export interface LoadedContext {
  server_name: string;
  channel_name: string | null;
  server_id: number;
  channel_id: number | null;
  notes_count: number;
  notes?: string[];
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

export interface UserApiKey {
  id: number;
  user_id: number;
  provider: string;
  api_key_masked: string;
  model: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Tier → model mapping for a single provider */
export interface ProviderTierModel {
  model: string;
  label: string;  // "快速" | "标准" | "高级" | "多模态"
}

/** Full provider info returned by GET /api/settings/api-keys/providers */
export interface ProviderInfo {
  id: string;
  name: string;
  models: Record<string, ProviderTierModel>;  // fast, default, strong, vision
  has_real_vision: boolean;
  has_api_key: boolean;
  preset_models: string[];
  base_url: string;
}

export interface ScheduleImportChannel {
  name: string;
  notes: Array<{ content: string }>;
}

export interface ScheduleImportServer {
  name: string;
  channels: ScheduleImportChannel[];
}

export interface ScheduleImportSuggestion {
  type: string;
  target_server: string | null;
  message: string;
}

export interface ScheduleImportItem extends Schedule {
  server_name?: string;
}

export interface ScheduleImportResult {
  servers: ScheduleImportServer[];
  schedules: ScheduleImportItem[];
  suggestions: ScheduleImportSuggestion[];
}

export interface ServerFile {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  file_category: string;
  created_at: string;
  url: string;
}

export interface DailySummaryListItem {
  date: string;
  summary: string;
  total_notes: number;
  keywords?: Array<{ keyword: string; note_ids: number[] }>;
  highlight_note_id?: number | null;
  stages?: DailySummaryStage[];
}

export interface DailySummaryStage {
  name: string;
  status: string;
  duration_ms: number;
  error?: string;
}

export interface DailySummaryResponse {
  summary: string;
  keywords: Array<{ keyword: string; note_ids: number[] }>;
  total_notes: number;
  highlight_note_id: number | null;
  stages?: DailySummaryStage[];
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailySummaryListItem {
  date: string;
  total_notes: number;
  is_edited: boolean;
  created_at: string;
}

export interface ThreadResponse {
  id: number;
  channel_id: number;
  parent_note_id: number;
  title: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  messages: Note[];
}

export interface AiProgressStage {
  stage: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped" | "fallback";
  model: string;
  tier: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  duration_ms?: number | null;
  progress_pct?: number | null;
}

export interface AiProgressEvent {
  operation_id: string;
  stages: AiProgressStage[];
  current_stage: number;
  overall_status: string;
}
