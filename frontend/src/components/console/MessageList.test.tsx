import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageList from "./MessageList";

const baseProps = {
  messages: [],
  initMessages: [],
  hoveredMessageId: null,
  onHoverMessage: () => {},
  onCopy: () => {},
  onImport: () => {},
  onQuerySources: () => {},
  isLoading: false,
  loadingSession: false,
  messagesContainerRef: { current: null as HTMLDivElement | null },
  logEndRef: { current: null as HTMLDivElement | null },
};

describe("MessageList markdown rendering", () => {
  it("renders assistant text messages with ReactMarkdown", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "# Hello\n\nThis is **bold** text.",
            type: "text",
            created_at: new Date().toISOString(),
          },
        ]}
      />
    );

    // ReactMarkdown should render h1 for # Hello
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello");
    // ReactMarkdown should render strong for **bold**
    const bold = screen.getByText("bold");
    expect(bold.tagName).toBe("STRONG");
  });

  it("renders user messages as plain text without markdown parsing", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "user",
            content: "# Hello\n\nThis is **bold** text.",
            type: "text",
            created_at: new Date().toISOString(),
          },
        ]}
      />
    );

    // Should NOT render a heading element
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    // Raw markdown characters should appear in the DOM
    expect(screen.getByText(/# Hello/)).toBeInTheDocument();
    expect(screen.getByText(/\*\*bold\*\*/)).toBeInTheDocument();
  });

  it("does not render markdown for context_loaded assistant messages", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "# Context Loaded",
            type: "context_loaded",
            created_at: new Date().toISOString(),
          },
        ]}
      />
    );

    // Should NOT render a heading element
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    // Raw markdown should appear as plain text
    expect(screen.getByText(/# Context Loaded/)).toBeInTheDocument();
  });

  it("does not render markdown for code_execution messages", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "# Result",
            type: "code_execution",
            created_at: new Date().toISOString(),
            metadata: {
              code: "print('hello')",
              output: "hello",
              language: "python",
            },
          },
        ]}
      />
    );

    // CodeExecutionBlock should render the code block, not ReactMarkdown
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByTestId("code-execution-block")).toBeInTheDocument();
    expect(screen.getByTestId("output-block")).toHaveTextContent("hello");
  });

  it("does not render markdown for web_result messages", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "# Web Summary",
            type: "web_result",
            created_at: new Date().toISOString(),
            metadata: {
              url: "https://example.com",
              title: "Example",
            },
          },
        ]}
      />
    );

    // UrlPreviewCard should render, not ReactMarkdown
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText(/Example/)).toBeInTheDocument();
  });

  it("renders lists properly in assistant markdown", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "- Item 1\n- Item 2\n- Item 3",
            type: "text",
            created_at: new Date().toISOString(),
          },
        ]}
      />
    );

    const list = screen.getByRole("list");
    expect(list).toBeInTheDocument();
    expect(list.querySelectorAll("li").length).toBe(3);
  });

  it("renders inline code in assistant markdown", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "Use `console.log()` for debugging.",
            type: "text",
            created_at: new Date().toISOString(),
          },
        ]}
      />
    );

    const code = screen.getByText("console.log()");
    expect(code.tagName).toBe("CODE");
  });

  it("renders links in assistant markdown", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "Visit [OpenAI](https://openai.com) for more info.",
            type: "text",
            created_at: new Date().toISOString(),
          },
        ]}
      />
    );

    const link = screen.getByRole("link", { name: "OpenAI" });
    expect(link).toHaveAttribute("href", "https://openai.com");
  });
});
