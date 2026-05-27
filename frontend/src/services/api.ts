import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect to login if we're already on the login or register page —
      // 401 on /auth/login is normal (wrong credentials) and shouldn't trigger
      // a full page reload that destroys the error state.
      const requestUrl: string = error.config?.url ?? "";
      const isAuthEndpoint = requestUrl.includes("/auth/login") || requestUrl.includes("/auth/register");
      if (!isAuthEndpoint) {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export default api;