import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import { useServerStore } from "../../stores";

export default function AppLayout() {
  const { fetchServers } = useServerStore();
  const location = useLocation();

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const noChannelListPaths = ["/calendar", "/plugins"];
  const showChannelList = !noChannelListPaths.some(path => location.pathname.startsWith(path));

  return (
    <div className="flex h-screen w-full select-none overflow-hidden relative font-sans text-[#dbdee1]">
      <Sidebar />
      {showChannelList && <ChannelList />}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-[#313338]">
        <Outlet />
      </main>
    </div>
  );
}
