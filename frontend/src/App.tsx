import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "./stores";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import AppLayout from "./components/layout/AppLayout";
import HomePage from "./components/home/HomePage";
import NoteList from "./components/notes/NoteList";
import ConsoleView from "./components/console/ConsoleView";
import CalendarPage from "./components/calendar/CalendarPage";
import PluginManagerPage from "./components/plugins/PluginManagerPage";
import { useNotification } from "./hooks/useNotification";
import { WebSocketProvider } from "./components/common/WebSocketProvider";

function AuthenticatedRoutes() {
  return (
    <WebSocketProvider>
      <AppLayout />
    </WebSocketProvider>
  );
}

function App() {
  const { isAuthenticated, fetchMe } = useAuthStore();
  useNotification(isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      fetchMe();
    }
  }, [isAuthenticated, fetchMe]);

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />} />
      <Route path="/register" element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/" />} />
      <Route
        path="/*"
        element={isAuthenticated ? <AuthenticatedRoutes /> : <Navigate to="/login" />}
      >
        <Route index element={<HomePage />} />
        <Route path="console" element={<ConsoleView />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="plugins" element={<PluginManagerPage />} />
        <Route path="server/:serverId" element={<HomePage />} />
        <Route path="server/:serverId/channel/:channelId" element={<NoteList />} />
      </Route>
    </Routes>
  );
}

export default App;
