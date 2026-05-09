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

describe("MessageList AgentConversation embedding", () => {
  it("renders AgentConversation inside query_answer bubble when stages metadata present", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "Answer text",
            type: "query_answer",
            created_at: new Date().toISOString(),
            metadata: {
              stages: [
                {
                  stage: "retrieval",
                  status: "completed",
                  model: "gpt-4",
                  tier: "strong",
                  message: "Retrieved 3 notes",
                  duration_ms: 1200,
                },
              ],
              sources: [
                { server: "Server", channel: "Channel", excerpt: "Excerpt" },
              ],
            },
          },
        ]}
      />
    );

    expect(screen.getByTestId("agent-conversation")).toBeInTheDocument();
    // Sources should still render below AgentConversation
    expect(screen.getByText(/基于 1 条笔记/)).toBeInTheDocument();
  });

  it("does NOT render AgentConversation for non-query_answer types", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "Regular text",
            type: "text",
            created_at: new Date().toISOString(),
            metadata: {
              stages: [
                {
                  stage: "retrieval",
                  status: "completed",
                  model: "gpt-4",
                  tier: "strong",
                  message: "Retrieved 3 notes",
                  duration_ms: 1200,
                },
              ],
            },
          },
          {
            id: 2,
            session_id: 1,
            role: "assistant",
            content: "Error message",
            type: "error",
            created_at: new Date().toISOString(),
            metadata: {
              stages: [
                {
                  stage: "retrieval",
                  status: "failed",
                  model: "gpt-4",
                  tier: "strong",
                  message: "Failed",
                  duration_ms: 500,
                },
              ],
            },
          },
        ]}
      />
    );

    expect(screen.queryByTestId("agent-conversation")).not.toBeInTheDocument();
  });

  it("does NOT render AgentConversation when stages is empty", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "Answer text",
            type: "query_answer",
            created_at: new Date().toISOString(),
            metadata: {
              stages: [],
            },
          },
        ]}
      />
    );

    expect(screen.queryByTestId("agent-conversation")).not.toBeInTheDocument();
  });

  it("shows AgentConversation in query_answer bubble when stages in metadata (2 stages, toggle)", () => {
    render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "Multi-stage answer",
            type: "query_answer",
            created_at: new Date().toISOString(),
            metadata: {
              stages: [
                {
                  stage: "retrieval",
                  status: "completed",
                  model: "gpt-4",
                  tier: "strong",
                  message: "Retrieved 5 notes",
                  duration_ms: 1200,
                },
                {
                  stage: "answer_generation",
                  status: "completed",
                  model: "gpt-4",
                  tier: "strong",
                  message: "Generated answer",
                  duration_ms: 800,
                },
              ],
            },
          },
        ]}
      />
    );

    // AgentConversation should be rendered
    const agentConv = screen.getByTestId("agent-conversation");
    expect(agentConv).toBeInTheDocument();

    // Toggle button should exist
    const toggle = screen.getByTestId("agent-conversation-toggle");
    expect(toggle).toBeInTheDocument();
    expect(toggle.textContent).toContain("Agent Conversation");
    expect(toggle.textContent).toContain("2 stages");

    // Both stage cards should render (inside the body)
    expect(screen.getByTestId("stage-card-0")).toBeInTheDocument();
    expect(screen.getByTestId("stage-card-1")).toBeInTheDocument();
  });

  it("full pipeline: query_answer renders both AgentConversation and sources without conflict", () => {
    const { container } = render(
      <MessageList
        {...baseProps}
        messages={[
          {
            id: 1,
            session_id: 1,
            role: "assistant",
            content: "Full pipeline answer",
            type: "query_answer",
            created_at: new Date().toISOString(),
            metadata: {
              stages: [
                {
                  stage: "retrieval",
                  status: "completed",
                  model: "gpt-4",
                  tier: "strong",
                  message: "Retrieved 5 notes",
                  duration_ms: 1200,
                },
                {
                  stage: "answer_generation",
                  status: "completed",
                  model: "gpt-4",
                  tier: "strong",
                  message: "Generated answer",
                  duration_ms: 1500,
                },
              ],
              sources: [
                { server: "MathClass", channel: "极限", excerpt: "Limits are..." },
                { server: "PhysicsLab", channel: "力学", excerpt: "Newton's laws..." },
              ],
            },
          },
        ]}
      />
    );

    // Both AgentConversation and sources should coexist
    const agentConv = screen.getByTestId("agent-conversation");
    expect(agentConv).toBeInTheDocument();

    // Sources section should exist with count text
    expect(screen.getByText(/基于 2 条笔记/)).toBeInTheDocument();

    // Source references should display
    expect(screen.getByText("@MathClass/#极限")).toBeInTheDocument();
    expect(screen.getByText("@PhysicsLab/#力学")).toBeInTheDocument();

    // AgentConversation should appear BEFORE sources in the DOM
    const agentConvEl = container.querySelector('[data-testid="agent-conversation"]');
    const sourcesText = screen.getByText(/基于 2 条笔记/);
    expect(
      agentConvEl!.compareDocumentPosition(sourcesText) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // No overlap: both sections should be independently present
    const toggle = screen.getByTestId("agent-conversation-toggle");
    expect(toggle).toBeInTheDocument();

    const viewAllSources = screen.getByText("查看全部来源");
    expect(viewAllSources).toBeInTheDocument();
  });
});
