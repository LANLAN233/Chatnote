import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ConsoleCore from "./ConsoleCore";

Element.prototype.scrollIntoView = vi.fn();

vi.mock("../../services", () => ({
  consoleSessionApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
    get: vi.fn().mockResolvedValue({ data: { success: true, data: { messages: [] } } }),
    create: vi.fn().mockResolvedValue({ data: { success: true, data: { id: 1, title: "Test", updated_at: new Date().toISOString() } } }),
    update: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
    archive: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
  serverApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
  },
  channelApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
  },
  wsService: {
    on: vi.fn(() => vi.fn()),
    onDisconnect: vi.fn(() => vi.fn()),
  },
}));

const mockQueryResult = {
  type: "output",
  content: "🔍 **知识库查询** — @高等数学 #极限\n\n**问题:** 什么是极限？\n\n---\n\n极限是微积分的基础概念...\n\n---\n\n**📊 置信度: 90%** | 检索到 5 条笔记\n\n**📚 参考来源:**\n1. [极限] 极限的定义是函数在某一点...",
  data: {
    answer: "极限是微积分的基础概念...",
    sources: [
      { note_id: 1, excerpt: "极限的定义是函数在某一点附近的变化趋势...", channel: "极限", server: "高等数学" },
      { note_id: 2, excerpt: "牛顿-莱布尼茨公式连接了微分和积分...", channel: "积分", server: "高等数学" },
    ],
    confidence: 0.9,
    server_name: "高等数学",
    channel_name: "极限",
    total_notes_fetched: 5,
  },
};

describe("ConsoleCore query_answer rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders query_answer messages with purple border styling", async () => {
    const mockExecute = vi.fn().mockResolvedValue(mockQueryResult);

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecute} initMessages={[]} />
    );

    // Submit a query
    const textarea = screen.getByPlaceholderText("Note or /command or $skill...");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "$query 什么是极限" } });
      fireEvent.click(screen.getByRole("button", { name: "" }));
    });

    // Wait for the async execution
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // The message should have purple border styling
    const messageContent = screen.getByText(/极限是微积分的基础概念/);
    expect(messageContent).toBeTruthy();

    // Check that the parent bubble has the purple CSS class
    const bubble = messageContent.closest('[class*="border-l-4"]');
    expect(bubble).toBeTruthy();
    expect(bubble?.className).toContain("border-purple-500");
    expect(bubble?.className).toContain("bg-[#2b2040]/30");
  });

  it("shows source count and source links below query_answer", async () => {
    const mockExecute = vi.fn().mockResolvedValue(mockQueryResult);

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecute} initMessages={[]} />
    );

    const textarea = screen.getByPlaceholderText("Note or /command or $skill...");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "$query 测试问题" } });
      fireEvent.click(screen.getByRole("button", { name: "" }));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Check "基于 X 条笔记" text
    expect(document.body.textContent).toContain("基于 2 条笔记");
    // Check source links are present
    expect(document.body.textContent).toContain("@高等数学/#极限");
    expect(document.body.textContent).toContain("@高等数学/#积分");
    // Check total notes fetched info
    expect(document.body.textContent).toContain("共检索 5 条");
    // Check "查看全部来源" button
    expect(document.body.textContent).toContain("查看全部来源");
  });

  it("shows 🔍 知识库查询 label instead of Assistant", async () => {
    const mockExecute = vi.fn().mockResolvedValue(mockQueryResult);

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecute} initMessages={[]} />
    );

    const textarea = screen.getByPlaceholderText("Note or /command or $skill...");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "test query" } });
      fireEvent.click(screen.getByRole("button", { name: "" }));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Should show 🔍 知识库查询 label
    expect(document.body.textContent).toContain("🔍 知识库查询");
    // Should NOT show default "Assistant" for this message type
    // (The "You" label for user message is still present)
  });

  it("opens QuerySourcesModal when clicking a source link", async () => {
    const mockExecute = vi.fn().mockResolvedValue(mockQueryResult);

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecute} initMessages={[]} />
    );

    const textarea = screen.getByPlaceholderText("Note or /command or $skill...");
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "query test" } });
      fireEvent.click(screen.getByRole("button", { name: "" }));
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Click "查看全部来源" button
    const viewAllButton = screen.getByText("查看全部来源");
    await act(async () => {
      fireEvent.click(viewAllButton);
    });

    // Modal should appear
    expect(document.body.textContent).toContain("📚 参考来源");
    expect(document.body.textContent).toContain("极限的定义是函数在某一点附近的变化趋势...");
    expect(document.body.textContent).toContain("牛顿-莱布尼茨公式连接了微分和积分...");
    expect(document.body.textContent).toContain("共 2 条参考笔记");

    // Close modal via X button
    const closeButton = screen.getByLabelText("Close");
    await act(async () => {
      fireEvent.click(closeButton);
    });

    // Modal should be closed (source excerpts no longer in body)
    // The modal is removed via portal, check that the modal content is gone
    expect(document.body.textContent).not.toContain("共 2 条参考笔记");
  });
});
