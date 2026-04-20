import api from "./api";
import type {
  ApiResponse,
  Channel,
  ChannelCreate,
  ChannelUpdate,
  ClassificationResult,
  ConsoleResult,
  Note,
  NoteCreate,
  NoteList,
  NoteUpdate,
  Server,
  ServerCreate,
  ServerUpdate,
  SmartCreateResult,
  StatsData,
  User,
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
  list: (channelId: number, page?: number, pageSize?: number, search?: string) => {
    const params: Record<string, unknown> = {};
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    if (search) params.search = search;
    return api.get<ApiResponse<NoteList>>(`/channels/${channelId}/notes`, { params });
  },
  get: (id: number) => api.get<ApiResponse<Note>>(`/notes/${id}`),
  create: (data: NoteCreate) => api.post<ApiResponse<Note>>("/notes", data),
  update: (id: number, data: NoteUpdate) => api.put<ApiResponse<Note>>(`/notes/${id}`, data),
  delete: (id: number) => api.delete<ApiResponse<null>>(`/notes/${id}`),
  search: (q: string) => api.get<ApiResponse<Note[]>>("/notes/search", { params: { q } }),
};

export const aiApi = {
  classify: (content: string) =>
    api.post<ApiResponse<ClassificationResult>>("/ai/classify", { content }),
  smartCreate: (content: string, autoClassify = true) =>
    api.post<ApiResponse<SmartCreateResult>>("/notes/smart-create", {
      content,
      auto_classify: autoClassify,
    }),
};

export const consoleApi = {
  execute: (input: string) =>
    api.post<ApiResponse<ConsoleResult | SmartCreateResult>>("/console/execute", { input }),
};

export const statsApi = {
  get: () => api.get<ApiResponse<StatsData>>("/stats"),
};