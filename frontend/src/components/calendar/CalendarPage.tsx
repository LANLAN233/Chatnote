import React, { useState, useEffect } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import WeekView from "./WeekView";
import MonthView from "./MonthView";
import ScheduleModal from "./ScheduleModal";
import TodaySchedule from "./TodaySchedule";
import type { Schedule, Server, Channel } from "../../types";
import { scheduleApi } from "../../services/scheduleApi";
import { serverApi, channelApi } from "../../services";

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
    if (!localStorage.getItem("token")) return;
    try {
      const response = await serverApi.list();
      const serversData = response.data.data || [];
      setServers(serversData);

      const allChannels: Channel[] = [];
      for (const server of serversData) {
        const channelResponse = await channelApi.list(server.id);
        const serverChannels = channelResponse.data.data || [];
        allChannels.push(...serverChannels);
      }
      setChannels(allChannels);
    } catch (err) {
      if (localStorage.getItem("token")) {
        console.error("Failed to load servers:", err);
      }
    }
  };

  const loadSchedules = async () => {
    if (!localStorage.getItem("token")) return;
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
      if (localStorage.getItem("token")) {
        console.error("Failed to load schedules:", err);
      }
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
    <div className="flex-1 bg-[#313338] flex flex-col h-full overflow-hidden">
      <header className="h-12 border-b border-[#1e1f22] px-4 flex items-center shadow-sm bg-[#313338] flex-shrink-0">
        <h2 className="font-bold text-white flex items-center gap-2 text-[15px]">
          <CalendarIcon size={20} className="text-[#23a559]" /> Study Schedule
        </h2>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {/* View toggle */}
        <div className="flex items-center justify-between mb-4">
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

        {/* Calendar view */}
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
      </main>

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
