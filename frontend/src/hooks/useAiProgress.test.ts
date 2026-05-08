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
