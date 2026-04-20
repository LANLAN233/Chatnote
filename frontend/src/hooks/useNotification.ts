import { useEffect, useCallback } from "react";
import { scheduleApi } from "../services/scheduleApi";

export function useNotification() {
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }

    return false;
  }, []);

  const showNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (Notification.permission === "granted") {
        new Notification(title, {
          icon: "/favicon.ico",
          ...options,
        });
      }
    },
    []
  );

  // 检查并显示日程提醒
  const checkScheduleReminders = useCallback(async () => {
    try {
      const schedules = await scheduleApi.getTodaySchedules();
      const now = new Date();

      schedules.forEach((schedule) => {
        if (schedule.is_all_day || schedule.reminder_minutes === 0) return;

        const [hours, minutes] = schedule.start_time.split(":").map(Number);
        const scheduleTime = new Date();
        scheduleTime.setHours(hours, minutes, 0);

        const diffMinutes = (scheduleTime.getTime() - now.getTime()) / 1000 / 60;

        // 如果日程即将开始（在提醒时间范围内），显示通知
        if (diffMinutes > 0 && diffMinutes <= schedule.reminder_minutes) {
          showNotification(`日程提醒: ${schedule.title}`, {
            body: schedule.description || `将于 ${schedule.start_time.substring(0, 5)} 开始`,
            tag: `schedule-${schedule.id}`, // 防止重复通知
          });
        }
      });
    } catch (err) {
      console.error("Failed to check schedule reminders:", err);
    }
  }, [showNotification]);

  useEffect(() => {
    // 请求通知权限
    requestPermission();

    // 每分钟检查一次提醒
    const interval = setInterval(checkScheduleReminders, 60000);

    // 立即检查一次
    checkScheduleReminders();

    return () => clearInterval(interval);
  }, [checkScheduleReminders, requestPermission]);

  return { requestPermission, showNotification, checkScheduleReminders };
}
