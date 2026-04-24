import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import HomeSidebar from "../home/HomeSidebar";
import { useServerStore } from "../../stores";

export default function AppLayout() {
  const { fetchServers } = useServerStore();
  const location = useLocation();
  const [homeTab, setHomeTab] = useState<"overview" | "console" | "import">("overview");

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const isHomePage = location.pathname === "/";
  const noChannelListPaths = ["/calendar", "/plugins"];
  const showChannelList = !isHomePage && !noChannelListPaths.some(path => location.pathname.startsWith(path));

  return (
    <div className="flex h-screen w-full select-none overflow-hidden relative font-sans text-[#dbdee1]">
      <Sidebar />
      {isHomePage && <HomeSidebar activeTab={homeTab} onTabChange={setHomeTab} />}
      {showChannelList && <ChannelList />}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-[#313338]">
        <Outlet context={{ homeTab }} />
      </main>
    </div>
  );
}
