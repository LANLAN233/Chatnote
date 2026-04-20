import React, { useState, useEffect } from "react";
import type { Schedule, Server, Channel } from "../../types";
import { scheduleApi } from "../../services/scheduleApi";
import ScheduleModal from "./ScheduleModal";

interface WeekViewProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  servers: Server[];
  channels: Channel[];
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const COLORS: Record<string, string> = {
  "#5865f2": "bg-[#5865f2]",
  "#eb459e": "bg-[#eb459e]",
  "#3ba55d": "bg-[#3ba55d]",
  "#f39c12": "bg-[#f39c12]",
  "#e74c3c": "bg-[#e74c3c]",
  "#9b59b6": "bg-[#9b59b6]",
  "#1abc9c": "bg-[#1abc9c]",
};

export default function WeekView({
  currentDate,
  onDateChange,
  servers,
  channels,
}: WeekViewProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // 获取当前周的开始（周一）和结束（周日）
  const getWeekRange = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 调整为周一开始
    const monday = new Date(date.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  };

  const { monday, sunday } = getWeekRange(new Date(currentDate));

  useEffect(() => {
    loadSchedules();
  }, [currentDate]);

  const loadSchedules = async () => {
    try {
      const startDate = monday.toISOString().split("T")[0];
      const endDate = sunday.toISOString().split("T")[0];
      const data = await scheduleApi.getSchedules({ start_date: startDate, end_date: endDate });
      setSchedules(data);
    } catch (err) {
      console.error("Failed to load schedules:", err);
    }
  };

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getSchedulesForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1; // 转换为 0=周一

    return schedules.filter((schedule) => {
      // 单次日程
      if (schedule.date === dateStr) return true;
      // 重复日程检查星期几
      if (schedule.day_of_week === dayOfWeek && schedule.repeat_rule) return true;
      return false;
    });
  };

  const formatTime = (timeStr: string) => {
    return timeStr.substring(0, 5);
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setSelectedSchedule(null);
    setIsModalOpen(true);
  };

  const handleScheduleClick = (e: React.MouseEvent, schedule: Schedule) => {
    e.stopPropagation();
    setSelectedSchedule(schedule);
    setSelectedDate(null);
    setIsModalOpen(true);
  };

  const weekDays = getWeekDays();
  const today = new Date();

  return (
    <div className="flex flex-col h-full">
      {/* 头部导航 */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#2b2d31] border-b border-[#1e1f22]">
        <h2 className="text-lg font-semibold text-white">
          {monday.getFullYear()}年{monday.getMonth() + 1}月
          （第 {getWeekNumber(currentDate)} 周）
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newDate = new Date(currentDate);
              newDate.setDate(newDate.getDate() - 7);
              onDateChange(newDate);
            }}
            className="px-3 py-1 text-sm bg-[#383a40] hover:bg-[#404249] text-white rounded transition-colors"
          >
            上一周
          </button>
          <button
            onClick={() => onDateChange(new Date())}
            className="px-3 py-1 text-sm bg-[#5865f2] hover:bg-[#4752c4] text-white rounded transition-colors"
          >
            今天
          </button>
          <button
            onClick={() => {
              const newDate = new Date(currentDate);
              newDate.setDate(newDate.getDate() + 7);
              onDateChange(newDate);
            }}
            className="px-3 py-1 text-sm bg-[#383a40] hover:bg-[#404249] text-white rounded transition-colors"
          >
            下一周
          </button>
        </div>
      </div>

      {/* 星期头部 */}
      <div className="grid grid-cols-7 border-b border-[#1e1f22]">
        {WEEKDAYS.map((day, index) => {
          const date = weekDays[index];
          const isToday = date.toDateString() === today.toDateString();
          return (
            <div
              key={day}
              className={`px-4 py-2 text-center border-r border-[#1e1f22] last:border-r-0 ${
                isToday ? "bg-[#5865f2]/20" : "bg-[#2b2d31]"
              }`}
            >
              <div className={`text-sm ${isToday ? "text-[#5865f2] font-semibold" : "text-[#949ba4]"}`}>
                {day}
              </div>
              <div className={`text-lg ${isToday ? "text-white font-bold" : "text-[#dbdee1]"}`}>
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* 日程网格 */}
      <div className="grid grid-cols-7 flex-1 overflow-y-auto">
        {weekDays.map((date, index) => {
          const daySchedules = getSchedulesForDay(date);
          const isToday = date.toDateString() === today.toDateString();

          return (
            <div
              key={index}
              onClick={() => handleDayClick(date)}
              className={`min-h-[200px] p-2 border-r border-b border-[#1e1f22] last:border-r-0 cursor-pointer hover:bg-[#2b2d31]/50 transition-colors ${
                isToday ? "bg-[#5865f2]/10" : ""
              }`}
            >
              <div className="space-y-1">
                {daySchedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    onClick={(e) => handleScheduleClick(e, schedule)}
                    className={`px-2 py-1 rounded text-xs text-white truncate cursor-pointer hover:opacity-80 transition-opacity ${
                      COLORS[schedule.color] || "bg-[#5865f2]"
                    }`}
                    title={schedule.title}
                  >
                    <div className="font-medium truncate">{schedule.title}</div>
                    {!schedule.is_all_day && (
                      <div className="opacity-80">{formatTime(schedule.start_time)}</div>
                    )}
                    {schedule.is_all_day && <div className="opacity-80">全天</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
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

// 获取当前是第几周
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((+d - +yearStart) / 86400000 + 1) / 7);
}
