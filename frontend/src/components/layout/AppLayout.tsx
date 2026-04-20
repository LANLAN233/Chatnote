import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import { useServerStore } from "../../stores";

export default function AppLayout() {
  const { fetchServers } = useServerStore();

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return (
    <div className="flex h-screen w-screen overflow-hidden select-none">
      <Sidebar />
      <ChannelList />
      <main className="flex-1 flex flex-col bg-[var(--bg-primary)] overflow-hidden min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
