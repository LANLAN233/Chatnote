import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadStore } from "./stores";
import * as servicesModule from "./services";

vi.mock("./services", async () => {
  const actual = await vi.importActual<typeof servicesModule>("./services");
  return {
    ...actual,
    threadApi: {
      get: vi.fn(),
      update: vi.fn(),
      postMessage: vi.fn(),
      createThread: vi.fn(),
    },
  };
});

const mockThreadApi = vi.mocked(servicesModule.threadApi);

describe("useThreadStore — thread count & create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useThreadStore.setState({
      currentThreadId: null,
      thread: null,
      isLoading: false,
      threadCounts: {},
    });
  });

  describe("fetchThreadCount", () => {
    it("fetches thread and caches reply count (messages - 1 = replies only)", async () => {
      mockThreadApi.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: 1,
            channel_id: 1,
            parent_note_id: 10,
            title: "Test Thread",
            created_by: 1,
            created_at: "2026-01-01T00:00:00",
            updated_at: "2026-01-01T00:00:00",
            messages: [
              { id: 10, content: "parent", content_type: "markdown", channel_id: 1, user_id: 1, created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00", is_edited: false, is_pinned: false, reply_to_id: null, user_tags: null, ai_category: null, ai_summary: null, ai_confidence: null, ai_tags: null, raw_input: null },
              { id: 11, content: "reply1", content_type: "markdown", channel_id: 1, user_id: 1, created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00", is_edited: false, is_pinned: false, reply_to_id: null, user_tags: null, ai_category: null, ai_summary: null, ai_confidence: null, ai_tags: null, raw_input: null },
              { id: 12, content: "reply2", content_type: "markdown", channel_id: 1, user_id: 1, created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00", is_edited: false, is_pinned: false, reply_to_id: null, user_tags: null, ai_category: null, ai_summary: null, ai_confidence: null, ai_tags: null, raw_input: null },
            ],
          },
          message: "ok",
        },
      } as never);

      await useThreadStore.getState().fetchThreadCount(1);

      const state = useThreadStore.getState();
      // 3 messages total, -1 for parent = 2 replies
      expect(state.threadCounts[1]).toBe(2);
      expect(mockThreadApi.get).toHaveBeenCalledWith(1);
    });

    it("sets count to 0 when thread has only parent message", async () => {
      mockThreadApi.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: 2,
            channel_id: 1,
            parent_note_id: 20,
            title: "New Thread",
            created_by: 1,
            created_at: "2026-01-01T00:00:00",
            updated_at: "2026-01-01T00:00:00",
            messages: [
              { id: 20, content: "only parent", content_type: "markdown", channel_id: 1, user_id: 1, created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00", is_edited: false, is_pinned: false, reply_to_id: null, user_tags: null, ai_category: null, ai_summary: null, ai_confidence: null, ai_tags: null, raw_input: null },
            ],
          },
          message: "ok",
        },
      } as never);

      await useThreadStore.getState().fetchThreadCount(2);

      expect(useThreadStore.getState().threadCounts[2]).toBe(0);
    });

    it("does not re-fetch if count already cached", async () => {
      useThreadStore.setState({ threadCounts: { 3: 5 } });

      await useThreadStore.getState().fetchThreadCount(3);

      expect(mockThreadApi.get).not.toHaveBeenCalled();
    });

    it("handles API errors gracefully", async () => {
      mockThreadApi.get.mockRejectedValueOnce(new Error("Network error"));

      await useThreadStore.getState().fetchThreadCount(999);

      // Should not crash, count remains unset
      expect(useThreadStore.getState().threadCounts[999]).toBeUndefined();
    });
  });

  describe("createThread", () => {
    it("calls threadApi.createThread and sets currentThreadId", async () => {
      mockThreadApi.createThread.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: 42,
            channel_id: 1,
            parent_note_id: 30,
            title: "讨论串",
            created_by: 1,
            created_at: "2026-01-01T00:00:00",
            updated_at: "2026-01-01T00:00:00",
            messages: [],
          },
          message: "ok",
        },
      } as never);

      const result = await useThreadStore.getState().createThread(30);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(42);
      expect(useThreadStore.getState().currentThreadId).toBe(42);
      expect(mockThreadApi.createThread).toHaveBeenCalledWith(30, undefined);
    });

    it("caches initial count as 0 for new thread", async () => {
      mockThreadApi.createThread.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: 99,
            channel_id: 1,
            parent_note_id: 50,
            title: "New",
            created_by: 1,
            created_at: "2026-01-01T00:00:00",
            updated_at: "2026-01-01T00:00:00",
            messages: [],
          },
          message: "ok",
        },
      } as never);

      await useThreadStore.getState().createThread(50);

      expect(useThreadStore.getState().threadCounts[99]).toBe(0);
    });

    it("returns null on API failure", async () => {
      mockThreadApi.createThread.mockRejectedValueOnce(new Error("API error"));

      const result = await useThreadStore.getState().createThread(60);

      expect(result).toBeNull();
    });
  });

  describe("setCurrentThreadId", () => {
    it("sets currentThreadId in store", () => {
      useThreadStore.getState().setCurrentThreadId(77);
      expect(useThreadStore.getState().currentThreadId).toBe(77);
    });

    it("clears with null", () => {
      useThreadStore.getState().setCurrentThreadId(77);
      useThreadStore.getState().setCurrentThreadId(null);
      expect(useThreadStore.getState().currentThreadId).toBeNull();
    });
  });
});
