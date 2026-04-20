import React from "react";
import type { Schedule } from "../../types";

interface MonthViewProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  schedules: Schedule[];
  onDayClick: (date: Date) => void;
  onScheduleClick: (schedule: Schedule) => void;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const COLORS: Record<string, string> = {
  "#5865f2": "bg-[#5865f2]",
  "#eb459e": "bg-[#eb459e]",
  "#3ba55d": "bg-[#3ba55d]",
  "#f39c12": "bg-[#f39c12]",
  "#e74c3c": "bg-[#e74c3c]",
  "#9b59b6": "bg-[#9b59b6]",
  "#1abc9c": "bg-[#1abc9c]",
};

export default function MonthView({
  currentDate,
  onDateChange,
  schedules,
  onDayClick,
  onScheduleClick,
}: MonthViewProps) {
  const today = new Date();

  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay(); // 0 = Sunday

    const days = [];

    // 上月填充
    for (let i = startPadding - 1; i >= 0; i--) {
      const prevDate = new Date(year, month, -i);
      days.push({ date: prevDate, isCurrentMonth: false });
    }

    // 当月
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // 下月填充（补满 6 行 42 天）
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return days;
  };

  const getSchedulesForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1;

    return schedules.filter((schedule) => {
      if (schedule.date === dateStr) return true;
      if (schedule.day_of_week === dayOfWeek && schedule.repeat_rule) return true;
      return false;
    });
  };

  const days = getMonthDays();

  return (
    <div className="flex flex-col h-full">
      {/* 头部导航 */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#2b2d31] border-b border-[#1e1f22]">
        <h2 className="text-lg font-semibold text-white">
          {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newDate = new Date(currentDate);
              newDate.setMonth(newDate.getMonth() - 1);
              onDateChange(newDate);
            }}
            className="px-3 py-1 text-sm bg-[#383a40] hover:bg-[#404249] text-white rounded transition-colors"
          >
            上一月
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
              newDate.setMonth(newDate.getMonth() + 1);
              onDateChange(newDate);
            }}
            className="px-3 py-1 text-sm bg-[#383a40] hover:bg-[#404249] text-white rounded transition-colors"
          >
            下一月
          </button>
        </div>
      </div>

      {/* 星期头部 */}
      <div className="grid grid-cols-7 border-b border-[#1e1f22]">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-sm text-[#949ba4] bg-[#2b2d31]"
          >
            周{day}
          </div>
        ))}
      </div>

      {/* 日历网格 */}
      <div className="grid grid-cols-7 flex-1">
        {days.map(({ date, isCurrentMonth }, index) => {
          const daySchedules = getSchedulesForDay(date);
          const isToday = date.toDateString() === today.toDateString();

          return (
            <div
              key={index}
              onClick={() => onDayClick(date)}
              className={`min-h-[80px] p-1 border-r border-b border-[#1e1f22] cursor-pointer hover:bg-[#2b2d31]/50 transition-colors ${
                isCurrentMonth ? "bg-[#313338]" : "bg-[#2b2d31]/50"
              } ${isToday ? "bg-[#5865f2]/10" : ""}`}
            >
              <div
                className={`text-sm mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday
                    ? "bg-[#5865f2] text-white font-semibold"
                    : isCurrentMonth
                    ? "text-[#dbdee1]"
                    : "text-[#949ba4]/50"
                }`}
              >
                {date.getDate()}
              </div>
              <div className="space-y-0.5">
                {daySchedules.slice(0, 3).map((schedule) => (
                  <div
                    key={schedule.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onScheduleClick(schedule);
                    }}
                    className={`px-1 py-0.5 rounded text-[10px] text-white truncate cursor-pointer hover:opacity-80 transition-opacity ${
                      COLORS[schedule.color] || "bg-[#5865f2]"
                    }`}
                    title={schedule.title}
                  >
                    {schedule.title}
                  </div>
                ))}
                {daySchedules.length > 3 && (
                  <div className="text-[10px] text-[#949ba4] pl-1">
                    +{daySchedules.length - 3} 更多
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
