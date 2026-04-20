import React, { useState, useEffect } from "react";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import ScheduleModal from "./ScheduleModal";
import TodaySchedule from "./TodaySchedule";
import type { Schedule, Server, Channel } from "../../types";
import { scheduleApi } from "../../services/scheduleApi";
import { serverApi } from "../../services/serverApi";

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    loadServers();
    loadSchedules();
  }, [currentDate, viewMode]);

  const loadServers = async () => {
    try {
      const serversData = await serverApi.getServers();
      setServers(serversData);

      // 加载所有频道
      const allChannels: Channel[] = [];
      for (const server of serversData) {
        const serverChannels = await serverApi.getChannels(server.id);
        allChannels.push(...serverChannels);
      }
      setChannels(allChannels);
    } catch (err) {
      console.error("Failed to load servers:", err);
    }
  };

  const loadSchedules = async () => {
    try {
      let startDate: string;
      let endDate: string;

      if (viewMode === "week") {
        const { monday, sunday } = getWeekRange(currentDate);
        startDate = monday.toISOString().split("T")[0];
        endDate = sunday.toISOString().split("T")[0];
      } else {
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        startDate = firstDay.toISOString().split("T")[0];
        endDate = lastDay.toISOString().split("T")[0];
      }

      const data = await scheduleApi.getSchedules({ start_date: startDate, end_date: endDate });
      setSchedules(data);
    } catch (err) {
      console.error("Failed to load schedules:", err);
    }
  };

  const getWeekRange = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setSelectedSchedule(null);
    setIsModalOpen(true);
  };

  const handleScheduleClick = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setSelectedDate(null);
    setIsModalOpen(true);
  };

  return (
    <div className="flex h-full">
      {/* 主日历区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 视图切换 */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#2b2d31] border-b border-[#1e1f22]">
          <div className="flex bg-[#1e1f22] rounded p-1">
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                viewMode === "week"
                  ? "bg-[#383a40] text-white"
                  : "text-[#949ba4] hover:text-white"
              }`}
            >
              周视图
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                viewMode === "month"
                  ? "bg-[#383a40] text-white"
                  : "text-[#949ba4] hover:text-white"
              }`}
            >
              月视图
            </button>
          </div>

          <button
            onClick={() => {
              setSelectedDate(new Date());
              setSelectedSchedule(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-medium rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建日程
          </button>
        </div>

        {/* 日历视图 */}
        {viewMode === "week" ? (
          <WeekView
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            servers={servers}
            channels={channels}
          />
        ) : (
          <MonthView
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            schedules={schedules}
            onDayClick={handleDayClick}
            onScheduleClick={handleScheduleClick}
          />
        )}
      </div>

      {/* 右侧边栏 */}
      <div className="w-72 border-l border-[#1e1f22] bg-[#2b2d31] p-4 overflow-y-auto">
        <TodaySchedule servers={servers} channels={channels} />

        {/* 即将到来 */}
        <div className="mt-4 bg-[#2b2d31] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e1f22]">
            <h3 className="text-sm font-semibold text-white">即将到来</h3>
          </div>
          <div className="p-3">
            <UpcomingSchedules servers={servers} channels={channels} />
          </div>
        </div>
      </div>

      {/* 日程弹窗 */}
      <ScheduleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        schedule={selectedSchedule}
        initialDate={selectedDate}
        servers={servers}
        channels={channels}
        onSuccess={loadSchedules}
      />
    </div>
  );
}

// 即将到来日程组件
function UpcomingSchedules({ servers, channels }: { servers: Server[]; channels: Channel[] }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    loadUpcoming();
  }, []);

  const loadUpcoming = async () => {
    try {
      const data = await scheduleApi.getUpcomingSchedules(7);
      setSchedules(data.slice(0, 5)); // 只显示前5个
    } catch (err) {
      console.error("Failed to load upcoming schedules:", err);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "今天";
    if (date.toDateString() === tomorrow.toDateString()) return "明天";
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (schedules.length === 0) {
    return <div className="text-sm text-[#949ba4]">暂无即将开始的日程</div>;
  }

  return (
    <div className="space-y-2">
      {schedules.map((schedule) => {
        const serverName = servers.find((s) => s.id === schedule.server_id)?.name;

        return (
          <div key={schedule.id} className="text-sm">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: schedule.color }}
              />
              <span className="text-white truncate flex-1">{schedule.title}</span>
            </div>
            <div className="text-xs text-[#949ba4] ml-4 mt-0.5">
              {formatDate(schedule.date)} {schedule.start_time.substring(0, 5)}
              {serverName && <span className="ml-1 text-[#5865f2]">@{serverName}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
