import { describe, it, expect, vi, beforeEach } from "vitest";
import { wsService } from "./websocket";
import type { AiProgressEvent, AiProgressStage } from "../types";

function makeStage(overrides?: Partial<AiProgressStage>): AiProgressStage {
  return {
    stage: "classify",
    status: "completed",
    model: "gpt-4o",
    tier: "strong",
    message: "done",
    duration_ms: 150,
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<AiProgressEvent>): AiProgressEvent {
  return {
    operation_id: "op-001",
    stages: [makeStage()],
    current_stage: 0,
    overall_status: "running",
    ...overrides,
  };
}

describe("WebSocketService ai_progress", () => {
  let service: any;

  beforeEach(() => {
    service = wsService as any;
    // Clear any leftover state between tests
    service.progressSubscribers.clear();
    service.latestProgress.clear();
  });

  describe("subscribeToProgress", () => {
    it("returns an unsubscribe function", () => {
      const unsub = wsService.subscribeToProgress("op-1", () => {});
      expect(typeof unsub).toBe("function");
      unsub();
    });

    it("calls callback when ai_progress event with matching operation_id arrives", () => {
      const cb = vi.fn();
      wsService.subscribeToProgress("op-1", cb);

      const event = makeEvent({ operation_id: "op-1" });
      service.handleMessage({ type: "ai_progress", data: event });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(event);
    });

    it("does NOT call callback for non-matching operation_id", () => {
      const cb = vi.fn();
      wsService.subscribeToProgress("op-1", cb);

      const event = makeEvent({ operation_id: "op-2" });
      service.handleMessage({ type: "ai_progress", data: event });

      expect(cb).not.toHaveBeenCalled();
    });

    it("does NOT call callback for non-ai_progress messages", () => {
      const cb = vi.fn();
      wsService.subscribeToProgress("op-1", cb);

      service.handleMessage({ type: "note_update", data: { id: 1 } });

      expect(cb).not.toHaveBeenCalled();
    });

    it("unsubscribe stops callback from being called", () => {
      const cb = vi.fn();
      const unsub = wsService.subscribeToProgress("op-1", cb);

      const event1 = makeEvent({ operation_id: "op-1" });
      service.handleMessage({ type: "ai_progress", data: event1 });
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();

      const event2 = makeEvent({ operation_id: "op-1", current_stage: 1 });
      service.handleMessage({ type: "ai_progress", data: event2 });
      expect(cb).toHaveBeenCalledTimes(1); // still 1, no second call
    });

    it("multiple subscribers for same operation_id all get called", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      wsService.subscribeToProgress("op-1", cb1);
      wsService.subscribeToProgress("op-1", cb2);

      const event = makeEvent({ operation_id: "op-1" });
      service.handleMessage({ type: "ai_progress", data: event });

      expect(cb1).toHaveBeenCalledWith(event);
      expect(cb2).toHaveBeenCalledWith(event);
    });

    it("unsubscribing one does not affect other subscribers", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const unsub1 = wsService.subscribeToProgress("op-1", cb1);
      wsService.subscribeToProgress("op-1", cb2);

      unsub1();

      const event = makeEvent({ operation_id: "op-1" });
      service.handleMessage({ type: "ai_progress", data: event });

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledWith(event);
    });

    it("stores latest progress in internal map", () => {
      const cb = vi.fn();
      wsService.subscribeToProgress("op-1", cb);

      const event = makeEvent({ operation_id: "op-1" });
      service.handleMessage({ type: "ai_progress", data: event });

      expect(service.latestProgress.get("op-1")).toEqual(event);
    });

    it("handles event with null data gracefully", () => {
      const cb = vi.fn();
      wsService.subscribeToProgress("op-1", cb);

      // null data should not crash
      expect(() => {
        service.handleMessage({ type: "ai_progress", data: null });
      }).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });

    it("handles event missing operation_id gracefully", () => {
      const cb = vi.fn();
      wsService.subscribeToProgress("op-1", cb);

      expect(() => {
        service.handleMessage({ type: "ai_progress", data: { stages: [] } });
      }).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });

    it("subscribing twice with same callback only fires once per event", () => {
      const cb = vi.fn();
      wsService.subscribeToProgress("op-1", cb);
      wsService.subscribeToProgress("op-1", cb); // same callback again

      const event = makeEvent({ operation_id: "op-1" });
      service.handleMessage({ type: "ai_progress", data: event });

      // Set.add ignores duplicates, so cb fires once
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe("clearProgress", () => {
    it("removes stored progress for given operation_id", () => {
      const cb = vi.fn();
      wsService.subscribeToProgress("op-1", cb);

      const event = makeEvent({ operation_id: "op-1" });
      service.handleMessage({ type: "ai_progress", data: event });
      expect(service.latestProgress.has("op-1")).toBe(true);

      wsService.clearProgress("op-1");

      expect(service.latestProgress.has("op-1")).toBe(false);
      expect(service.progressSubscribers.has("op-1")).toBe(false);
    });

    it("is safe to call with non-existent operation_id", () => {
      expect(() => wsService.clearProgress("nonexistent")).not.toThrow();
    });

    it("cleared subscribers no longer fire", () => {
      const cb = vi.fn();
      wsService.subscribeToProgress("op-1", cb);

      wsService.clearProgress("op-1");

      const event = makeEvent({ operation_id: "op-1" });
      service.handleMessage({ type: "ai_progress", data: event });

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe("AiProgressStage shape", () => {
    it("accepts all valid status values", () => {
      const validStatuses: AiProgressStage["status"][] = [
        "pending",
        "in_progress",
        "completed",
        "failed",
        "skipped",
        "fallback",
      ];

      validStatuses.forEach((status) => {
        const stage = makeStage({ status });
        expect(stage.status).toBe(status);
      });
    });
  });

  describe("AiProgressEvent shape", () => {
    it("has all expected fields", () => {
      const event = makeEvent({
        operation_id: "abc-123",
        stages: [makeStage({ stage: "fetch", status: "in_progress" })],
        current_stage: 2,
        overall_status: "processing",
      });

      expect(event.operation_id).toBe("abc-123");
      expect(event.stages).toHaveLength(1);
      expect(event.current_stage).toBe(2);
      expect(event.overall_status).toBe("processing");
    });

    it("can have optional fields undefined", () => {
      const stage: AiProgressStage = {
        stage: "summarize",
        status: "in_progress",
        model: "gpt-4o",
        tier: "strong",
        message: "working…",
      };
      expect(stage.duration_ms).toBeUndefined();
      expect(stage.metadata).toBeUndefined();
    });

    it("can have optional fields set", () => {
      const stage: AiProgressStage = {
        stage: "summarize",
        status: "completed",
        model: "claude-3",
        tier: "strong",
        message: "done",
        duration_ms: 430,
        metadata: { tokens: 1500 },
      };
      expect(stage.duration_ms).toBe(430);
      expect(stage.metadata).toEqual({ tokens: 1500 });
    });
  });
});
