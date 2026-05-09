import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiProgress } from "./useAiProgress";

const mockOn = vi.fn();
const mockOnDisconnect = vi.fn();

vi.mock("../services", () => ({
  wsService: {
    on: (...args: unknown[]) => mockOn(...args),
    onDisconnect: (...args: unknown[]) => mockOnDisconnect(...args),
  },
}));

describe("useAiProgress", () => {
  let progressHandler: ((event: unknown) => void) | null = null;
  let disconnectHandler: (() => void) | null = null;
  let progressUnsub: ReturnType<typeof vi.fn>;
  let disconnectUnsub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    progressHandler = null;
    disconnectHandler = null;
    progressUnsub = vi.fn();
    disconnectUnsub = vi.fn();

    mockOn.mockImplementation((type: string, handler: (event: unknown) => void) => {
      if (type === "ai_progress") {
        progressHandler = handler;
      }
      return progressUnsub;
    });

    mockOnDisconnect.mockImplementation((handler: () => void) => {
      disconnectHandler = handler;
      return disconnectUnsub;
    });
  });

  it("should start with progress null and disconnected false", () => {
    const { result } = renderHook(() => useAiProgress());
    expect(result.current.progress).toBeNull();
    expect(result.current.disconnected).toBe(false);
  });

  it("should subscribe to ws events on startTracking", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    expect(mockOn).toHaveBeenCalledWith("ai_progress", expect.any(Function));
    expect(mockOnDisconnect).toHaveBeenCalledWith(expect.any(Function));
  });

  it("should update progress when ai_progress event fires during tracking", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    const progressEvent = {
      operation_id: "op-1",
      stages: [],
      current_stage: 0,
      overall_status: "in_progress",
    };

    act(() => {
      progressHandler!(progressEvent);
    });

    expect(result.current.progress).toEqual(progressEvent);
  });

  it("should ignore ai_progress events after stopTracking", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    const progressEvent = {
      operation_id: "op-1",
      stages: [],
      current_stage: 0,
      overall_status: "in_progress",
    };

    act(() => {
      progressHandler!(progressEvent);
    });

    expect(result.current.progress).toEqual(progressEvent);

    act(() => {
      result.current.stopTracking();
    });

    // Fire another event after stop
    act(() => {
      progressHandler!({
        operation_id: "op-1",
        stages: [],
        current_stage: 1,
        overall_status: "completed",
      });
    });

    // Progress should be null (cleared by stopTracking) and stayed null
    expect(result.current.progress).toBeNull();
    expect(progressUnsub).toHaveBeenCalled();
  });

  it("should set disconnected on WS disconnect during tracking", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    expect(result.current.disconnected).toBe(false);

    act(() => {
      disconnectHandler!();
    });

    expect(result.current.disconnected).toBe(true);
  });

  it("should clear disconnected on stopTracking", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    act(() => {
      disconnectHandler!();
    });

    expect(result.current.disconnected).toBe(true);

    act(() => {
      result.current.stopTracking();
    });

    expect(result.current.disconnected).toBe(false);
  });

  it("should ignore disconnect after stopTracking", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    act(() => {
      result.current.stopTracking();
    });

    // Disconnect happens after tracking stopped
    act(() => {
      disconnectHandler!();
    });

    expect(result.current.disconnected).toBe(false);
  });

  it("should unsubscribe on unmount", () => {
    const { result, unmount } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    unmount();

    expect(progressUnsub).toHaveBeenCalled();
    expect(disconnectUnsub).toHaveBeenCalled();
  });

  it("should handle double startTracking without listener leaks", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    // First call subscribed
    expect(mockOn).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.startTracking();
    });

    // Should have unsubscribed old handlers before subscribing new ones
    expect(progressUnsub).toHaveBeenCalled();
    expect(mockOn).toHaveBeenCalledTimes(2);
  });

  it("should handle stopTracking when never started (no-op)", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.stopTracking();
    });

    expect(result.current.progress).toBeNull();
    expect(result.current.disconnected).toBe(false);
    expect(progressUnsub).not.toHaveBeenCalled();
    expect(disconnectUnsub).not.toHaveBeenCalled();
  });

  it("should accumulate stages for same operation_id", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    // First event: stage 1
    act(() => {
      progressHandler!({
        operation_id: "op-1",
        stages: [
          {
            stage: "init",
            status: "completed",
            model: "gpt-4",
            tier: "primary",
            message: "Initialization done",
          },
        ],
        current_stage: 1,
        overall_status: "in_progress",
      });
    });

    expect(result.current.progress?.stages.length).toBe(1);

    // Second event: same op_id, new stage 2 (accumulate)
    act(() => {
      progressHandler!({
        operation_id: "op-1",
        stages: [
          {
            stage: "processing",
            status: "in_progress",
            model: "gpt-4",
            tier: "primary",
            message: "Processing data",
          },
        ],
        current_stage: 2,
        overall_status: "in_progress",
      });
    });

    expect(result.current.progress?.stages.length).toBe(2);
    expect(result.current.progress?.current_stage).toBe(2);
    expect(result.current.progress?.overall_status).toBe("in_progress");
    expect(result.current.progress?.operation_id).toBe("op-1");
  });

  it("should update stage status when same stage name arrives with new status", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    // Stage "init" as in_progress
    act(() => {
      progressHandler!({
        operation_id: "op-1",
        stages: [
          {
            stage: "init",
            status: "in_progress",
            model: "gpt-4",
            tier: "primary",
            message: "Starting",
          },
        ],
        current_stage: 0,
        overall_status: "in_progress",
      });
    });

    expect(result.current.progress?.stages[0].status).toBe("in_progress");

    // Same stage name, updated to completed
    act(() => {
      progressHandler!({
        operation_id: "op-1",
        stages: [
          {
            stage: "init",
            status: "completed",
            model: "gpt-4",
            tier: "primary",
            message: "Done",
          },
        ],
        current_stage: 0,
        overall_status: "in_progress",
      });
    });

    expect(result.current.progress?.stages.length).toBe(1);
    expect(result.current.progress?.stages[0].status).toBe("completed");
    expect(result.current.progress?.stages[0].message).toBe("Done");
  });

  it("should replace progress when different operation_id arrives", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    // First op
    act(() => {
      progressHandler!({
        operation_id: "op-1",
        stages: [
          {
            stage: "init",
            status: "completed",
            model: "gpt-4",
            tier: "primary",
            message: "Op1 init",
          },
        ],
        current_stage: 1,
        overall_status: "in_progress",
      });
    });

    expect(result.current.progress?.operation_id).toBe("op-1");

    // Second op (different)
    act(() => {
      progressHandler!({
        operation_id: "op-2",
        stages: [
          {
            stage: "setup",
            status: "in_progress",
            model: "claude",
            tier: "secondary",
            message: "Op2 setup",
          },
        ],
        current_stage: 0,
        overall_status: "in_progress",
      });
    });

    expect(result.current.progress?.operation_id).toBe("op-2");
    expect(result.current.progress?.stages.length).toBe(1);
    expect(result.current.progress?.stages[0].stage).toBe("setup");
  });

  it("should keep progress on completed status (not clear)", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    act(() => {
      progressHandler!({
        operation_id: "op-1",
        stages: [
          {
            stage: "init",
            status: "completed",
            model: "gpt-4",
            tier: "primary",
            message: "Done",
          },
        ],
        current_stage: 1,
        overall_status: "completed",
      });
    });

    expect(result.current.progress).not.toBeNull();
    expect(result.current.progress?.overall_status).toBe("completed");
  });

  it("should expose clearProgress function that clears without unsubscribing", () => {
    const { result } = renderHook(() => useAiProgress());

    act(() => {
      result.current.startTracking();
    });

    // Set some progress
    act(() => {
      progressHandler!({
        operation_id: "op-1",
        stages: [],
        current_stage: 0,
        overall_status: "in_progress",
      });
    });

    expect(result.current.progress).not.toBeNull();

    // Also set disconnected
    act(() => {
      disconnectHandler!();
    });

    expect(result.current.disconnected).toBe(true);

    // Clear progress
    act(() => {
      result.current.clearProgress();
    });

    expect(result.current.progress).toBeNull();
    expect(result.current.disconnected).toBe(false);

    // Progress unsub should NOT have been called (clearProgress doesn't unsubscribe)
    expect(progressUnsub).not.toHaveBeenCalledWith();
    expect(disconnectUnsub).not.toHaveBeenCalledWith();

    // Verify tracking is still active: new events should still be processed
    act(() => {
      progressHandler!({
        operation_id: "op-3",
        stages: [
          {
            stage: "new-stage",
            status: "in_progress",
            model: "gpt-4",
            tier: "primary",
            message: "Still tracking",
          },
        ],
        current_stage: 0,
        overall_status: "in_progress",
      });
    });

    expect(result.current.progress).not.toBeNull();
    expect(result.current.progress?.operation_id).toBe("op-3");
  });

  it("should clear progress on startTracking", () => {
    const { result } = renderHook(() => useAiProgress());

    // Simulate a previous tracking session
    act(() => {
      result.current.startTracking();
    });

    act(() => {
      progressHandler!({
        operation_id: "op-1",
        stages: [],
        current_stage: 0,
        overall_status: "in_progress",
      });
    });

    expect(result.current.progress).not.toBeNull();

    // Stop and restart
    act(() => {
      result.current.stopTracking();
    });

    act(() => {
      result.current.startTracking();
    });

    expect(result.current.progress).toBeNull();
  });
});
