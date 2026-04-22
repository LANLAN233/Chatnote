import React, { useState, useEffect } from "react";
import type { Schedule, Server, Channel } from "../../types";
import { scheduleApi } from "../../services/scheduleApi";

interface TodayScheduleProps {
  servers: Server[];
  channels: Channel[];
}

const COLORS: Record<string, string> = {
  "#5865f2": "border-l-[#5865f2]",
  "#eb459e": "border-l-[#eb459e]",
  "#3ba55d": "border-l-[#3ba55d]",
  "#f39c12": "border-l-[#f39c12]",
  "#e74c3c": "border-l-[#e74c3c]",
  "#9b59b6": "border-l-[#9b59b6]",
  "#1abc9c": "border-l-[#1abc9c]",
};

export default function TodaySchedule({ servers, channels }: TodayScheduleProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTodaySchedules();
    // 每分钟刷新一次
    const interval = setInterval(loadTodaySchedules, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadTodaySchedules = async () => {
    if (!localStorage.getItem("token")) {
      setLoading(false);
      return;
    }
    try {
      const data = await scheduleApi.getTodaySchedules();
      setSchedules(data);
    } catch (err) {
      if (localStorage.getItem("token")) {
        console.error("Failed to load today's schedules:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeStr: string) => {
    return timeStr.substring(0, 5);
  };

  const getServerName = (serverId: number | null) => {
    if (!serverId) return null;
    return servers.find((s) => s.id === serverId)?.name;
  };

  const getChannelName = (channelId: number | null) => {
    if (!channelId) return null;
    return channels.find((c) => c.id === channelId)?.name;
  };

  // 检查日程是否即将到来（15分钟内）
  const isUpcoming = (schedule: Schedule) => {
    const now = new Date();
    const [hours, minutes] = schedule.start_time.split(":").map(Number);
    const scheduleTime = new Date();
    scheduleTime.setHours(hours, minutes, 0);
    const diffMinutes = (scheduleTime.getTime() - now.getTime()) / 1000 / 60;
    return diffMinutes > 0 && diffMinutes <= schedule.reminder_minutes;
  };

  // 检查日程是否正在进行
  const isOngoing = (schedule: Schedule) => {
    const now = new Date();
    const [startHours, startMinutes] = schedule.start_time.split(":").map(Number);
    const startTime = new Date();
    startTime.setHours(startHours, startMinutes, 0);

    if (schedule.end_time) {
      const [endHours, endMinutes] = schedule.end_time.split(":").map(Number);
      const endTime = new Date();
      endTime.setHours(endHours, endMinutes, 0);
      return now >= startTime && now <= endTime;
    }

    return now >= startTime && now.getTime() - startTime.getTime() < 60 * 60 * 1000; // 默认1小时
  };

  const today = new Date();
  const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  return (
    <div className="bg-[#2b2d31] rounded-lg overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-[#1e1f22]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">今日日程</h3>
          <span className="text-xs text-[#949ba4]">
            {today.getMonth() + 1}月{today.getDate()}日 {weekdayNames[today.getDay()]}
          </span>
        </div>
      </div>

      {/* 日程列表 */}
      <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
        {loading ? (
          <div className="text-center py-4 text-[#949ba4] text-sm">加载中...</div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-4 text-[#949ba4] text-sm">
            今日暂无日程
          </div>
        ) : (
          schedules.map((schedule) => {
            const upcoming = isUpcoming(schedule);
            const ongoing = isOngoing(schedule);
            const serverName = getServerName(schedule.server_id);
            const channelName = getChannelName(schedule.channel_id);

            return (
              <div
                key={schedule.id}
                className={`p-2 bg-[#383a40] rounded border-l-4 ${
                  COLORS[schedule.color] || "border-l-[#5865f2]"
                } ${upcoming ? "ring-1 ring-[#f39c12]" : ""} ${
                  ongoing ? "bg-[#3ba55d]/20" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {schedule.title}
                      {ongoing && (
                        <span className="ml-2 text-xs text-[#3ba55d]">进行中</span>
                      )}
                      {upcoming && (
                        <span className="ml-2 text-xs text-[#f39c12]">即将开始</span>
                      )}
                    </div>
                    {schedule.description && (
                      <div className="text-xs text-[#949ba4] truncate mt-0.5">
                        {schedule.description}
                      </div>
                    )}
                    {(serverName || channelName) && (
                      <div className="text-xs text-[#5865f2] mt-0.5">
                        {serverName && <span>@{serverName}</span>}
                        {channelName && <span className="ml-1">#{channelName}</span>}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-[#949ba4] whitespace-nowrap ml-2">
                    {schedule.is_all_day ? (
                      "全天"
                    ) : (
                      <>
                        {formatTime(schedule.start_time)}
                        {schedule.end_time && (
                          <span className="text-[#6d6f78]">
                            -{formatTime(schedule.end_time)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
