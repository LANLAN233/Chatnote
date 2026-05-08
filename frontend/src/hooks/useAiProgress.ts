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
        setProgress(event);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (progressUnsubRef.current) progressUnsubRef.current();
      if (disconnectUnsubRef.current) disconnectUnsubRef.current();
    };
  }, []);

  return { progress, disconnected, startTracking, stopTracking };
}
