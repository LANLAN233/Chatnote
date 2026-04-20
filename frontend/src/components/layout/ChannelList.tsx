import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Hash, Plus, ChevronDown } from "lucide-react";
import { useServerStore, useChannelStore, useAuthStore } from "../../stores";
import ChannelModal from "../channels/ChannelModal";

export default function ChannelList() {
  const { servers, currentServerId } = useServerStore();
  const { channels, currentChannelId, fetchChannels, setCurrentChannel, deleteChannel } = useChannelStore();
  const { user } = useAuthStore();
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [editingChannel, setEditingChannel] = useState<{
    id: number;
    name: string;
    description?: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  const [channelsOpen, setChannelsOpen] = useState(true);
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
        <div className="p-4 text-[var(--text-muted)] text-sm text-center">
          Select a server to get started
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 bg-[var(--bg-secondary)] flex flex-col shrink-0 border-r border-[var(--border-color)]">
      <div className="h-12 px-4 flex items-center border-b border-[var(--border-color)] shadow-[0_1px_0_var(--shadow-color)] shrink-0">
        <h2 className="font-semibold text-white text-[15px] truncate flex-1">{currentServer.name}</h2>
        <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
      </div>

      <div className="flex-1 overflow-y-auto pt-4 pb-2">
        <div className="flex items-center justify-between px-2 mb-1">
          <button
            className="flex items-center gap-0.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide hover:text-[var(--text-secondary)] transition-colors"
            onClick={() => setChannelsOpen(!channelsOpen)}
          >
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${channelsOpen ? "" : "-rotate-90"}`} />
            Text Channels
          </button>
          <button
            className="text-[var(--text-muted)] hover:text-white transition-colors"
            onClick={() => setShowAddChannel(true)}
            title="Add Channel"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {channelsOpen && (
          <div className="space-y-0.5 px-1.5">
            {channels.map((channel) => {
              const isActive = currentChannelId === channel.id;
              return (
                <div
                  key={channel.id}
                  className={`group flex items-center gap-1.5 px-2 py-[6px] rounded-[3px] cursor-pointer text-[15px] transition-colors ${
                    isActive
                      ? "bg-[var(--bg-active)] text-white"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                  }`}
                  onClick={() => handleChannelClick(channel.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ id: channel.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  <Hash className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-[var(--text-muted)]"}`} />
                  <span className="truncate">{channel.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-[52px] px-2 flex items-center gap-2 bg-[#232428] shrink-0">
        <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
          {user?.display_name?.charAt(0) || user?.username?.charAt(0) || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-white truncate">{user?.display_name || user?.username}</div>
          <div className="text-[11px] text-[var(--text-muted)]">Online</div>
        </div>
      </div>

      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)}>
          <div
            className="absolute bg-[var(--bg-tertiary)] rounded-md shadow-xl py-1.5 min-w-[140px] border border-[var(--border-color)]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-3 py-1.5 text-left text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              onClick={() => {
                const ch = channels.find((c) => c.id === contextMenu.id);
                if (ch) setEditingChannel({ id: ch.id, name: ch.name, description: ch.description || undefined });
                setContextMenu(null);
              }}
            >
              Edit Channel
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-[13px] text-[var(--danger)] hover:bg-[var(--bg-hover)]"
              onClick={() => {
                deleteChannel(currentServerId!, contextMenu.id);
                setContextMenu(null);
              }}
            >
              Delete Channel
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