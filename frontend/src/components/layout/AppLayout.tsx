import { useEffect, useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import HomeSidebar from "../home/HomeSidebar";
import { useServerStore } from "../../stores";
import { statsApi } from "../../services";

export default function AppLayout() {
  const { fetchServers } = useServerStore();
  const location = useLocation();
  const [homeTab, setHomeTab] = useState<"overview" | "console" | "import" | "inbox" | "recent">("overview");
  const [inboxBadge, setInboxBadge] = useState(0);

  const loadBadge = useCallback(async () => {
    if (!localStorage.getItem("token")) return;
    try {
      const { data } = await statsApi.get();
      if (data.data) {
        setInboxBadge((data.data as { inbox_pending_count?: number }).inbox_pending_count || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    loadBadge();
    const id = setInterval(loadBadge, 30000);
    return () => clearInterval(id);
  }, [loadBadge]);

  const isHomePage = location.pathname === "/";
  const noChannelListPaths = ["/calendar", "/plugins"];
  const showChannelList = !isHomePage && !noChannelListPaths.some(path => location.pathname.startsWith(path));

  return (
    <div className="flex h-screen w-full overflow-hidden relative font-sans text-[#dbdee1]">
      <Sidebar />
      {isHomePage && <HomeSidebar activeTab={homeTab} onTabChange={setHomeTab} inboxBadge={inboxBadge} />}
      {showChannelList && <ChannelList />}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-[#313338]">
        <Outlet context={{ homeTab, setHomeTab }} />
      </main>
    </div>
  );
}
