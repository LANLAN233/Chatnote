import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CodeExecutionBlock from "./CodeExecutionBlock";

describe("CodeExecutionBlock", () => {
  it("shows output area by default with code hidden", () => {
    render(
      <CodeExecutionBlock
        code="print('hello')"
        output="hello"
        language="python"
      />
    );

    // Output should be visible
    const outputBlock = screen.getByTestId("output-block");
    expect(outputBlock).toBeInTheDocument();
    expect(outputBlock).toHaveTextContent("hello");

    // Code should NOT be visible by default
    const codeBlock = screen.queryByTestId("code-block");
    expect(codeBlock).toBeNull();

    // Toggle button should say "查看代码"
    const toggleBtn = screen.getByTestId("code-toggle-btn");
    expect(toggleBtn).toHaveTextContent("查看代码");
  });

  it("toggles code visibility when button is clicked", () => {
    render(
      <CodeExecutionBlock
        code="const x = 1;"
        output="1"
        language="javascript"
      />
    );

    // Initially hidden
    expect(screen.queryByTestId("code-block")).toBeNull();

    // Click to show
    const toggleBtn = screen.getByTestId("code-toggle-btn");
    fireEvent.click(toggleBtn);

    // Now visible
    const codeBlock = screen.getByTestId("code-block");
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock).toHaveTextContent("const x = 1;");
    expect(toggleBtn).toHaveTextContent("隐藏代码");

    // Click again to hide
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId("code-block")).toBeNull();
    expect(toggleBtn).toHaveTextContent("查看代码");
  });

  it("displays (no output) placeholder when output is empty", () => {
    render(
      <CodeExecutionBlock
        code="x = 1 + 1"
        output=""
      />
    );

    const outputBlock = screen.getByTestId("output-block");
    expect(outputBlock).toHaveTextContent("(no output)");
  });

  it("shows language label on toggle button", () => {
    render(
      <CodeExecutionBlock
        code="print('hi')"
        output="hi"
        language="python"
      />
    );

    const toggleBtn = screen.getByTestId("code-toggle-btn");
    expect(toggleBtn).toHaveTextContent("(python)");
  });

  it("applies code styling with bg-[#0d1117] on code and output areas", () => {
    render(
      <CodeExecutionBlock
        code="print('test')"
        output="test"
      />
    );

    // Click to show code
    fireEvent.click(screen.getByTestId("code-toggle-btn"));

    const codeBlock = screen.getByTestId("code-block");
    expect(codeBlock.className).toContain("bg-[#0d1117]");
    expect(codeBlock.className).toContain("text-[#c9d1d9]");

    const outputBlock = screen.getByTestId("output-block");
    expect(outputBlock.className).toContain("bg-[#0d1117]");
    expect(outputBlock.className).toContain("text-[#c9d1d9]");
    expect(outputBlock.className).toContain("max-h-48");
  });
});
