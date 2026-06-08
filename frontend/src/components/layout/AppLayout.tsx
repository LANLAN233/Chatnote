import { useEffect, useState, useCallback } from "react";
import { Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import HomeSidebar from "../home/HomeSidebar";
import ThreadPanel from "../thread/ThreadPanel";
import { useServerStore } from "../../stores";
import { statsApi } from "../../services";
import { useIsMobile } from "../../hooks/useIsMobile";

export default function AppLayout() {
  const { fetchServers } = useServerStore();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [homeTab, setHomeTab] = useState<"overview" | "console" | "import" | "inbox" | "recent" | "daily-summary">("overview");
  const [inboxBadge, setInboxBadge] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

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

  // Sync tab param from URL to homeTab state
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "console" || tab === "import" || tab === "inbox" || tab === "recent" || tab === "overview" || tab === "daily-summary") {
      setHomeTab(tab);
    }
  }, [searchParams]);

  const isHomePage = location.pathname === "/";
  const noChannelListPaths = ["/calendar", "/plugins"];
  const showChannelList = !isHomePage && !noChannelListPaths.some(path => location.pathname.startsWith(path));

  return (
    <div className="flex h-screen w-full overflow-hidden relative font-sans text-[#dbdee1]">
      <Sidebar isMobile={isMobile} />
      {isHomePage && (
        <HomeSidebar
          activeTab={homeTab}
          onTabChange={setHomeTab}
          inboxBadge={inboxBadge}
          isOpen={isMobile ? mobileMenuOpen : undefined}
          onClose={isMobile ? () => setMobileMenuOpen(false) : undefined}
        />
      )}
      {showChannelList && (
        <ChannelList
          isOpen={isMobile ? mobileMenuOpen : undefined}
          onClose={isMobile ? () => setMobileMenuOpen(false) : undefined}
        />
      )}
      <main className={`flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-[#313338] ${isMobile ? "relative pb-16" : ""}`}>
        {isMobile && (
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="absolute top-3 left-3 z-20 p-2 rounded-lg bg-[#2b2d31] text-[#dbdee1] hover:bg-[#35373c] transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <Outlet context={{ homeTab, setHomeTab }} />
      </main>
      <ThreadPanel />
    </div>
  );
}
