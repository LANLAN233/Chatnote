import React, { useState, useEffect } from "react";
import type { Schedule, ScheduleCreate, Server, Channel } from "../../types";
import { scheduleApi } from "../../services/scheduleApi";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: Schedule | null;
  initialDate: Date | null;
  servers: Server[];
  channels: Channel[];
  onSuccess: () => void;
}

const COLORS = [
  { value: "#5865f2", label: "蓝色" },
  { value: "#eb459e", label: "粉色" },
  { value: "#3ba55d", label: "绿色" },
  { value: "#f39c12", label: "橙色" },
  { value: "#e74c3c", label: "红色" },
  { value: "#9b59b6", label: "紫色" },
  { value: "#1abc9c", label: "青色" },
];

const WEEKDAYS = [
  { value: 0, label: "周一" },
  { value: 1, label: "周二" },
  { value: 2, label: "周三" },
  { value: 3, label: "周四" },
  { value: 4, label: "周五" },
  { value: 5, label: "周六" },
  { value: 6, label: "周日" },
];

export default function ScheduleModal({
  isOpen,
  onClose,
  schedule,
  initialDate,
  servers,
  channels,
  onSuccess,
}: ScheduleModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [date, setDate] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<number | "">("");
  const [repeatType, setRepeatType] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [isAllDay, setIsAllDay] = useState(false);
  const [color, setColor] = useState("#5865f2");
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [serverId, setServerId] = useState<number | "">("");
  const [channelId, setChannelId] = useState<number | "">("");
  const [naturalLanguageInput, setNaturalLanguageInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!schedule;

  // 获取选中伺服器的频道
  const availableChannels = channels.filter((c) => c.server_id === Number(serverId));

  useEffect(() => {
    if (isOpen) {
      if (schedule) {
        // 编辑模式
        setTitle(schedule.title);
        setDescription(schedule.description || "");
        setStartTime(schedule.start_time.substring(0, 5));
        setEndTime(schedule.end_time ? schedule.end_time.substring(0, 5) : "");
        setDate(schedule.date || "");
        setDayOfWeek(schedule.day_of_week ?? "");
        setIsAllDay(schedule.is_all_day);
        setColor(schedule.color);
        setReminderMinutes(schedule.reminder_minutes);
        setServerId(schedule.server_id || "");
        setChannelId(schedule.channel_id || "");

        if (schedule.repeat_rule) {
          try {
            const rule = JSON.parse(schedule.repeat_rule);
            setRepeatType(rule.type || "none");
          } catch {
            setRepeatType("none");
          }
        } else {
          setRepeatType("none");
        }
      } else {
        // 创建模式
        resetForm();
        if (initialDate) {
          setDate(initialDate.toISOString().split("T")[0]);
        } else {
          setDate(new Date().toISOString().split("T")[0]);
        }
      }
      setError("");
    }
  }, [isOpen, schedule, initialDate]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setStartTime("09:00");
    setEndTime("10:00");
    setDate("");
    setDayOfWeek("");
    setRepeatType("none");
    setIsAllDay(false);
    setColor("#5865f2");
    setReminderMinutes(15);
    setServerId("");
    setChannelId("");
    setNaturalLanguageInput("");
  };

  const handleParseNaturalLanguage = async () => {
    if (!naturalLanguageInput.trim()) return;

    setIsParsing(true);
    setError("");

    try {
      const result = await scheduleApi.parseSchedule(naturalLanguageInput);

      if (result.title) setTitle(result.title);
      if (result.description) setDescription(result.description);
      if (result.start_time) {
        const timeStr = result.start_time;
        setStartTime(timeStr.length > 5 ? timeStr.substring(0, 5) : timeStr);
      }
      if (result.end_time) {
        const timeStr = result.end_time;
        setEndTime(timeStr.length > 5 ? timeStr.substring(0, 5) : timeStr);
      }
      if (result.date) setDate(result.date);
      if (result.day_of_week !== null) setDayOfWeek(result.day_of_week);
      if (result.repeat_rule) setRepeatType(result.repeat_rule.type);
      if (result.is_all_day !== undefined) setIsAllDay(result.is_all_day);
    } catch (err) {
      setError("解析失败，请手动填写");
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("请输入日程标题");
      return;
    }

    if (!isAllDay && !startTime) {
      setError("请选择开始时间");
      return;
    }

    const repeatRule = repeatType !== "none" ? JSON.stringify({ type: repeatType }) : null;

    const data: ScheduleCreate = {
      title: title.trim(),
      description: description.trim() || undefined,
      start_time: isAllDay ? "00:00:00" : `${startTime}:00`,
      end_time: endTime ? `${endTime}:00` : undefined,
      date: date || undefined,
      day_of_week: dayOfWeek !== "" ? Number(dayOfWeek) : undefined,
      repeat_rule: repeatRule || undefined,
      is_all_day: isAllDay,
      color,
      reminder_minutes: reminderMinutes,
      server_id: serverId !== "" ? Number(serverId) : undefined,
      channel_id: channelId !== "" ? Number(channelId) : undefined,
    };

    try {
      if (isEditing && schedule) {
        await scheduleApi.updateSchedule(schedule.id, data);
      } else {
        await scheduleApi.createSchedule(data);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError("保存失败，请重试");
    }
  };

  const handleDelete = async () => {
    if (!schedule) return;

    if (!confirm("确定要删除这个日程吗？")) return;

    try {
      await scheduleApi.deleteSchedule(schedule.id);
      onSuccess();
      onClose();
    } catch (err) {
      setError("删除失败");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-[#313338] rounded-lg shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#2b2d31] border-b border-[#1e1f22]">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? "编辑日程" : "创建日程"}
          </h2>
          <button
            onClick={onClose}
            className="text-[#949ba4] hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 自然语言输入 */}
        {!isEditing && (
          <div className="px-4 py-3 border-b border-[#1e1f22]">
            <label className="block text-sm font-medium text-[#b5bac1] mb-2">
              快速创建（自然语言）
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={naturalLanguageInput}
                onChange={(e) => setNaturalLanguageInput(e.target.value)}
                placeholder="例如：明天下午2点高数课"
                className="flex-1 px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white placeholder-[#949ba4] focus:outline-none focus:border-[#5865f2]"
              />
              <button
                type="button"
                onClick={handleParseNaturalLanguage}
                disabled={isParsing || !naturalLanguageInput.trim()}
                className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
              >
                {isParsing ? "解析中..." : "解析"}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* 标题 */}
          <div>
            <label className="block text-sm font-medium text-[#b5bac1] mb-1">
              标题 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="日程标题"
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white placeholder-[#949ba4] focus:outline-none focus:border-[#5865f2]"
              required
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-[#b5bac1] mb-1">
              描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="日程描述（可选）"
              rows={2}
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white placeholder-[#949ba4] focus:outline-none focus:border-[#5865f2] resize-none"
            />
          </div>

          {/* 日期和时间 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#b5bac1] mb-1">
                日期
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white focus:outline-none focus:border-[#5865f2]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#b5bac1] mb-1">
                星期（重复日程）
              </label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white focus:outline-none focus:border-[#5865f2]"
              >
                <option value="">单次</option>
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 时间选择 */}
          {!isAllDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#b5bac1] mb-1">
                  开始时间
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white focus:outline-none focus:border-[#5865f2]"
                  required={!isAllDay}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#b5bac1] mb-1">
                  结束时间
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white focus:outline-none focus:border-[#5865f2]"
                />
              </div>
            </div>
          )}

          {/* 选项 */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAllDay}
                onChange={(e) => setIsAllDay(e.target.checked)}
                className="w-4 h-4 rounded border-[#949ba4] text-[#5865f2] focus:ring-[#5865f2] bg-[#1e1f22]"
              />
              <span className="text-sm text-[#dbdee1]">全天</span>
            </label>
          </div>

          {/* 重复规则 */}
          <div>
            <label className="block text-sm font-medium text-[#b5bac1] mb-1">
              重复
            </label>
            <select
              value={repeatType}
              onChange={(e) => setRepeatType(e.target.value as typeof repeatType)}
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white focus:outline-none focus:border-[#5865f2]"
            >
              <option value="none">不重复</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </div>

          {/* 颜色 */}
          <div>
            <label className="block text-sm font-medium text-[#b5bac1] mb-2">
              颜色标记
            </label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                    color === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-[#313338]" : ""
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* 关联伺服器和频道 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#b5bac1] mb-1">
                关联伺服器
              </label>
              <select
                value={serverId}
                onChange={(e) => {
                  setServerId(e.target.value === "" ? "" : Number(e.target.value));
                  setChannelId("");
                }}
                className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white focus:outline-none focus:border-[#5865f2]"
              >
                <option value="">无</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#b5bac1] mb-1">
                关联频道
              </label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={!serverId}
                className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white focus:outline-none focus:border-[#5865f2] disabled:opacity-50"
              >
                <option value="">无</option>
                {availableChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 提醒 */}
          <div>
            <label className="block text-sm font-medium text-[#b5bac1] mb-1">
              提前提醒
            </label>
            <select
              value={reminderMinutes}
              onChange={(e) => setReminderMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#1e1f22] rounded text-white focus:outline-none focus:border-[#5865f2]"
            >
              <option value={0}>不提醒</option>
              <option value={5}>5分钟前</option>
              <option value={10}>10分钟前</option>
              <option value={15}>15分钟前</option>
              <option value={30}>30分钟前</option>
              <option value={60}>1小时前</option>
              <option value={1440}>1天前</option>
            </select>
          </div>

          {/* 按钮 */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1e1f22]">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
              >
                删除
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[#dbdee1] hover:text-white hover:bg-[#383a40] rounded transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium rounded transition-colors"
              >
                {isEditing ? "保存" : "创建"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
