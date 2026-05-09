import { useState, useEffect, useCallback, useRef } from "react";
import { wsService } from "../services";
import type { AiProgressEvent } from "../types";

export function useAiProgress() {
  const [progress, setProgress] = useState<AiProgressEvent | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const activeRef = useRef(false);
  const progressUnsubRef = useRef<(() => void) | null>(null);
  const disconnectUnsubRef = useRef<(() => void) | null>(null);

  const startTracking = useCallback(() => {
    // Defensive: clean up any previous subscriptions (prevents listener leaks on double-call)
    if (progressUnsubRef.current) {
      progressUnsubRef.current();
      progressUnsubRef.current = null;
    }
    if (disconnectUnsubRef.current) {
      disconnectUnsubRef.current();
      disconnectUnsubRef.current = null;
    }

    activeRef.current = true;
    setProgress(null);
    setDisconnected(false);

    progressUnsubRef.current = wsService.on("ai_progress", (event: AiProgressEvent) => {
      if (activeRef.current) {
        setProgress((prev) => {
          if (!prev) return event;
          if (prev.operation_id === event.operation_id) {
            // Accumulate stages: merge by stage name, incoming overwrites
            const stageMap = new Map<string, AiProgressEvent["stages"][number]>();
            for (const s of prev.stages) stageMap.set(s.stage, s);
            for (const s of event.stages) stageMap.set(s.stage, s);
            return {
              ...prev,
              stages: Array.from(stageMap.values()),
              current_stage: event.current_stage,
              overall_status: event.overall_status,
            };
          }
          // Different operation_id: replace entirely
          return event;
        });
      }
    });

    disconnectUnsubRef.current = wsService.onDisconnect(() => {
      if (activeRef.current) {
        setDisconnected(true);
      }
    });
  }, []);

  const stopTracking = useCallback(() => {
    activeRef.current = false;
    if (progressUnsubRef.current) {
      progressUnsubRef.current();
      progressUnsubRef.current = null;
    }
    if (disconnectUnsubRef.current) {
      disconnectUnsubRef.current();
      disconnectUnsubRef.current = null;
    }
    setProgress(null);
    setDisconnected(false);
  }, []);

  const clearProgress = useCallback(() => {
    setProgress(null);
    setDisconnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (progressUnsubRef.current) progressUnsubRef.current();
      if (disconnectUnsubRef.current) disconnectUnsubRef.current();
    };
  }, []);

  return { progress, disconnected, startTracking, stopTracking, clearProgress };
}
