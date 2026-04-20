import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, MessageSquare, Calendar, Puzzle, Plus } from "lucide-react";
import { useServerStore, useAuthStore } from "../../stores";
import ServerModal from "../servers/ServerModal";

export default function Sidebar() {
  const { servers, currentServerId, setCurrentServer, deleteServer } = useServerStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<{ id: number; name: string; description?: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: number; x: number; y: number } | null>(null);

  const navIcons = [
    { id: "chat", Icon: MessageSquare, color: "bg-[#5865f2]", tooltip: "Study Chat", path: "/" },
    { id: "calendar", Icon: Calendar, color: "bg-[#23a559]", tooltip: "Schedule", path: "/calendar" },
    { id: "plugins", Icon: Puzzle, color: "bg-[#f23f43]", tooltip: "Plugins & Bots", path: "/plugins" },
  ];

  const handleContextMenu = (e: React.MouseEvent, serverId: number) => {
    e.preventDefault();
    setContextMenu({ id: serverId, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="w-[72px] bg-[var(--bg-deep)] flex flex-col items-center py-3 gap-2 shrink-0 select-none">
      <div
        onClick={() => navigate("/")}
        className="w-12 h-12 flex items-center justify-center mb-1 cursor-pointer transition-all duration-200 group relative bg-[#313338] rounded-2xl text-[var(--text-primary)] hover:rounded-xl hover:bg-[#5865f2] hover:text-white"
      >
        <Home className="w-6 h-6" />
        <div className="absolute -left-3 w-2 bg-white rounded-r-lg transition-all duration-200 h-5 opacity-0 group-hover:opacity-100" />
      </div>
      <div className="w-8 h-[2px] bg-[#35363c] rounded-full mb-1" />

      {servers.map((server) => {
        const isActive = currentServerId === server.id;
        return (
          <div key={server.id} className="group relative flex items-center">
            <div
              className={`absolute -left-3 w-2 bg-white rounded-r-lg transition-all duration-200 ${
                isActive ? "h-10 opacity-100" : "h-5 opacity-0 group-hover:opacity-100"
              }`}
            />
            <div
              className={`w-12 h-12 flex items-center justify-center cursor-pointer text-white font-bold transition-all duration-200 ${
                isActive
                  ? "rounded-xl bg-[var(--accent)]"
                  : "rounded-3xl bg-[#313338] hover:rounded-xl hover:bg-[var(--accent)]"
              }`}
              onClick={() => {
                setCurrentServer(server.id);
                navigate(`/server/${server.id}`);
              }}
              onContextMenu={(e) => handleContextMenu(e, server.id)}
              title={server.name}
            >
              {server.name.charAt(0).toUpperCase()}
            </div>
          </div>
        );
      })}

      <div className="group relative flex items-center">
        <div className="absolute -left-3 w-2 bg-white rounded-r-lg transition-all duration-200 h-5 opacity-0 group-hover:opacity-100" />
        <div
          className="w-12 h-12 rounded-3xl bg-[#313338] hover:rounded-xl hover:bg-[var(--success)] flex items-center justify-center text-[var(--success)] hover:text-white text-2xl transition-all duration-200 cursor-pointer"
          onClick={() => setShowModal(true)}
          title="Add Server"
        >
          <Plus className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-auto flex flex-col items-center gap-2 pt-2">
        <div className="w-8 h-[2px] bg-[#35363c] rounded-full" />
        {navIcons.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            title={item.tooltip}
            className="w-12 h-12 flex items-center justify-center transition-all duration-200 group relative bg-[#313338] rounded-3xl text-[var(--text-primary)] hover:rounded-xl hover:bg-[#5865f2] hover:text-white"
          >
            <div className="absolute -left-3 w-2 bg-white rounded-r-lg transition-all duration-200 h-5 opacity-0 group-hover:opacity-100" />
            <item.Icon className="w-5 h-5" />
          </button>
        ))}
      </div>

      <div className="mt-2">
        <div
          className="w-12 h-12 rounded-full bg-[#313338] flex items-center justify-center cursor-pointer text-sm text-[var(--text-secondary)] hover:bg-[var(--danger)] hover:text-white transition-colors relative"
          onClick={logout}
          title={user?.username || "Logout"}
        >
          {user?.display_name?.charAt(0) || user?.username?.charAt(0) || "?"}
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--bg-deep)] flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--success)]" />
          </div>
        </div>
      </div>

      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)}>
          <div
            className="absolute bg-[var(--bg-tertiary)] rounded-md shadow-xl py-1.5 min-w-[140px] border border-[var(--border-color)]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-3 py-1.5 text-left text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2"
              onClick={() => {
                const s = servers.find((s) => s.id === contextMenu.id);
                if (s) setEditingServer({ id: s.id, name: s.name, description: s.description || undefined });
                setContextMenu(null);
              }}
            >
              Edit Server
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-[13px] text-[var(--danger)] hover:bg-[var(--bg-hover)] flex items-center gap-2"
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
    </div>
  );
}
