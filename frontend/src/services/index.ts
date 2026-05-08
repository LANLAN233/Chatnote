import api from "./api";
import type {
  ApiResponse,
  Channel,
  ChannelCreate,
  ChannelUpdate,
  ClassificationResult,
  ConsoleImportRequest,
  ConsoleImportResult,
  ConsoleResult,
  ConsoleSession,
  DailySummaryResponse,
  InboxItem,
  InboxItemArchiveRequest,
  InboxItemCreate,
  Note,
  NoteCreate,
  NoteList,
  NoteUpdate,
  ScheduleImportResult,
  Server,
  ServerCreate,
  ServerFile,
  ServerUpdate,
  SmartCreateResult,
  StatsData,
  ThreadResponse,
  User,
  UserApiKey,
} from "../types";

export const authApi = {
  register: (data: { username: string; password: string; display_name?: string }) =>
    api.post<ApiResponse<{ user: User; token: { access_token: string } }>>("/auth/register", data),
  login: (data: { username: string; password: string }) =>
    api.post<ApiResponse<{ user: User; token: { access_token: string } }>>("/auth/login", data),
  me: () => api.get<ApiResponse<User>>("/auth/me"),
};

export const serverApi = {
  list: () => api.get<ApiResponse<Server[]>>("/servers"),
  get: (id: number) => api.get<ApiResponse<Server>>(`/servers/${id}`),
  create: (data: ServerCreate) => api.post<ApiResponse<Server>>("/servers", data),
  update: (id: number, data: ServerUpdate) => api.put<ApiResponse<Server>>(`/servers/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/servers/${id}`),
};

export const channelApi = {
  list: (serverId: number) => api.get<ApiResponse<Channel[]>>(`/servers/${serverId}/channels`),
  get: (serverId: number, channelId: number) =>
    api.get<ApiResponse<Channel>>(`/servers/${serverId}/channels/${channelId}`),
  create: (serverId: number, data: ChannelCreate) =>
    api.post<ApiResponse<Channel>>(`/servers/${serverId}/channels`, data),
  update: (serverId: number, channelId: number, data: ChannelUpdate) =>
    api.put<ApiResponse<Channel>>(`/servers/${serverId}/channels/${channelId}`, data),
  delete: (serverId: number, channelId: number) =>
    api.delete<ApiResponse<null>>(`/servers/${serverId}/channels/${channelId}`),
};

export const noteApi = {
  list: (channelId: number, search?: string) => {
    const params: Record<string, unknown> = {};
    if (search) params.search = search;
    return api.get<ApiResponse<NoteList>>(`/channels/${channelId}/notes`, { params });
  },
  get: (id: number) => api.get<ApiResponse<Note>>(`/notes/${id}`),
  create: (data: NoteCreate) => api.post<ApiResponse<Note>>("/notes", data),
  update: (id: number, data: NoteUpdate) => api.put<ApiResponse<Note>>(`/notes/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/notes/${id}`),
  search: (q: string) => api.get<ApiResponse<Note[]>>("/notes/search", { params: { q } }),
  // Phase 12
  togglePin: (id: number) => api.put<ApiResponse<Note>>(`/notes/${id}/pin`),
  updateTags: (id: number, tags: string[]) => api.put<ApiResponse<Note>>(`/notes/${id}/tags`, tags),
  listPinned: (channelId: number) => api.get<ApiResponse<Note[]>>(`/channels/${channelId}/pinned`),
};

export const aiApi = {
  classify: (content: string) =>
    api.post<ApiResponse<ClassificationResult>>("/ai/classify", { content }),
  smartCreate: (content: string, autoClassify = true, channelId?: number, serverName?: string, channelName?: string) =>
    api.post<ApiResponse<SmartCreateResult>>("/notes/smart-create", {
      content,
      auto_classify: autoClassify,
      channel_id: channelId,
      server_name: serverName,
      channel_name: channelName,
    }),
  importSchedule: (text?: string, imageUrl?: string) => {
    return api.post<ApiResponse<ScheduleImportResult>>("/ai/import-schedule", {
      text,
      image_url: imageUrl,
    });
  },
};

export const apiKeyApi = {
  list: () => api.get<ApiResponse<UserApiKey[]>>("/settings/api-keys"),
  create: (data: { provider: string; api_key: string; model?: string }) =>
    api.post<ApiResponse<UserApiKey>>("/settings/api-keys", data),
  delete: (id: number) => api.delete<ApiResponse<void>>(`/settings/api-keys/${id}`),
  providers: () => api.get<ApiResponse<{ providers: Array<{ id: string; name: string; default_model: string; text_model: string; vision_model: string; base_url: string }> }>>("/settings/api-keys/providers"),
};

export const serverConsoleApi = {
  execute: (serverId: number, input: string, aiEnabled = false, sessionId?: number) =>
    api.post<ApiResponse<ConsoleResult>>(`/server/${serverId}/console/execute`, { input, ai_enabled: aiEnabled, session_id: sessionId }),
};

export const consoleApi = {
  execute: (input: string, aiEnabled = false, sessionId?: number) =>
    api.post<ApiResponse<ConsoleResult | SmartCreateResult>>("/console/execute", { input, ai_enabled: aiEnabled, session_id: sessionId }),
  importToChannel: (data: ConsoleImportRequest) =>
    api.post<ApiResponse<ConsoleImportResult>>("/console/import", data),
};

export const consoleSessionApi = {
  list: () => api.get<ApiResponse<ConsoleSession[]>>("/console/sessions"),
  create: (data: { title?: string; server_id?: number }) =>
    api.post<ApiResponse<ConsoleSession>>("/console/sessions", data),
  get: (id: number) => api.get<ApiResponse<ConsoleSession>>(`/console/sessions/${id}`),
  update: (id: number, data: { title?: string; loaded_context?: string | null }) =>
    api.put<ApiResponse<ConsoleSession>>(`/console/sessions/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/console/sessions/${id}`),
  archive: (id: number, data: { server_id: number; channel_id: number }) =>
    api.post<ApiResponse<{ note_id: number; channel_id: number; server_id: number }>>(`/console/sessions/${id}/archive`, data),
};

export const statsApi = {
  get: () => api.get<ApiResponse<StatsData>>("/stats"),
  getDailySummary: (date?: string) =>
    api.get<ApiResponse<DailySummaryResponse>>("/daily-summary", { params: date ? { date } : undefined }),
};

export const inboxApi = {
  list: (status?: string) =>
    api.get<ApiResponse<InboxItem[]>>("/inbox", { params: status ? { status } : undefined }),
  create: (data: InboxItemCreate) =>
    api.post<ApiResponse<InboxItem>>("/inbox", data),
  delete: (id: number) =>
    api.delete<ApiResponse<null>>(`/inbox/${id}`),
  update: (id: number, data: Partial<InboxItemCreate>) =>
    api.put<ApiResponse<InboxItem>>(`/inbox/${id}`, data),
  aiSuggest: (id: number) =>
    api.post<ApiResponse<InboxItem>>(`/inbox/${id}/ai-suggest`),
  archive: (id: number, data: InboxItemArchiveRequest) =>
    api.post<ApiResponse<{ note: Note; server_id: number; channel_id: number; inbox_item_id: number }>>(`/inbox/${id}/archive`, data),
};

export const serverFileApi = {
  list: (serverId: number, category?: string) =>
    api.get<ApiResponse<{ files: ServerFile[] }>>(`/server/${serverId}/files`, { params: category ? { category } : undefined }),
  upload: (serverId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<ApiResponse<ServerFile>>(`/server/${serverId}/files`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  delete: (serverId: number, fileId: number) =>
    api.delete<ApiResponse<null>>(`/server/${serverId}/files/${fileId}`),
};

export const threadApi = {
  get: (id: number) => api.get<ApiResponse<ThreadResponse>>(`/threads/${id}`),
  update: (id: number, data: { title: string }) => api.put<ApiResponse<ThreadResponse>>(`/threads/${id}`, data),
  postMessage: (threadId: number, content: string) => api.post<ApiResponse<Note>>(`/threads/${threadId}/messages`, { content }),
  createThread: (noteId: number, title?: string) =>
    api.post<ApiResponse<ThreadResponse>>(`/notes/${noteId}/thread`, title ? { title } : {}),
};

export { attachmentApi, type Attachment } from "./attachmentApi";
export { exportApi } from "./exportApi";
export { settingsApi } from "./settingsApi";
export { scheduleApi } from "./scheduleApi";
export { default as wsService } from "./websocket";
