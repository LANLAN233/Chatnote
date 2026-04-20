import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useServerStore, useChannelStore } from "../../stores";
import ChannelModal from "../channels/ChannelModal";

export default function ChannelList() {
  const { servers, currentServerId } = useServerStore();
  const { channels, currentChannelId, fetchChannels, setCurrentChannel, deleteChannel } = useChannelStore();
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [editingChannel, setEditingChannel] = useState<{
    id: number;
    name: string;
    description?: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const navigate = useNavigate();

  const currentServer = servers.find((s) => s.id === currentServerId);

  useEffect(() => {
    if (currentServerId) {
      fetchChannels(currentServerId);
    }
  }, [currentServerId, fetchChannels]);

  const handleChannelClick = (channelId: number) => {
    setCurrentChannel(channelId);
    if (currentServerId) {
      navigate(`/server/${currentServerId}/channel/${channelId}`);
    }
  };

  if (!currentServer) {
    return (
      <div className="w-60 bg-[var(--bg-secondary)] flex flex-col shrink-0">
        <div className="p-4 text-[var(--text-secondary)] text-sm">Select a server to get started</div>
      </div>
    );
  }

  return (
    <div className="w-60 bg-[var(--bg-secondary)] flex flex-col shrink-0 border-r border-[var(--border-color)]">
      <div className="p-4 border-b border-[var(--border-color)] font-semibold text-white truncate">
        {currentServer.name}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Channels</span>
          <button
            className="text-[var(--text-secondary)] hover:text-white text-lg leading-none"
            onClick={() => setShowAddChannel(true)}
            title="Add Channel"
          >
            +
          </button>
        </div>

        {channels.map((channel) => (
          <div
            key={channel.id}
            className={`px-2 py-1.5 rounded cursor-pointer text-sm flex items-center gap-1.5 ${
              currentChannelId === channel.id
                ? "bg-[var(--active-bg)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            }`}
            onClick={() => handleChannelClick(channel.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ id: channel.id, x: e.clientX, y: e.clientY });
            }}
          >
            <span className="text-[var(--text-secondary)]">#</span>
            {channel.name}
          </div>
        ))}
      </div>

      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)}>
          <div
            className="absolute bg-[var(--bg-tertiary)] rounded shadow-xl py-1 min-w-[120px] border border-[var(--border-color)]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              onClick={() => {
                const ch = channels.find((c) => c.id === contextMenu.id);
                if (ch) setEditingChannel({ id: ch.id, name: ch.name, description: ch.description || undefined });
                setContextMenu(null);
              }}
            >
              Edit
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-sm text-[var(--danger)] hover:bg-[var(--hover-bg)]"
              onClick={() => {
                deleteChannel(currentServerId!, contextMenu.id);
                setContextMenu(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {(showAddChannel || editingChannel) && (
        <ChannelModal
          serverId={currentServerId!}
          onClose={() => {
            setShowAddChannel(false);
            setEditingChannel(null);
          }}
          channel={editingChannel || undefined}
        />
      )}
    </div>
  );
}