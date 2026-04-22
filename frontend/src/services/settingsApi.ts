import api from "./api";
import type { ApiResponse, User, UserSettingsUpdate } from "../types";

export const settingsApi = {
  get: () => api.get<ApiResponse<User>>("/settings/me"),
  update: (data: UserSettingsUpdate) =>
    api.put<ApiResponse<User>>("/settings/me", data),
};
