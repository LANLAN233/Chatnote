import api from "./api";
import type { Schedule, ScheduleCreate, ScheduleUpdate, ScheduleParseRequest, ScheduleParseResponse } from "../types";

export const scheduleApi = {
  getSchedules: (params?: { start_date?: string; end_date?: string; server_id?: number }) =>
    api.get<Schedule[]>("/schedules", { params }).then((res) => res.data),

  getSchedule: (id: number) =>
    api.get<Schedule>(`/schedules/${id}`).then((res) => res.data),

  createSchedule: (data: ScheduleCreate) =>
    api.post<Schedule>("/schedules", data).then((res) => res.data),

  updateSchedule: (id: number, data: ScheduleUpdate) =>
    api.put<Schedule>(`/schedules/${id}`, data).then((res) => res.data),

  deleteSchedule: (id: number) =>
    api.delete(`/schedules/${id}`),

  getTodaySchedules: () =>
    api.get<Schedule[]>("/schedules/today").then((res) => res.data),

  getUpcomingSchedules: (days: number = 7) =>
    api.get<Schedule[]>("/schedules/upcoming", { params: { days } }).then((res) => res.data),

  parseSchedule: (text: string) =>
    api.post<ScheduleParseResponse>("/schedules/parse", { text }).then((res) => res.data),
};
