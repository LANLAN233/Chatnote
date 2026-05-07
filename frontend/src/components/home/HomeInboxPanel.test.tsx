import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// Stable references — hoisted so mock factory can access them
const { stableServers, stableFetchServers } = vi.hoisted(() => ({
  stableServers: [] as unknown[],
  stableFetchServers: vi.fn(),
}));

// Mock services
vi.mock("../../services", () => ({
  inboxApi: {
    list: vi.fn().mockResolvedValue({
      data: { success: true, data: [] },
    }),
  },
  serverApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
  },
  channelApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
  },
}));

// Mock stores with stable references to prevent re-render loops
vi.mock("../../stores", () => ({
  useServerStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { servers: stableServers, fetchServers: stableFetchServers };
    return selector ? selector(state) : state;
  }),
  useChannelStore: vi.fn(),
}));

import HomeInboxPanel from "./HomeInboxPanel";

function makeInboxItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: 1,
    content: "Test note about calculus",
    raw_input: null,
    ai_suggested_server: "Math",
    ai_suggested_channel: "Calculus",
    ai_tags: '["calculus","math"]',
    ai_summary: "A note about limits",
    ai_confidence: 0.9,
    ai_reviewed: false,
    ensemble_consistency: null,
    fast_confidence: null,
    strong_confidence: null,
    status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("HomeInboxPanel review status", () => {
  it("renders inbox heading", async () => {
    render(<HomeInboxPanel />);
    await waitFor(() => {
      expect(screen.getByText("待分类笔记")).toBeDefined();
    });
  });

  it("shows AI复核 badge when ai_reviewed is true", async () => {
    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [
          makeInboxItem({
            ai_reviewed: true,
            ensemble_consistency: "一致",
            ai_confidence: 0.92,
          }),
        ],
      },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      expect(screen.getByText("AI复核")).toBeDefined();
    });
  });

  it("does not show AI复核 badge when ai_reviewed is false", async () => {
    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [
          makeInboxItem({
            ai_reviewed: false,
            ai_confidence: 0.9,
          }),
        ],
      },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      expect(screen.getByText("Test note about calculus")).toBeDefined();
    });

    expect(screen.queryByText("AI复核")).toBeNull();
  });

  it("shows green confidence bar on consistent ensemble", async () => {
    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [
          makeInboxItem({
            ai_reviewed: true,
            ensemble_consistency: "一致",
            ai_confidence: 0.95,
          }),
        ],
      },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      const span = screen.getByText("95%");
      expect(span.className).toContain("bg-green-500/20");
      expect(span.className).toContain("text-green-400");
    });
  });

  it("shows orange confidence bar on inconsistent ensemble", async () => {
    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [
          makeInboxItem({
            ai_reviewed: true,
            ensemble_consistency: "不一致",
            ai_confidence: 0.7,
          }),
        ],
      },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      const span = screen.getByText("70%");
      expect(span.className).toContain("bg-orange-500/20");
      expect(span.className).toContain("text-orange-500");
    });
  });

  it("shows amber confidence bar for low confidence without review", async () => {
    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [
          makeInboxItem({
            ai_reviewed: false,
            ai_confidence: 0.6,
          }),
        ],
      },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      const span = screen.getByText("60%");
      expect(span.className).toContain("bg-amber-500/20");
    });
  });

  it("shows green confidence bar for high confidence without review", async () => {
    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [
          makeInboxItem({
            ai_reviewed: false,
            ai_confidence: 0.88,
          }),
        ],
      },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      const span = screen.getByText("88%");
      expect(span.className).toContain("bg-green-500/20");
    });
  });

  it("badge has tooltip for consistent ensemble", async () => {
    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [
          makeInboxItem({
            ai_reviewed: true,
            ensemble_consistency: "一致",
            ai_confidence: 0.92,
          }),
        ],
      },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      const badge = screen.getByText("AI复核");
      expect(badge.getAttribute("title")).toBe("双模型结果一致");
    });
  });

  it("badge has tooltip for inconsistent ensemble", async () => {
    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [
          makeInboxItem({
            ai_reviewed: true,
            ensemble_consistency: "不一致",
            ai_confidence: 0.7,
          }),
        ],
      },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      const badge = screen.getByText("AI复核");
      expect(badge.getAttribute("title")).toBe("建议人工确认");
    });
  });

  it("confidence bar has tooltip for mismatch", async () => {
    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: [
          makeInboxItem({
            ai_reviewed: true,
            ensemble_consistency: "不一致",
            ai_confidence: 0.7,
          }),
        ],
      },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      const span = screen.getByText("70%");
      expect(span.getAttribute("title")).toBe("建议人工确认 — 双模型结果不一致");
    });
  });
});
