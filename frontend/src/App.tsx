import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "./stores";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import AppLayout from "./components/layout/AppLayout";
import HomePage from "./components/home/HomePage";
import NoteList from "./components/notes/NoteList";
import ConsoleView from "./components/console/ConsoleView";

function App() {
  const { isAuthenticated, fetchMe } = useAuthStore();

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
        element={isAuthenticated ? <AppLayout /> : <Navigate to="/login" />}
      >
        <Route index element={<HomePage />} />
        <Route path="console" element={<ConsoleView />} />
        <Route path="server/:serverId" element={<HomePage />} />
        <Route path="server/:serverId/channel/:channelId" element={<NoteList />} />
      </Route>
    </Routes>
  );
}

export default App;
