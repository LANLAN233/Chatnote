import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AiProgressPanel from "./AiProgressPanel";
import type { AiProgressEvent } from "../../types";

function makeProgress(overrides?: Partial<AiProgressEvent>): AiProgressEvent {
  return {
    operation_id: "op-1",
    stages: [
      {
        stage: "extract_knowledge",
        status: "completed",
        model: "gpt-4o",
        tier: "primary",
        message: "Extracted knowledge",
        duration_ms: 1200,
      },
      {
        stage: "generate_summary",
        status: "in_progress",
        model: "gpt-4o",
        tier: "strong",
        message: "Generating summary...",
      },
      {
        stage: "extract_keywords",
        status: "pending",
        model: "",
        tier: "fast",
        message: "Pending",
      },
      {
        stage: "fallback_step",
        status: "fallback",
        model: "gpt-3.5-turbo",
        tier: "fast",
        message: "Using fallback model",
      },
    ],
    current_stage: 1,
    overall_status: "in_progress",
    ...overrides,
  };
}

describe("AiProgressPanel", () => {
  it("returns null when progress is null", () => {
    const { container } = render(<AiProgressPanel progress={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders collapsed by default", () => {
    render(<AiProgressPanel progress={makeProgress()} />);

    const toggle = screen.getByTestId("progress-toggle");

    // Toggle button should be present
    expect(toggle).toBeInTheDocument();

    // Progress fraction visible in header
    expect(toggle.textContent).toContain("2/4");

    // Current stage message visible in header
    expect(toggle.textContent).toContain("Generating summary...");

    // Step details container should have collapsed classes
    const stepContainer = screen.queryByTestId("progress-step-0")?.parentElement?.parentElement;
    expect(stepContainer?.className).toContain("max-h-0");
    expect(stepContainer?.className).toContain("opacity-0");
  });

  it("expands to show step details when clicked", () => {
    render(<AiProgressPanel progress={makeProgress()} />);

    const toggle = screen.getByTestId("progress-toggle");
    fireEvent.click(toggle);

    // All steps should now be visible
    expect(screen.getByTestId("progress-step-0")).toBeVisible();
    expect(screen.getByTestId("progress-step-1")).toBeVisible();
    expect(screen.getByTestId("progress-step-2")).toBeVisible();
    expect(screen.getByTestId("progress-step-3")).toBeVisible();

    // Step content checks
    expect(screen.getByText("extract_knowledge")).toBeInTheDocument();
    expect(screen.getByText("generate_summary")).toBeInTheDocument();
    expect(screen.getByText("extract_keywords")).toBeInTheDocument();
    expect(screen.getByText("fallback_step")).toBeInTheDocument();

    // Model and tier info (scoped to first step)
    const firstStep = screen.getByTestId("progress-step-0");
    expect(within(firstStep).getByText(/Model: gpt-4o/)).toBeInTheDocument();
    expect(within(firstStep).getByText(/Tier: primary/)).toBeInTheDocument();

    // Duration shown for completed step
    expect(screen.getByText(/Done \(1\.2s\)/)).toBeInTheDocument();
  });

  it("shows correct status icons in expanded view", () => {
    render(<AiProgressPanel progress={makeProgress()} />);

    fireEvent.click(screen.getByTestId("progress-toggle"));

    const steps = [
      { idx: 0, icon: "✅" },
      { idx: 1, icon: "⏳" },
      { idx: 2, icon: "○" },
      { idx: 3, icon: "⚠️" },
    ];

    for (const { idx, icon } of steps) {
      const step = screen.getByTestId(`progress-step-${idx}`);
      expect(step.textContent).toContain(icon);
    }
  });

  it("applies fallback warning styling to fallback steps", () => {
    render(<AiProgressPanel progress={makeProgress()} />);

    fireEvent.click(screen.getByTestId("progress-toggle"));

    const fallbackStep = screen.getByTestId("progress-step-3");
    // Should have amber background tint class
    expect(fallbackStep.className).toContain("bg-[#fee75c]/10");
    // Should have amber text color for stage name
    expect(fallbackStep.textContent).toContain("Fallback");
  });

  it("shows failed status correctly", () => {
    const progress = makeProgress({
      overall_status: "failed",
      current_stage: 1,
      stages: [
        {
          stage: "step_one",
          status: "completed",
          model: "gpt-4o",
          tier: "primary",
          message: "Done",
          duration_ms: 500,
        },
        {
          stage: "step_two",
          status: "failed",
          model: "gpt-4o",
          tier: "strong",
          message: "Error occurred",
        },
      ],
    });

    render(<AiProgressPanel progress={progress} />);

    // Overall status should show error color (message text)
    expect(screen.getByText("Error occurred")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("progress-toggle"));

    const failedStep = screen.getByTestId("progress-step-1");
    expect(failedStep.textContent).toContain("❌");
    expect(failedStep.textContent).toContain("Failed");
  });

  it("respects defaultExpanded prop", () => {
    render(<AiProgressPanel progress={makeProgress()} defaultExpanded={true} />);

    // Steps should be visible immediately
    expect(screen.getByTestId("progress-step-0")).toBeVisible();
  });

  it("updates aria-expanded attribute", () => {
    render(<AiProgressPanel progress={makeProgress()} />);

    const toggle = screen.getByTestId("progress-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("handles zero stages gracefully", () => {
    const progress = makeProgress({ stages: [], current_stage: 0 });
    render(<AiProgressPanel progress={progress} />);

    const toggle = screen.getByTestId("progress-toggle");
    expect(toggle.textContent).toContain("0/0");
    expect(toggle.textContent).toContain("Processing...");
  });
});
