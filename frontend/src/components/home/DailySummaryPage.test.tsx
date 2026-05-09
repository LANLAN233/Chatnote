import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

const mockNavigate = vi.fn();

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@uiw/react-md-editor", () => ({
  default: function MockMDEditor({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (val?: string) => void;
  }) {
    return (
      <textarea
        data-testid="md-editor"
        value={value || ""}
        onChange={(e) => onChange && onChange(e.target.value)}
      />
    );
  },
}));

// Mock services
const {
  mockGetDailySummary,
  mockRegenerate,
  mockUpdate,
  mockExportMarkdown,
  mockExportPdf,
  mockGetHistory,
} = vi.hoisted(() => ({
  mockGetDailySummary: vi.fn(),
  mockRegenerate: vi.fn(),
  mockUpdate: vi.fn(),
  mockExportMarkdown: vi.fn(),
  mockExportPdf: vi.fn(),
  mockGetHistory: vi.fn(),
}));

vi.mock("../../services", () => ({
  statsApi: {
    getDailySummary: mockGetDailySummary,
  },
  dailySummaryApi: {
    regenerate: mockRegenerate,
    update: mockUpdate,
    exportMarkdown: mockExportMarkdown,
    exportPdf: mockExportPdf,
    getHistory: mockGetHistory,
  },
  downloadBlob: vi.fn(),
}));

import DailySummaryPage from "./DailySummaryPage";

function makeSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: "Test daily summary content",
    keywords: [{ keyword: "math", note_ids: [1, 2] }],
    total_notes: 5,
    highlight_note_id: 1,
    stages: [
      { name: "extraction", status: "completed", duration_ms: 120 },
      { name: "summary", status: "completed", duration_ms: 200 },
    ],
    is_edited: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

describe("DailySummaryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHistory.mockResolvedValue({
      data: { success: true, data: [] },
    });
  });

  it("renders header and date picker with today's date", () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: null },
    });
    render(<DailySummaryPage />);
    expect(screen.getByText("每日总结")).toBeDefined();
    const dateInput = screen.getByDisplayValue(getTodayISO());
    expect(dateInput).toBeDefined();
  });

  it("shows loading spinner while fetching", async () => {
    mockGetDailySummary.mockImplementation(
      () => new Promise(() => {})
    );
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("加载中...")).toBeDefined();
    });
  });

  it("displays summary when loaded", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: makeSummary() },
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("Test daily summary content")).toBeDefined();
    });
    expect(screen.getByText("基于 5 条笔记")).toBeDefined();
  });

  it("shows '已编辑' badge when is_edited is true", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: makeSummary({ is_edited: true }) },
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("已编辑")).toBeDefined();
    });
  });

  it("shows keywords as tags", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: makeSummary() },
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("math")).toBeDefined();
    });
  });

  it("shows '该日期无笔记记录' when total_notes is 0", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: {
        success: true,
        data: makeSummary({ total_notes: 0, summary: "", keywords: [] }),
      },
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("该日期无笔记记录")).toBeDefined();
    });
  });

  it("shows '暂无总结，点击生成' when no summary exists", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: null },
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("暂无总结，点击生成")).toBeDefined();
    });
    const genButtons = screen.getAllByText("生成总结");
    expect(genButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls regenerate when '生成总结' is clicked", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: null },
    });
    mockRegenerate.mockResolvedValue({
      data: { success: true, data: makeSummary() },
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("生成总结")).toBeDefined();
    });
    fireEvent.click(screen.getAllByText("生成总结")[0]);
    await waitFor(() => {
      expect(mockRegenerate).toHaveBeenCalledTimes(1);
    });
  });

  it("enters edit mode when edit button is clicked", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: makeSummary() },
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("编辑")).toBeDefined();
    });
    fireEvent.click(screen.getByText("编辑"));
    await waitFor(() => {
      expect(screen.getByTestId("md-editor")).toBeDefined();
    });
  });

  it("calls update API when save is clicked in edit mode", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: makeSummary() },
    });
    mockUpdate.mockResolvedValue({
      data: { success: true, data: makeSummary({ is_edited: true }) },
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("编辑")).toBeDefined();
    });
    fireEvent.click(screen.getByText("编辑"));
    await waitFor(() => {
      expect(screen.getByText("保存")).toBeDefined();
    });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("closes editor when cancel is clicked", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: makeSummary() },
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("编辑")).toBeDefined();
    });
    fireEvent.click(screen.getByText("编辑"));
    await waitFor(() => {
      expect(screen.getByText("取消")).toBeDefined();
    });
    fireEvent.click(screen.getByText("取消"));
    await waitFor(() => {
      expect(screen.getByText("编辑")).toBeDefined();
    });
  });

  it("calls exportMarkdown when export button is clicked", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: makeSummary() },
    });
    mockExportMarkdown.mockResolvedValue({
      data: new Blob(["# md"]),
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("导出 Markdown")).toBeDefined();
    });
    fireEvent.click(screen.getByText("导出 Markdown"));
    await waitFor(() => {
      expect(mockExportMarkdown).toHaveBeenCalledTimes(1);
    });
  });

  it("calls exportPdf when export button is clicked", async () => {
    mockGetDailySummary.mockResolvedValue({
      data: { success: true, data: makeSummary() },
    });
    mockExportPdf.mockResolvedValue({
      data: new Blob(["pdf"]),
    });
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("导出 PDF")).toBeDefined();
    });
    fireEvent.click(screen.getByText("导出 PDF"));
    await waitFor(() => {
      expect(mockExportPdf).toHaveBeenCalledTimes(1);
    });
  });

  it("shows slow loading message after 30s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetDailySummary.mockImplementation(
      () => new Promise(() => {})
    );
    render(<DailySummaryPage />);
    await waitFor(() => {
      expect(screen.getByText("加载中...")).toBeDefined();
    });
    expect(screen.queryByText("加载时间较长，请耐心等待...")).toBeNull();
    vi.advanceTimersByTime(31000);
    await waitFor(() => {
      expect(
        screen.getByText("加载时间较长，请耐心等待...")
      ).toBeDefined();
    });
    vi.useRealTimers();
  });
});
