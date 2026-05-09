import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AgentConversation from "./AgentConversation";

describe("AgentConversation", () => {
  const completedStages = [
    {
      stage: "retrieval",
      status: "completed" as const,
      model: "gpt-4o",
      tier: "standard",
      message: "检索完成",
      duration_ms: 320,
    },
    {
      stage: "answer_generation",
      status: "completed" as const,
      model: "gpt-4o",
      tier: "standard",
      message: "生成完成",
      duration_ms: 1200,
    },
  ];

  it("renders collapsed by default", () => {
    const { container } = render(<AgentConversation stages={completedStages} />);

    // Toggle button should exist
    expect(screen.getByTestId("agent-conversation-toggle")).toBeInTheDocument();

    // Body should have maxHeight 0px when collapsed
    const body = container.querySelector('[data-testid="agent-conversation-body"]');
    expect(body).toHaveStyle("max-height: 0px");
  });

  it("expands on click showing all stages", () => {
    const { container } = render(<AgentConversation stages={completedStages} />);

    // Click toggle to expand
    fireEvent.click(screen.getByTestId("agent-conversation-toggle"));

    // Body should now be visible
    const body = container.querySelector('[data-testid="agent-conversation-body"]');
    expect(body).toHaveStyle("max-height: 400px");

    // Check Chinese labels appear
    expect(screen.getByText("检索")).toBeInTheDocument();
    expect(screen.getByText("回答生成")).toBeInTheDocument();

    // Check ✅ icons are present
    expect(screen.getAllByText("✅").length).toBe(2);
  });

  it("shows error styling for failed stages", () => {
    const failedStages = [
      {
        stage: "retrieval",
        status: "failed" as const,
        model: "gpt-4o",
        tier: "standard",
        message: "检索失败",
        duration_ms: 150,
      },
    ];

    render(<AgentConversation stages={failedStages} />);

    // Click toggle to expand
    fireEvent.click(screen.getByTestId("agent-conversation-toggle"));

    // Check ❌ icon is present
    expect(screen.getByText("❌")).toBeInTheDocument();

    // Check red border class on the failed stage card
    const card = screen.getByTestId("stage-card-0");
    expect(card).toHaveClass("border-[#f23f43]");
    expect(card).toHaveClass("bg-[#f23f43]/5");
  });

  it("renders nothing when stages is empty", () => {
    const { container } = render(<AgentConversation stages={[]} />);

    // Component should render nothing
    expect(container.querySelector('[data-testid="agent-conversation"]')).not.toBeInTheDocument();
  });

  it("renders title with stage count", () => {
    render(<AgentConversation stages={completedStages} />);

    // Check title text
    expect(screen.getByText("Agent Conversation")).toBeInTheDocument();

    // Check stage count badge
    expect(screen.getByText("2 stages")).toBeInTheDocument();
  });
});
