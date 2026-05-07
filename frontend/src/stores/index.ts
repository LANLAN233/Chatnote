import { create } from "zustand";
import { authApi, serverApi, channelApi, noteApi, aiApi, settingsApi, apiKeyApi, threadApi } from "../services";
import wsService from "../services/websocket";
import type { Channel, Note, NoteList, Server, SmartCreateResult, ThreadResponse, User, UserApiKey, UserSettingsUpdate } from "../types";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  theme: string;
  apiKeys: UserApiKey[];
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateSettings: (data: UserSettingsUpdate) => Promise<void>;
  setTheme: (theme: string) => void;
  fetchApiKeys: () => Promise<void>;
  addApiKey: (data: { provider: string; api_key: string; model?: string }) => Promise<void>;
  deleteApiKey: (id: number) => Promise<void>;
}

const getInitialTheme = () => "dark";

const applyTheme = (theme: string) => {
  localStorage.setItem("theme", theme);
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("token"),
  isAuthenticated: !!localStorage.getItem("token"),
  isLoading: false,
  theme: getInitialTheme(),
  apiKeys: [],
  login: async (username, password) => {
    const { data } = await authApi.login({ username, password });
    const responseData = data.data;
    if (responseData) {
      localStorage.setItem("token", responseData.token.access_token);
      const userTheme = responseData.user.theme || "dark";
      applyTheme(userTheme);
      set({ user: responseData.user, token: responseData.token.access_token, isAuthenticated: true, theme: userTheme });
      wsService.connect();
    }
  },
  register: async (username, password, displayName) => {
    const { data } = await authApi.register({ username, password, display_name: displayName });
    const responseData = data.data;
    if (responseData) {
      localStorage.setItem("token", responseData.token.access_token);
      const userTheme = responseData.user.theme || "dark";
      applyTheme(userTheme);
      set({ user: responseData.user, token: responseData.token.access_token, isAuthenticated: true, theme: userTheme });
      wsService.connect();
    }
  },
  logout: () => {
    localStorage.removeItem("token");
    wsService.disconnect();
    set({ user: null, token: null, isAuthenticated: false });
  },
  fetchMe: async () => {
    try {
      const { data } = await authApi.me();
      if (data.data) {
        const userTheme = data.data.theme || "dark";
        applyTheme(userTheme);
        set({ user: data.data, isAuthenticated: true, theme: userTheme });
        wsService.connect();
      }
    } catch {
      set({ user: null, token: null, isAuthenticated: false });
      localStorage.removeItem("token");
    }
  },
  updateSettings: async (settingsData) => {
    const { data } = await settingsApi.update(settingsData);
    if (data.data) {
      const newTheme = data.data.theme;
      if (newTheme) applyTheme(newTheme);
      set({ user: data.data, theme: newTheme || getInitialTheme() });
    }
  },
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  fetchApiKeys: async () => {
    try {
      const { data } = await apiKeyApi.list();
      set({ apiKeys: (data.data as UserApiKey[]) || [] });
    } catch {
      set({ apiKeys: [] });
    }
  },
  addApiKey: async (keyData) => {
    await apiKeyApi.create(keyData);
    await get().fetchApiKeys();
  },
  deleteApiKey: async (id) => {
    await apiKeyApi.delete(id);
    await get().fetchApiKeys();
  },
}));

interface ServerState {
  servers: Server[];
  currentServerId: number | null;
  isLoading: boolean;
  fetchServers: () => Promise<void>;
  createServer: (data: { name: string; description?: string }) => Promise<void>;
  updateServer: (id: number, data: { name?: string; description?: string }) => Promise<void>;
  deleteServer: (id: number) => Promise<void>;
  setCurrentServer: (id: number | null) => void;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  currentServerId: null,
  isLoading: false,
  fetchServers: async () => {
    set({ isLoading: true });
    const { data } = await serverApi.list();
    set({ servers: (data.data as Server[]) || [], isLoading: false });
  },
  createServer: async (data) => {
    await serverApi.create(data);
    await get().fetchServers();
  },
  updateServer: async (id, data) => {
    await serverApi.update(id, data);
    await get().fetchServers();
  },
  deleteServer: async (id) => {
    await serverApi.delete(id);
    if (get().currentServerId === id) {
      set({ currentServerId: null });
    }
    await get().fetchServers();
  },
  setCurrentServer: (id) => set({ currentServerId: id }),
}));

interface ChannelState {
  channels: Channel[];
  currentChannelId: number | null;
  isLoading: boolean;
  fetchChannels: (serverId: number) => Promise<void>;
  createChannel: (serverId: number, data: { name: string; description?: string }) => Promise<void>;
  updateChannel: (serverId: number, channelId: number, data: { name?: string; description?: string }) => Promise<void>;
  deleteChannel: (serverId: number, channelId: number) => Promise<void>;
  setCurrentChannel: (id: number | null) => void;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  currentChannelId: null,
  isLoading: false,
  fetchChannels: async (serverId) => {
    set({ isLoading: true });
    const { data } = await channelApi.list(serverId);
    set({ channels: (data.data as Channel[]) || [], isLoading: false });
  },
  createChannel: async (serverId, data) => {
    await channelApi.create(serverId, data);
    await get().fetchChannels(serverId);
  },
  updateChannel: async (serverId, channelId, data) => {
    await channelApi.update(serverId, channelId, data);
    await get().fetchChannels(serverId);
  },
  deleteChannel: async (serverId, channelId) => {
    await channelApi.delete(serverId, channelId);
    if (get().currentChannelId === channelId) {
      set({ currentChannelId: null });
    }
    await get().fetchChannels(serverId);
  },
  setCurrentChannel: (id) => set({ currentChannelId: id }),
}));

interface NoteState {
  notes: Note[];
  currentNote: Note | null;
  isLoading: boolean;
  realtimeNotes: Note[];
  fetchNotes: (channelId: number, search?: string) => Promise<void>;
  createNote: (data: { channel_id: number; content: string; content_type?: string; auto_classify?: boolean; reply_to_id?: number; user_tags?: string }) => Promise<Note | null>;
  smartCreateNote: (content: string, autoClassify?: boolean) => Promise<void>;
  updateNote: (id: number, data: { content?: string }) => Promise<void>;
  deleteNote: (id: number) => Promise<void>;
  searchNotes: (query: string) => Promise<Note[]>;
  addRealtimeNote: (note: Note) => void;
  updateRealtimeNote: (note: Note) => void;
  removeRealtimeNote: (noteId: number) => void;
  clearRealtimeNotes: () => void;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  currentNote: null,
  isLoading: false,
  realtimeNotes: [],
  fetchNotes: async (channelId, search) => {
    set({ isLoading: true });
    const { data } = await noteApi.list(channelId, search);
    const noteList = data.data as NoteList;
    set({
      notes: noteList?.items || [],
      isLoading: false,
    });
  },
  createNote: async (data) => {
    const hasExplicitTarget = /[@#]/.test(data.content);
    if (hasExplicitTarget) {
      // Always respect explicit @# targeting regardless of AI toggle
      const serverMatch = data.content.match(/^@([^\s#]+)/);
      const channelMatch = data.content.match(/^@[^\s#]+\s+#([^\s]+)/);
      const serverName = serverMatch ? serverMatch[1] : undefined;
      const channelName = channelMatch ? channelMatch[1] : undefined;
      const { data: response } = await aiApi.smartCreate(
        data.content, data.auto_classify ?? true, data.channel_id, serverName, channelName
      );
      const result = response.data as SmartCreateResult | null;
      if (data.channel_id) await get().fetchNotes(data.channel_id);
      return result?.note || null;
    }
    // Normal creation: pin to current channel when inside a channel
    const { data: response } = await noteApi.create({
      channel_id: data.channel_id,
      content: data.content,
      content_type: data.content_type || "markdown",
      reply_to_id: data.reply_to_id,
      user_tags: data.user_tags,
    });
    const note = response.data as Note | null;
    await get().fetchNotes(data.channel_id);
    return note;
  },
  smartCreateNote: async (content, autoClassify = true) => {
    await aiApi.smartCreate(content, autoClassify);
  },
  updateNote: async (id, data) => {
    await noteApi.update(id, data);
    const state = get();
    if (state.notes.length > 0) {
      const channelId = state.notes[0].channel_id;
      await get().fetchNotes(channelId);
    }
  },
  deleteNote: async (id) => {
    const state = get();
    const channelId = state.notes[0]?.channel_id;
    await noteApi.delete(id);
    if (channelId) {
      await get().fetchNotes(channelId);
    }
  },
  searchNotes: async (query) => {
    const { data } = await noteApi.search(query);
    return (data.data as Note[]) || [];
  },
  addRealtimeNote: (note) => {
    set((state) => ({
      realtimeNotes: [note, ...state.realtimeNotes].slice(0, 10),
      notes: state.notes.some((n) => n.id === note.id) ? state.notes : [note, ...state.notes],
    }));
  },
  updateRealtimeNote: (note) => {
    set((state) => ({
      notes: state.notes.map((n) => (n.id === note.id ? note : n)),
      realtimeNotes: state.realtimeNotes.map((n) => (n.id === note.id ? note : n)),
    }));
  },
  removeRealtimeNote: (noteId) => {
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== noteId),
      realtimeNotes: state.realtimeNotes.filter((n) => n.id !== noteId),
    }));
  },
  clearRealtimeNotes: () => set({ realtimeNotes: [] }),
}));

interface ThreadState {
  currentThreadId: number | null;
  thread: ThreadResponse | null;
  isLoading: boolean;
  threadCounts: Record<number, number>;
  setCurrentThreadId: (id: number | null) => void;
  clearCurrentThreadId: () => void;
  fetchThread: (id: number) => Promise<void>;
  fetchThreadCount: (id: number) => Promise<void>;
  updateThreadTitle: (id: number, title: string) => Promise<void>;
  postMessage: (threadId: number, content: string) => Promise<void>;
  createThread: (noteId: number, title?: string) => Promise<ThreadResponse | null>;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  currentThreadId: null,
  thread: null,
  isLoading: false,
  threadCounts: {},
  setCurrentThreadId: (id) => set({ currentThreadId: id }),
  clearCurrentThreadId: () => set({ currentThreadId: null, thread: null }),
  fetchThread: async (id) => {
    set({ isLoading: true });
    try {
      const { data } = await threadApi.get(id);
      if (data.success && data.data) {
        set({ thread: data.data, isLoading: false });
        // Cache the count (exclude parent message)
        const count = data.data.messages ? data.data.messages.length - 1 : 0;
        set((state) => ({
          threadCounts: { ...state.threadCounts, [id]: count },
        }));
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
  fetchThreadCount: async (id) => {
    // Skip if already cached
    if (get().threadCounts[id] !== undefined) return;
    try {
      const { data } = await threadApi.get(id);
      if (data.success && data.data) {
        const count = data.data.messages ? data.data.messages.length - 1 : 0;
        set((state) => ({
          threadCounts: { ...state.threadCounts, [id]: count },
        }));
      }
    } catch {
      // Silently fail — count stays unknown
    }
  },
  updateThreadTitle: async (id, title) => {
    await threadApi.update(id, { title });
    await get().fetchThread(id);
  },
  postMessage: async (threadId, content) => {
    await threadApi.postMessage(threadId, content);
    await get().fetchThread(threadId);
  },
  createThread: async (noteId, title) => {
    try {
      const { data } = await threadApi.createThread(noteId, title);
      if (data.success && data.data) {
        set({ currentThreadId: data.data.id });
        // Cache count as 0 (no replies yet, parent excluded)
        set((state) => ({
          threadCounts: { ...state.threadCounts, [data.data!.id]: 0 },
        }));
        return data.data;
      }
      return null;
    } catch {
      return null;
    }
  },
}));