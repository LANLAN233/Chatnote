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

  it("renders collapsed by default for completed status", () => {
    const completedProgress = makeProgress({
      overall_status: "completed",
      current_stage: 3,
      stages: [
        { stage: "step_one", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 500 },
        { stage: "step_two", status: "completed", model: "gpt-4o", tier: "strong", message: "Done", duration_ms: 700 },
      ],
    });
    render(<AiProgressPanel progress={completedProgress} />);

    const toggle = screen.getByTestId("progress-toggle");

    // Toggle button should be present
    expect(toggle).toBeInTheDocument();

    // Progress fraction visible in header
    expect(toggle.textContent).toContain("2/2");

    // Summary text for completed
    expect(toggle.textContent).toContain("完成");

    // Step details container should have collapsed classes
    const stepContainer = screen.queryByTestId("progress-step-0")?.parentElement?.parentElement;
    expect(stepContainer?.className).toContain("max-h-0");
    expect(stepContainer?.className).toContain("opacity-0");
  });

  it("expands to show step details when clicked", () => {
    const completedProgress = makeProgress({
      overall_status: "completed",
      current_stage: 1,
      stages: [
        { stage: "extract_knowledge", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 1200 },
        { stage: "generate_summary", status: "completed", model: "gpt-4o", tier: "strong", message: "Done", duration_ms: 800 },
      ],
    });
    render(<AiProgressPanel progress={completedProgress} />);

    const toggle = screen.getByTestId("progress-toggle");
    fireEvent.click(toggle);

    // All steps should now be visible
    expect(screen.getByTestId("progress-step-0")).toBeVisible();
    expect(screen.getByTestId("progress-step-1")).toBeVisible();

    // Step content checks
    expect(screen.getByText("extract_knowledge")).toBeInTheDocument();
    expect(screen.getByText("generate_summary")).toBeInTheDocument();

    // Model and tier info (scoped to first step)
    const firstStep = screen.getByTestId("progress-step-0");
    expect(within(firstStep).getByText(/Model: gpt-4o/)).toBeInTheDocument();
    expect(within(firstStep).getByText(/Tier: primary/)).toBeInTheDocument();

    // Duration shown for completed step
    expect(screen.getByText(/Done \(1\.2s\)/)).toBeInTheDocument();
  });

  it("shows correct status icons in expanded view", () => {
    const completedProgress = makeProgress({
      overall_status: "completed",
      current_stage: 3,
      stages: [
        { stage: "step_a", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 100 },
        { stage: "step_b", status: "in_progress", model: "gpt-4o", tier: "strong", message: "Working" },
        { stage: "step_c", status: "pending", model: "", tier: "fast", message: "Pending" },
        { stage: "step_d", status: "fallback", model: "gpt-3.5-turbo", tier: "fast", message: "Fallback" },
      ],
    });
    render(<AiProgressPanel progress={completedProgress} />);

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
    const completedProgress = makeProgress({
      overall_status: "completed",
      current_stage: 1,
      stages: [
        { stage: "step_one", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 200 },
        { stage: "fallback_step", status: "fallback", model: "gpt-3.5-turbo", tier: "fast", message: "Fallback", duration_ms: 300 },
      ],
    });
    render(<AiProgressPanel progress={completedProgress} />);

    fireEvent.click(screen.getByTestId("progress-toggle"));

    const fallbackStep = screen.getByTestId("progress-step-1");
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

    // Overall status should show failed summary text
    const toggle = screen.getByTestId("progress-toggle");
    expect(toggle.textContent).toContain("失败");
    expect(toggle.textContent).toContain("1/2");

    fireEvent.click(screen.getByTestId("progress-toggle"));

    const failedStep = screen.getByTestId("progress-step-1");
    expect(failedStep.textContent).toContain("❌");
    expect(failedStep.textContent).toContain("Failed");
  });

  it("ignores defaultExpanded when status is completed", () => {
    const completedProgress = makeProgress({
      overall_status: "completed",
      current_stage: 1,
      stages: [
        { stage: "step_one", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 500 },
      ],
    });
    render(<AiProgressPanel progress={completedProgress} defaultExpanded={true} />);

    // Should be collapsed because status is completed
    const stepContainer = screen.queryByTestId("progress-step-0")?.parentElement?.parentElement;
    expect(stepContainer?.className).toContain("max-h-0");
  });

  it("updates aria-expanded attribute", () => {
    const completedProgress = makeProgress({
      overall_status: "completed",
      current_stage: 0,
      stages: [
        { stage: "step_one", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 500 },
      ],
    });
    render(<AiProgressPanel progress={completedProgress} />);

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

  it("renders summary row when overall_status is completed", () => {
    const completedProgress = makeProgress({
      overall_status: "completed",
      current_stage: 1,
      stages: [
        { stage: "step_one", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 500 },
        { stage: "step_two", status: "completed", model: "gpt-4o", tier: "strong", message: "Done", duration_ms: 700 },
      ],
    });
    render(<AiProgressPanel progress={completedProgress} />);

    // Summary row should be visible
    expect(screen.getByTestId("progress-summary")).toBeInTheDocument();

    // Summary text should contain completed info
    const toggle = screen.getByTestId("progress-toggle");
    expect(toggle.textContent).toContain("完成");
    expect(toggle.textContent).toContain("2/2");
    expect(toggle.textContent).toContain("1.2s");

    // Stage list should be collapsed (max-h-0)
    const stepContainer = screen.queryByTestId("progress-step-0")?.parentElement?.parentElement;
    expect(stepContainer?.className).toContain("max-h-0");
  });

  it("expands on toggle click when completed", () => {
    const completedProgress = makeProgress({
      overall_status: "completed",
      current_stage: 1,
      stages: [
        { stage: "step_one", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 500 },
        { stage: "step_two", status: "completed", model: "gpt-4o", tier: "strong", message: "Done", duration_ms: 700 },
      ],
    });
    render(<AiProgressPanel progress={completedProgress} />);

    const toggle = screen.getByTestId("progress-toggle");
    fireEvent.click(toggle);

    // Stage list should now be expanded (max-h-96)
    const stepContainer = screen.queryByTestId("progress-step-0")?.parentElement?.parentElement;
    expect(stepContainer?.className).toContain("max-h-96");
    expect(stepContainer?.className).toContain("opacity-100");
  });

  it("stays expanded for in_progress status", () => {
    render(<AiProgressPanel progress={makeProgress()} />);

    // Should be expanded by default when in_progress
    const stepContainer = screen.queryByTestId("progress-step-0")?.parentElement?.parentElement;
    expect(stepContainer?.className).toContain("max-h-96");
    expect(stepContainer?.className).toContain("opacity-100");
  });

  it("auto-shrinks when status changes to completed", () => {
    const inProgressProgress = makeProgress({
      overall_status: "in_progress",
      current_stage: 1,
      stages: [
        { stage: "step_one", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 500 },
        { stage: "step_two", status: "in_progress", model: "gpt-4o", tier: "strong", message: "Working..." },
      ],
    });
    const { rerender } = render(<AiProgressPanel progress={inProgressProgress} />);

    // Should be expanded while in_progress
    let stepContainer = screen.queryByTestId("progress-step-0")?.parentElement?.parentElement;
    expect(stepContainer?.className).toContain("max-h-96");

    // Change to completed
    const completedProgress = makeProgress({
      overall_status: "completed",
      current_stage: 1,
      stages: [
        { stage: "step_one", status: "completed", model: "gpt-4o", tier: "primary", message: "Done", duration_ms: 500 },
        { stage: "step_two", status: "completed", model: "gpt-4o", tier: "strong", message: "Done", duration_ms: 700 },
      ],
    });
    rerender(<AiProgressPanel progress={completedProgress} />);

    // Should now be collapsed
    stepContainer = screen.queryByTestId("progress-step-0")?.parentElement?.parentElement;
    expect(stepContainer?.className).toContain("max-h-0");
  });
});
