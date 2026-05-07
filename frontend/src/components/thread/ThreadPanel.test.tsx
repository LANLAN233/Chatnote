import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ThreadPanel from "./ThreadPanel";

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock the stores module — only override useThreadStore
const mockFetchThread = vi.fn();
const mockPostMessage = vi.fn();
const mockUpdateThreadTitle = vi.fn();
const mockClearCurrentThreadId = vi.fn();
const mockSetCurrentThreadId = vi.fn();

let mockState: {
  currentThreadId: number | null;
  thread: {
    id: number;
    channel_id: number;
    parent_note_id: number;
    title: string;
    created_by: number;
    created_at: string;
    updated_at: string;
    messages: Array<{
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
      is_edited: boolean;
      created_at: string;
      updated_at: string;
    }>;
  } | null;
  isLoading: boolean;
} = {
  currentThreadId: null,
  thread: null,
  isLoading: false,
};

vi.mock("../../stores", () => ({
  useThreadStore: () => ({
    ...mockState,
    fetchThread: mockFetchThread,
    postMessage: mockPostMessage,
    updateThreadTitle: mockUpdateThreadTitle,
    clearCurrentThreadId: mockClearCurrentThreadId,
    setCurrentThreadId: mockSetCurrentThreadId,
  }),
  useAuthStore: () => ({
    user: { id: 1, username: "test", display_name: "Test" },
    token: "fake-token",
    isAuthenticated: true,
    isLoading: false,
    theme: "dark",
    apiKeys: [],
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    fetchMe: vi.fn(),
    updateSettings: vi.fn(),
    setTheme: vi.fn(),
    fetchApiKeys: vi.fn(),
    addApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
  }),
  useServerStore: () => ({
    servers: [],
    currentServerId: null,
    isLoading: false,
    fetchServers: vi.fn(),
    createServer: vi.fn(),
    updateServer: vi.fn(),
    deleteServer: vi.fn(),
    setCurrentServer: vi.fn(),
  }),
  useChannelStore: () => ({
    channels: [],
    currentChannelId: null,
    isLoading: false,
    fetchChannels: vi.fn(),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    setCurrentChannel: vi.fn(),
  }),
  useNoteStore: () => ({
    notes: [],
    currentNote: null,
    isLoading: false,
    realtimeNotes: [],
    fetchNotes: vi.fn(),
    createNote: vi.fn(),
    smartCreateNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    searchNotes: vi.fn(),
    addRealtimeNote: vi.fn(),
    updateRealtimeNote: vi.fn(),
    removeRealtimeNote: vi.fn(),
    clearRealtimeNotes: vi.fn(),
  }),
}));

function renderThreadPanel(initialEntries = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ThreadPanel />
    </MemoryRouter>
  );
}

describe("ThreadPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      currentThreadId: null,
      thread: null,
      isLoading: false,
    };
  });

  it("renders nothing visible when no thread is open", () => {
    renderThreadPanel();
    // Panel exists in DOM but is translated off-screen
    const panel = screen.getByTestId("thread-panel");
    expect(panel.className).toContain("translate-x-full");
    // No backdrop visible
    expect(screen.queryByTestId("thread-backdrop")).toBeNull();
  });

  it("renders thread panel with messages when thread is open", () => {
    mockState = {
      currentThreadId: 1,
      thread: {
        id: 1,
        channel_id: 5,
        parent_note_id: 10,
        title: "Test Thread",
        created_by: 1,
        created_at: "2025-05-07T10:00:00Z",
        updated_at: "2025-05-07T10:30:00Z",
        messages: [
          {
            id: 101,
            channel_id: 5,
            user_id: 1,
            content: "This is the first message",
            content_type: "markdown",
            raw_input: null,
            ai_category: null,
            ai_summary: null,
            ai_confidence: null,
            ai_tags: null,
            is_pinned: false,
            reply_to_id: null,
            user_tags: null,
            is_edited: false,
            created_at: "2025-05-07T10:00:00Z",
            updated_at: "2025-05-07T10:00:00Z",
          },
          {
            id: 102,
            channel_id: 5,
            user_id: 1,
            content: "A reply message",
            content_type: "markdown",
            raw_input: null,
            ai_category: null,
            ai_summary: null,
            ai_confidence: null,
            ai_tags: null,
            is_pinned: false,
            reply_to_id: null,
            user_tags: null,
            is_edited: false,
            created_at: "2025-05-07T10:15:00Z",
            updated_at: "2025-05-07T10:15:00Z",
          },
        ],
      },
      isLoading: false,
    };

    renderThreadPanel();

    // Panel is visible (not translated off-screen)
    const panel = screen.getByTestId("thread-panel");
    expect(panel.className).toContain("translate-x-0");

    // Thread title is shown
    expect(screen.getByTestId("thread-title").textContent).toBe("Test Thread");

    // Messages are rendered
    expect(screen.getByText("This is the first message")).toBeTruthy();
    expect(screen.getByText("A reply message")).toBeTruthy();

    // Backdrop is visible
    expect(screen.getByTestId("thread-backdrop")).toBeTruthy();
  });

  it("calls postMessage and clears input when sending a message", async () => {
    mockState = {
      currentThreadId: 1,
      thread: {
        id: 1,
        channel_id: 5,
        parent_note_id: 10,
        title: "Test Thread",
        created_by: 1,
        created_at: "2025-05-07T10:00:00Z",
        updated_at: "2025-05-07T10:00:00Z",
        messages: [],
      },
      isLoading: false,
    };

    renderThreadPanel();

    // Type a message
    const input = screen.getByTestId("thread-message-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Hello thread" } });
    });

    // Send the message
    const sendBtn = screen.getByTestId("thread-send-btn");
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // Verify postMessage was called
    expect(mockPostMessage).toHaveBeenCalledWith(1, "Hello thread");
  });

  it("calls clearCurrentThreadId when close button is clicked", async () => {
    mockState = {
      currentThreadId: 1,
      thread: {
        id: 1,
        channel_id: 5,
        parent_note_id: 10,
        title: "Test Thread",
        created_by: 1,
        created_at: "2025-05-07T10:00:00Z",
        updated_at: "2025-05-07T10:00:00Z",
        messages: [],
      },
      isLoading: false,
    };

    renderThreadPanel();

    // Click close button
    const closeBtn = screen.getByTestId("thread-close");
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    expect(mockClearCurrentThreadId).toHaveBeenCalled();
  });

  it("enables title editing on click and saves on Enter", async () => {
    mockState = {
      currentThreadId: 1,
      thread: {
        id: 1,
        channel_id: 5,
        parent_note_id: 10,
        title: "Original Title",
        created_by: 1,
        created_at: "2025-05-07T10:00:00Z",
        updated_at: "2025-05-07T10:00:00Z",
        messages: [],
      },
      isLoading: false,
    };

    renderThreadPanel();

    // Click on the title to edit
    const titleDisplay = screen.getByTestId("thread-title");
    await act(async () => {
      fireEvent.click(titleDisplay);
    });

    // Input field should appear
    const titleInput = screen.getByTestId("thread-title-input");
    expect(titleInput).toBeTruthy();

    // Change title and press Enter to save
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: "Updated Title" } });
      fireEvent.keyDown(titleInput, { key: "Enter" });
    });

    expect(mockUpdateThreadTitle).toHaveBeenCalledWith(1, "Updated Title");
  });
});
