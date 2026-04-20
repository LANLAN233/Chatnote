import { useState } from "react";
import { useServerStore, useAuthStore } from "../../stores";
import ServerModal from "../servers/ServerModal";

export default function Sidebar() {
  const { servers, currentServerId, setCurrentServer, deleteServer } = useServerStore();
  const { user, logout } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<{ id: number; name: string; description?: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: number; x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, serverId: number) => {
    e.preventDefault();
    setContextMenu({ id: serverId, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="w-[72px] bg-[var(--bg-secondary)] flex flex-col items-center py-3 gap-2 shrink-0">
      {servers.map((server) => (
        <div
          key={server.id}
          className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-200 flex items-center justify-center cursor-pointer text-white font-bold text-lg ${
            currentServerId === server.id
              ? "rounded-[16px] bg-[var(--text-accent)]"
              : "bg-[var(--bg-tertiary)] hover:bg-[var(--bg-accent)]"
          }`}
          onClick={() => setCurrentServer(server.id)}
          onContextMenu={(e) => handleContextMenu(e, server.id)}
          title={server.name}
        >
          {server.name.charAt(0).toUpperCase()}
        </div>
      ))}

      <button
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-200 bg-[var(--bg-tertiary)] hover:bg-[var(--success)] flex items-center justify-center text-[var(--success)] hover:text-white text-2xl"
        onClick={() => setShowModal(true)}
        title="Add Server"
      >
        +
      </button>

      <div className="mt-auto mb-2">
        <div
          className="w-12 h-12 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center cursor-pointer text-sm text-[var(--text-secondary)] hover:bg-[var(--danger)] hover:text-white transition-colors"
          onClick={logout}
          title={user?.username || "Logout"}
        >
          {user?.display_name?.charAt(0) || user?.username?.charAt(0) || "?"}
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
        >
          <div
            className="absolute bg-[var(--bg-tertiary)] rounded shadow-xl py-1 min-w-[120px] border border-[var(--border-color)]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              onClick={() => {
                const s = servers.find((s) => s.id === contextMenu.id);
                if (s) setEditingServer({ id: s.id, name: s.name, description: s.description || undefined });
                setContextMenu(null);
              }}
            >
              Edit
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-[var(--danger)] hover:bg-[var(--hover-bg)]"
              onClick={() => {
                deleteServer(contextMenu.id);
                setContextMenu(null);
              }}
            >
              Delete
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