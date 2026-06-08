import { useEffect, useState, useCallback } from "react";
import { Outlet, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { Menu, ArrowLeft, Server } from "lucide-react";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import HomeSidebar from "../home/HomeSidebar";
import ThreadPanel from "../thread/ThreadPanel";
import { useServerStore } from "../../stores";
import { statsApi } from "../../services";
import { useIsMobile } from "../../hooks/useIsMobile";

export default function AppLayout() {
  const { servers, currentServerId, setCurrentServer, fetchServers } = useServerStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [homeTab, setHomeTab] = useState<"overview" | "console" | "import" | "inbox" | "recent" | "daily-summary">("overview");
  const [inboxBadge, setInboxBadge] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [serverDrawerOpen, setServerDrawerOpen] = useState(false);
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
    } else if (location.pathname === "/" && !tab) {
      // Reset to overview when navigating to home without tab param
      setHomeTab("overview");
    }
  }, [searchParams, location.pathname]);

  const isHomePage = location.pathname === "/";
  const noChannelListPaths = ["/calendar", "/plugins"];
  const showChannelList = !isHomePage && !noChannelListPaths.some(path => location.pathname.startsWith(path));

  const handleServerSelect = (serverId: number) => {
    setCurrentServer(serverId);
    const server = servers.find((s) => s.id === serverId);
    if (server?.primary_channel_id) {
      navigate(`/server/${serverId}/channel/${server.primary_channel_id}`);
    } else {
      navigate(`/server/${serverId}`);
    }
    setServerDrawerOpen(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden relative font-sans text-[#dbdee1]">
      <Sidebar isMobile={isMobile} onServerSelect={() => setServerDrawerOpen(true)} />
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

      {/* Server selection drawer (mobile only) */}
      {isMobile && (
        <>
          {serverDrawerOpen && (
            <div
              className="fixed inset-0 bg-black/30 z-30 transition-opacity duration-300"
              onClick={() => setServerDrawerOpen(false)}
            />
          )}
          <div
            className={`fixed left-0 top-0 h-full w-[280px] bg-[#2b2d31] border-r border-[#1e1f22] flex flex-col z-40 transform transition-transform duration-300 ease-in-out ${
              serverDrawerOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="h-12 px-4 flex items-center justify-between border-b border-[#1e1f22] flex-shrink-0">
              <h2 className="text-white font-bold text-sm">选择服务器</h2>
              <button
                onClick={() => setServerDrawerOpen(false)}
                className="text-[#949ba4] hover:text-white transition-colors"
                title="Close"
              >
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {servers.map((server) => (
                <button
                  key={server.id}
                  onClick={() => handleServerSelect(server.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                    currentServerId === server.id
                      ? "bg-[#5865f2]/20 text-white"
                      : "text-[#949ba4] hover:bg-[#35373c] hover:text-gray-200"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-[#5865f2] flex items-center justify-center text-white font-bold shrink-0">
                    {server.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{server.name}</div>
                    {server.description && (
                      <div className="text-xs text-[#949ba4] truncate">{server.description}</div>
                    )}
                  </div>
                </button>
              ))}
              {servers.length === 0 && (
                <div className="text-center text-[#949ba4] text-sm py-8">
                  还没有服务器
                </div>
              )}
            </div>
          </div>
        </>
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
