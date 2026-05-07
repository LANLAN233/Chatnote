import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuerySourcesModal from "./QuerySourcesModal";
import type { QuerySource } from "../../types";

const mockSources: QuerySource[] = [
  {
    note_id: 1,
    excerpt: "极限的定义是函数在某一点附近的变化趋势...",
    channel: "极限",
    server: "高等数学",
  },
  {
    note_id: 2,
    excerpt: "牛顿-莱布尼茨公式连接了微分和积分...",
    channel: "积分",
    server: "高等数学",
  },
];

describe("QuerySourcesModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders through a portal with source list", () => {
    render(
      <QuerySourcesModal
        sources={mockSources}
        serverName="高等数学"
        channelName="极限"
        onClose={() => {}}
      />
    );

    expect(document.body.textContent).toContain("📚 参考来源");
    expect(document.body.textContent).toContain("@高等数学");
    expect(document.body.textContent).toContain("#极限");
    expect(document.body.textContent).toContain("极限的定义是函数在某一点附近的变化趋势...");
    expect(document.body.textContent).toContain("牛顿-莱布尼茨公式连接了微分和积分...");
    expect(document.body.textContent).toContain("共 2 条参考笔记");
  });

  it("closes on X button click", () => {
    const onClose = vi.fn();
    render(
      <QuerySourcesModal
        sources={mockSources}
        onClose={onClose}
      />
    );

    const closeButton = screen.getByLabelText("Close");
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(
      <QuerySourcesModal
        sources={mockSources}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on outside click", () => {
    const onClose = vi.fn();
    render(
      <QuerySourcesModal
        sources={mockSources}
        onClose={onClose}
      />
    );

    // Click on the backdrop (outside the modal)
    fireEvent.mouseDown(document.body.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onNavigate when 跳转 button is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <QuerySourcesModal
        sources={mockSources}
        onClose={() => {}}
        onNavigate={onNavigate}
      />
    );

    const jumpButtons = screen.getAllByText("跳转");
    expect(jumpButtons).toHaveLength(2);

    fireEvent.click(jumpButtons[0]);
    expect(onNavigate).toHaveBeenCalledWith("高等数学", "极限");

    fireEvent.click(jumpButtons[1]);
    expect(onNavigate).toHaveBeenCalledWith("高等数学", "积分");
  });

  it("shows empty state when no sources", () => {
    render(
      <QuerySourcesModal
        sources={[]}
        onClose={() => {}}
      />
    );

    expect(document.body.textContent).toContain("暂无参考来源");
    expect(document.body.textContent).toContain("共 0 条参考笔记");
  });

  it("renders close button in footer", () => {
    const onClose = vi.fn();
    render(
      <QuerySourcesModal
        sources={mockSources}
        onClose={onClose}
      />
    );

    const closeButtons = screen.getAllByText("关闭");
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
