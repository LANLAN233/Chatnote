import { useEffect } from "react";
import { useNoteStore } from "../../stores";
import wsService from "../../services/websocket";

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { addRealtimeNote, updateRealtimeNote, removeRealtimeNote } = useNoteStore();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      wsService.connect();
    }

    // Subscribe to WebSocket events
    const unsubscribeCreated = wsService.on("note_created", (data) => {
      addRealtimeNote(data);
    });

    const unsubscribeUpdated = wsService.on("note_updated", (data) => {
      updateRealtimeNote(data);
    });

    const unsubscribeDeleted = wsService.on("note_deleted", (data) => {
      removeRealtimeNote(data.id);
    });

    const unsubscribeScheduleReminder = wsService.on("schedule_reminder", (data) => {
      if (Notification.permission === "granted") {
        new Notification("日程提醒", {
          body: data.title,
          icon: "/favicon.ico",
        });
      }
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
      unsubscribeDeleted();
      unsubscribeScheduleReminder();
    };
  }, [addRealtimeNote, updateRealtimeNote, removeRealtimeNote]);

  return <>{children}</>;
}
