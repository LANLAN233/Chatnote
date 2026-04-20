import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import { useServerStore } from "../../stores";
import SearchModal from "../search/SearchModal";

export default function AppLayout() {
  const { fetchServers } = useServerStore();
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden select-none">
      <Sidebar />
      <ChannelList />
      <main className="flex-1 flex flex-col bg-[var(--bg-primary)] overflow-hidden">
        <Outlet />
      </main>
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
    </div>
  );
}
