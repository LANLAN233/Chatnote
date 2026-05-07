import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ToolCallIndicator from "./ToolCallIndicator";

describe("ToolCallIndicator", () => {
  it("renders correct label for known tool search_notes", () => {
    render(<ToolCallIndicator toolName="search_notes" isActive={true} />);
    expect(screen.getByText("查询笔记...")).toBeTruthy();
    expect(screen.getByText("search_notes")).toBeTruthy();
  });

  it("renders correct label for known tool calculator", () => {
    render(<ToolCallIndicator toolName="calculator" isActive={true} />);
    expect(screen.getByText("正在计算...")).toBeTruthy();
    expect(screen.getByText("calculator")).toBeTruthy();
  });

  it("renders correct label for known tool duckduckgo_search", () => {
    render(<ToolCallIndicator toolName="duckduckgo_search" isActive={true} />);
    expect(screen.getByText("正在搜索...")).toBeTruthy();
  });

  it("renders correct label for trafilatura (web fetch)", () => {
    render(<ToolCallIndicator toolName="trafilatura" isActive={true} />);
    expect(screen.getByText("正在抓取网页...")).toBeTruthy();
  });

  it("renders with active pulse animation when isActive=true", () => {
    render(<ToolCallIndicator toolName="duckduckgo_search" isActive={true} />);
    const el = screen.getByTestId("tool-call-indicator");
    expect(el.style.animation).toContain("tool-pulse");
  });

  it("renders without pulse animation when isActive=false", () => {
    render(<ToolCallIndicator toolName="duckduckgo_search" isActive={false} />);
    const el = screen.getByTestId("tool-call-indicator");
    expect(el.style.animation).toBeFalsy();
  });

  it("falls back to generic label for unknown tool", () => {
    render(<ToolCallIndicator toolName="unknown_tool_xyz" isActive={true} />);
    expect(screen.getByText("正在处理...")).toBeTruthy();
    expect(screen.getByText("unknown_tool_xyz")).toBeTruthy();
  });

  it("matches tool name case-insensitively", () => {
    render(<ToolCallIndicator toolName="CALCULATOR" isActive={true} />);
    expect(screen.getByText("正在计算...")).toBeTruthy();
  });

  it("renders data-testid for easy selection", () => {
    render(<ToolCallIndicator toolName="test_tool" isActive={false} />);
    expect(screen.getByTestId("tool-call-indicator")).toBeTruthy();
  });
});
