import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

// Stable references — hoisted so mock factory can access them
const { stableServers, stableFetchServers, mockUseServerStore } = vi.hoisted(() => {
  const servers: unknown[] = [];
  const fetchServers = vi.fn();
  const mockStore = vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { servers, fetchServers };
    return selector ? selector(state) : state;
  });
  mockStore.getState = vi.fn(() => ({ servers, fetchServers }));
  return { stableServers: servers, stableFetchServers: fetchServers, mockUseServerStore: mockStore };
});

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
  useServerStore: mockUseServerStore,
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

describe("HomeInboxPanel archive dialog pre-fill", () => {
  beforeEach(() => {
    stableServers.length = 0;
  });

  it("pre-fills server and channel when both exist", async () => {
    stableServers.push({ id: 1, name: "线性代数", user_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" });

    const { channelApi } = await import("../../services");
    (channelApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [{ id: 10, name: "特征值", server_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" }] },
    });

    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [makeInboxItem({ ai_suggested_server: "线性代数", ai_suggested_channel: "特征值" })] },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      expect(screen.getByText("Test note about calculus")).toBeDefined();
    });

    fireEvent.click(screen.getByText("归档"));

    await waitFor(() => {
      expect(screen.getByText("归档笔记")).toBeDefined();
    });

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      expect((selects[0] as HTMLSelectElement).value).toBe("1");
    });

    const selects = screen.getAllByRole("combobox");
    expect((selects[1] as HTMLSelectElement).value).toBe("10");
  });

  it("pre-fills server only when channel not found", async () => {
    stableServers.push({ id: 1, name: "线性代数", user_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" });

    const { channelApi } = await import("../../services");
    (channelApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [{ id: 10, name: "其他频道", server_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" }] },
    });

    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [makeInboxItem({ ai_suggested_server: "线性代数", ai_suggested_channel: "不存在频道" })] },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      expect(screen.getByText("Test note about calculus")).toBeDefined();
    });

    fireEvent.click(screen.getByText("归档"));

    await waitFor(() => {
      expect(screen.getByText("归档笔记")).toBeDefined();
    });

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      expect((selects[0] as HTMLSelectElement).value).toBe("1");
    });

    const selects = screen.getAllByRole("combobox");
    expect((selects[1] as HTMLSelectElement).value).toBe("");
  });

  it("switches to new mode when server not found", async () => {
    stableServers.push({ id: 1, name: "其他伺服器", user_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" });

    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [makeInboxItem({ ai_suggested_server: "新学科", ai_suggested_channel: "新频道" })] },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      expect(screen.getByText("Test note about calculus")).toBeDefined();
    });

    fireEvent.click(screen.getByText("归档"));

    await waitFor(() => {
      expect(screen.getByText("归档笔记")).toBeDefined();
    });

    // Wait for pre-fill to switch to "new" mode
    await waitFor(() => {
      const newTab = screen.getByText("新建伺服器");
      expect(newTab.className).toContain("bg-[#5865f2]");
    });

    const serverInput = screen.getByPlaceholderText("例如：高等数学") as HTMLInputElement;
    expect(serverInput.value).toBe("新学科");

    const channelInput = screen.getByPlaceholderText("例如：第三章 极限（留空则自动创建 General）") as HTMLInputElement;
    expect(channelInput.value).toBe("新频道");
  });

  it("does not pre-fill when no AI suggestion", async () => {
    stableServers.push({ id: 1, name: "线性代数", user_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" });

    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [makeInboxItem({ ai_suggested_server: null, ai_suggested_channel: null })] },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      expect(screen.getByText("Test note about calculus")).toBeDefined();
    });

    fireEvent.click(screen.getByText("归档"));

    await waitFor(() => {
      expect(screen.getByText("归档笔记")).toBeDefined();
    });

    // Dialog opens in "existing" mode (default) with empty selects
    const existingTab = screen.getByText("归档到现有");
    expect(existingTab.className).toContain("bg-[#5865f2]");

    const selects = screen.getAllByRole("combobox");
    expect((selects[0] as HTMLSelectElement).value).toBe("");
  });

  it("case-insensitive matching", async () => {
    stableServers.push({ id: 1, name: "Math", user_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" });

    const { channelApi } = await import("../../services");
    (channelApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [{ id: 10, name: "Calculus", server_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" }] },
    });

    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [makeInboxItem({ ai_suggested_server: "MATH", ai_suggested_channel: "calculus" })] },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      expect(screen.getByText("Test note about calculus")).toBeDefined();
    });

    fireEvent.click(screen.getByText("归档"));

    await waitFor(() => {
      expect(screen.getByText("归档笔记")).toBeDefined();
    });

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      expect((selects[0] as HTMLSelectElement).value).toBe("1");
    });

    const selects = screen.getAllByRole("combobox");
    expect((selects[1] as HTMLSelectElement).value).toBe("10");
  });

  it("batch archive pre-fills using first selected item", async () => {
    stableServers.push({ id: 1, name: "线性代数", user_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" });

    const { channelApi } = await import("../../services");
    (channelApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [{ id: 10, name: "特征值", server_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" }] },
    });

    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [
        makeInboxItem({ id: 1, ai_suggested_server: "线性代数", ai_suggested_channel: "特征值" }),
        makeInboxItem({ id: 2, ai_suggested_server: null, ai_suggested_channel: null }),
      ]},
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      const items = screen.getAllByText("Test note about calculus");
      expect(items.length).toBe(2);
    });

    fireEvent.click(screen.getByText("全选"));

    await waitFor(() => {
      expect(screen.getByText("批量归档")).toBeDefined();
    });

    fireEvent.click(screen.getByText("批量归档"));

    await waitFor(() => {
      expect(screen.getByText("归档笔记")).toBeDefined();
    });

    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      expect((selects[0] as HTMLSelectElement).value).toBe("1");
    });

    const selects = screen.getAllByRole("combobox");
    expect((selects[1] as HTMLSelectElement).value).toBe("10");
  });

  it("pre-filled values can be changed by user", async () => {
    stableServers.push({ id: 1, name: "线性代数", user_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" });

    const { channelApi } = await import("../../services");
    (channelApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [{ id: 10, name: "特征值", server_id: 1, created_at: "2024-01-01", updated_at: "2024-01-01" }] },
    });

    const { inboxApi } = await import("../../services");
    (inboxApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, data: [makeInboxItem({ ai_suggested_server: "线性代数", ai_suggested_channel: "特征值" })] },
    });

    render(<HomeInboxPanel />);

    await waitFor(() => {
      expect(screen.getByText("Test note about calculus")).toBeDefined();
    });

    fireEvent.click(screen.getByText("归档"));

    await waitFor(() => {
      expect(screen.getByText("归档笔记")).toBeDefined();
    });

    // Wait for pre-fill
    await waitFor(() => {
      const selects = screen.getAllByRole("combobox");
      expect((selects[0] as HTMLSelectElement).value).toBe("1");
    });

    // Verify pre-filled values, then change server select
    const selects = screen.getAllByRole("combobox");
    const serverSelect = selects[0] as HTMLSelectElement;
    expect(serverSelect.value).toBe("1");

    fireEvent.change(serverSelect, { target: { value: "" } });
    expect(serverSelect.value).toBe("");

    // Click cancel to close dialog
    fireEvent.click(screen.getByText("取消"));

    await waitFor(() => {
      expect(screen.queryByText("归档笔记")).toBeNull();
    });
  });
});
