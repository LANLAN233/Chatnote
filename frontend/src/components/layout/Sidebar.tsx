import { useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Home, Terminal, Calendar, Puzzle, Plus, Settings } from "lucide-react";
import { useServerStore, useAuthStore } from "../../stores";
import ServerModal from "../servers/ServerModal";
import SettingsModal from "../settings/SettingsModal";

export default function Sidebar() {
  const { servers, currentServerId, setCurrentServer, deleteServer } = useServerStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<{ id: number; name: string; description?: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const currentPath = location.pathname;

  const navItems = [
    { id: "console", Icon: Terminal, tooltip: "Console", path: "/?tab=console", match: /^\/console/ },
    { id: "calendar", Icon: Calendar, tooltip: "Schedule", path: "/calendar", match: /^\/calendar/ },
    { id: "plugins", Icon: Puzzle, tooltip: "Plugins & Bots", path: "/plugins", match: /^\/plugins/ },
  ];

  const isHomeActive = currentPath === "/" || currentPath.startsWith("/server/") || searchParams.get("tab") === "console";

  const handleContextMenu = (e: React.MouseEvent, serverId: number) => {
    e.preventDefault();
    setContextMenu({ id: serverId, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 gap-2 flex-shrink-0 select-none">
      {/* Home button */}
      <div
        onClick={() => navigate("/")}
        className={`w-12 h-12 flex items-center justify-center mb-1 cursor-pointer transition-all duration-200 group relative
          ${isHomeActive
            ? "bg-[#5865F2] rounded-xl text-white"
            : "bg-[#313338] rounded-2xl text-[#dbdee1] hover:rounded-xl hover:bg-[#5865F2] hover:text-white"
          }`}
      >
        <Home className="w-6 h-6" />
        <div className={`absolute -left-3 w-2 bg-white rounded-r-lg transition-all duration-200
          ${isHomeActive ? "h-10 opacity-100" : "h-5 opacity-0 group-hover:opacity-100"}`}
        />
      </div>

      <div className="w-8 h-[2px] bg-[#35363c] rounded-full mb-1" />

      <div className="flex-1 overflow-y-auto scrollbar-hide w-full flex flex-col items-center gap-2 min-h-0">
      {/* Server list */}
      {servers.map((server) => {
        const isActive = currentServerId === server.id && isHomeActive;
        return (
          <div key={server.id} className="group relative flex items-center">
            <div
              className={`absolute -left-3 w-2 bg-white rounded-r-lg transition-all duration-200
                ${isActive ? "h-10 opacity-100" : "h-5 opacity-0 group-hover:opacity-100"}`}
            />
            <div
              className={`w-12 h-12 flex items-center justify-center cursor-pointer text-white font-bold transition-all duration-200 text-sm
                ${isActive
                  ? "rounded-xl bg-[#5865F2] text-white"
                  : "rounded-3xl bg-[#313338] hover:rounded-xl hover:bg-[#5865F2] hover:text-white"
                }`}
              onClick={() => {
                setCurrentServer(server.id);
                if (server.primary_channel_id) {
                  navigate(`/server/${server.id}/channel/${server.primary_channel_id}`);
                } else {
                  navigate(`/server/${server.id}`);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, server.id)}
              title={server.name}
            >
              {server.name.charAt(0).toUpperCase()}
            </div>
          </div>
        );
      })}

      {/* Add server */}
      <div className="group relative flex items-center">
        <div className="absolute -left-3 w-2 bg-white rounded-r-lg transition-all duration-200 h-5 opacity-0 group-hover:opacity-100" />
        <div
          className="w-12 h-12 rounded-3xl bg-[#313338] hover:rounded-xl hover:bg-[#23a559] hover:text-white flex items-center justify-center text-[#23a559] transition-all duration-200 cursor-pointer"
          onClick={() => setShowModal(true)}
          title="Add Server"
        >
          <Plus className="w-5 h-5" />
        </div>
      </div>
      </div>

      {/* Bottom nav */}
      <div className="mt-auto flex flex-col items-center gap-2 pt-2">
        <div className="w-8 h-[2px] bg-[#35363c] rounded-full" />
        {navItems.map((item) => {
          const isActive = item.id === "console"
            ? currentPath === "/" && searchParams.get("tab") === "console"
            : item.match.test(currentPath);
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              title={item.tooltip}
              className={`w-12 h-12 flex items-center justify-center transition-all duration-200 group relative
                ${isActive
                  ? "bg-[#5865F2] rounded-xl text-white"
                  : "bg-[#313338] rounded-3xl text-[#dbdee1] hover:rounded-xl hover:bg-[#5865F2] hover:text-white"
                }`}
            >
              <div className={`absolute -left-3 w-2 bg-white rounded-r-lg transition-all duration-200
                ${isActive ? "h-8 opacity-100" : "h-5 opacity-0 group-hover:opacity-100"}`}
              />
              <item.Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Settings & User */}
      <div className="mt-2 flex flex-col items-center gap-2">
        <div
          className="w-12 h-12 rounded-3xl bg-[#313338] hover:rounded-xl flex items-center justify-center cursor-pointer text-[#dbdee1] hover:bg-[#35373c] hover:text-white transition-all duration-200"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </div>
        <div
          className="w-12 h-12 rounded-full bg-[#313338] flex items-center justify-center cursor-pointer text-sm text-[#dbdee1] hover:bg-[#f23f43] hover:text-white transition-colors relative font-bold"
          onClick={logout}
          title={user?.username || "Logout"}
        >
          {user?.display_name?.charAt(0) || user?.username?.charAt(0) || "?"}
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#1e1f22] flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-[#23a559]" />
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)}>
          <div
            className="absolute bg-[#2b2d31] rounded-xl shadow-2xl py-2 min-w-[160px] border border-[#1e1f22]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-4 py-2 text-left text-[13px] text-[#dbdee1] hover:bg-[#35373c] flex items-center gap-2 transition-colors"
              onClick={() => {
                const s = servers.find((s) => s.id === contextMenu.id);
                if (s) setEditingServer({ id: s.id, name: s.name, description: s.description || undefined });
                setContextMenu(null);
              }}
            >
              Edit Server
            </button>
            <button
              className="w-full px-4 py-2 text-left text-[13px] text-[#f23f43] hover:bg-[#f23f43]/10 flex items-center gap-2 transition-colors"
              onClick={() => {
                deleteServer(contextMenu.id);
                setContextMenu(null);
              }}
            >
              Delete Server
            </button>
          </div>
        </div>
      )}

      {(showModal || editingServer) && (
        <ServerModal
          onClose={() => {
            setShowModal(false);
            setEditingServer(null);
          }}
          server={editingServer || undefined}
        />
      )}

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
