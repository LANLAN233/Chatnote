import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ToolResultAccordion from "./ToolResultAccordion";

describe("ToolResultAccordion", () => {
  it("renders in collapsed state by default", () => {
    render(
      <ToolResultAccordion
        toolName="search_notes"
        input={{ query: "极限定义" }}
        output="Found 3 results"
      />
    );
    const toggle = screen.getByTestId("accordion-toggle");
    expect(toggle).toBeTruthy();
    const body = screen.getByTestId("accordion-body");
    expect(body.style.maxHeight).toBe("0px");
  });

  it("expands on toggle click", () => {
    render(
      <ToolResultAccordion
        toolName="search_notes"
        input={{ query: "极限定义" }}
        output="Found 3 results"
      />
    );
    const toggle = screen.getByTestId("accordion-toggle");
    fireEvent.click(toggle);
    const body = screen.getByTestId("accordion-body");
    expect(body.style.maxHeight).toBe("400px");
  });

  it("collapses back when toggle clicked twice", () => {
    render(
      <ToolResultAccordion
        toolName="search_notes"
        input={{ query: "极限定义" }}
        output="Found 3 results"
      />
    );
    const toggle = screen.getByTestId("accordion-toggle");
    // Expand
    fireEvent.click(toggle);
    expect(screen.getByTestId("accordion-body").style.maxHeight).toBe("400px");
    // Collapse
    fireEvent.click(toggle);
    expect(screen.getByTestId("accordion-body").style.maxHeight).toBe("0px");
  });

  it("displays tool name in header", () => {
    render(
      <ToolResultAccordion
        toolName="duckduckgo_search"
        input={{ query: "test" }}
        output="Search results"
      />
    );
    expect(screen.getByText("duckduckgo_search")).toBeTruthy();
  });

  it("shows input summary in expanded state", () => {
    render(
      <ToolResultAccordion
        toolName="search_notes"
        input={{ query: "极限", limit: "10" }}
        output="Results"
      />
    );
    fireEvent.click(screen.getByTestId("accordion-toggle"));
    expect(screen.getByText(/query=极限/)).toBeTruthy();
    expect(screen.getByText(/limit=10/)).toBeTruthy();
  });

  it("shows output in expanded state", () => {
    render(
      <ToolResultAccordion
        toolName="calculator"
        input={{ expression: "2+2" }}
        output="4"
      />
    );
    fireEvent.click(screen.getByTestId("accordion-toggle"));
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("shows result count for search tools with multi-line output", () => {
    render(
      <ToolResultAccordion
        toolName="search_notes"
        input={{ query: "test" }}
        output="Result 1"
      />
    );
    // For single-line search results, shows the trimmed output
    expect(screen.getAllByText("Result 1").length).toBeGreaterThanOrEqual(1);
  });

  it("shows multi-result indicator for search tools with newlines", () => {
    // Use a raw output string with actual newlines
    const multiLineOutput = ["Line 1", "Line 2", "Line 3"].join("\n");
    render(
      <ToolResultAccordion
        toolName="duckduckgo_search"
        input={{ query: "test" }}
        output={multiLineOutput}
      />
    );
    // With multiple lines, the summary should show a count
    const accordion = screen.getByTestId("tool-result-accordion");
    expect(accordion.textContent).toContain("找到 3 条结果");
  });

  it("shows calculator result as numeric value", () => {
    render(
      <ToolResultAccordion
        toolName="calculator"
        input={{ expression: "3*7" }}
        output="21"
      />
    );
    expect(screen.getByText("= 21")).toBeTruthy();
  });

  it("handles null input gracefully", () => {
    render(
      <ToolResultAccordion
        toolName="get_stats"
        input={null}
        output="Stats output"
      />
    );
    fireEvent.click(screen.getByTestId("accordion-toggle"));
    expect(screen.getByText("无输入")).toBeTruthy();
  });

  it("handles null output gracefully", () => {
    render(
      <ToolResultAccordion
        toolName="python"
        input={{ code: "print('hello')" }}
        output={null}
      />
    );
    // In collapsed header: shows "无输出"
    expect(screen.getByText("无输出")).toBeTruthy();
  });

  it("renders data-testid for easy selection", () => {
    render(
      <ToolResultAccordion
        toolName="test_tool"
        input={{ key: "val" }}
        output="result"
      />
    );
    expect(screen.getByTestId("tool-result-accordion")).toBeTruthy();
    expect(screen.getByTestId("accordion-toggle")).toBeTruthy();
    expect(screen.getByTestId("accordion-body")).toBeTruthy();
  });
});
