import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Hash, Plus, ChevronDown, Terminal, Book, Folder, Mic, Headphones, Settings } from "lucide-react";
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
      <div className="w-60 bg-[var(--bg-secondary)] flex flex-col shrink-0 select-none">
        <div className="p-4 text-[var(--text-muted)] text-sm text-center">
          Select a server to get started
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 bg-[var(--bg-secondary)] flex flex-col h-full shrink-0 select-none">
      <div className="h-12 px-4 flex items-center justify-between border-b border-[var(--border-color)] shadow-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-colors shrink-0">
        <h2 className="font-bold text-white text-[15px] truncate">{currentServer.name}</h2>
        <ChevronDown className="w-3.5 h-3.5 text-white opacity-60" />
      </div>

      <div className="flex-1 overflow-y-auto pt-3 px-2 scrollbar-hide">
        <div className="mb-4 space-y-[2px]">
          <button
            onClick={() => navigate("/console")}
            className={`w-full text-left px-2 py-[6px] rounded flex items-center gap-2 group transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-gray-200`}
          >
            <Terminal className="w-5 h-5 text-[var(--text-dim)]" />
            <span className="truncate text-[15px] font-bold leading-tight">控制台 (Terminal)</span>
          </button>
        </div>

        <div className="mb-4">
          <div className="px-1 mb-1 flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-1">
              <ChevronDown
                className={`w-2.5 h-2.5 text-gray-400 transition-transform duration-200 ${channelsOpen ? "" : "-rotate-90"}`}
                onClick={() => setChannelsOpen(!channelsOpen)}
              />
              <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wide group-hover:text-gray-200">
                Channels
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowAddChannel(true); }}
              className="p-0.5 hover:bg-[var(--bg-active)] rounded"
            >
              <Plus className="w-4 h-4 text-gray-400 hover:text-white" />
            </button>
          </div>

          {channelsOpen && (
            <div className="space-y-[2px]">
              {channels.map((channel) => {
                const isActive = currentChannelId === channel.id;
                return (
                  <button
                    key={channel.id}
                    className={`w-full text-left px-2 py-[6px] rounded flex items-center gap-2 group transition-colors ${
                      isActive
                        ? "bg-[var(--bg-active)] text-white"
                        : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-gray-200"
                    }`}
                    onClick={() => handleChannelClick(channel.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ id: channel.id, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <Hash className="w-5 h-5 shrink-0 text-[var(--text-dim)]" />
                    <span className="truncate text-[15px] font-medium leading-tight">{channel.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6">
          <div className="px-1 mb-1 flex items-center gap-1 group cursor-pointer">
            <ChevronDown className="w-2.5 h-2.5 text-gray-400" />
            <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wide group-hover:text-gray-200">
              Resources
            </span>
          </div>
          <div className="space-y-[2px]">
            <button className="w-full text-left px-2 py-[6px] rounded flex items-center gap-2 transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-gray-200">
              <Book className="w-[18px] h-[18px]" />
              <span className="text-[15px] font-medium leading-tight">library</span>
            </button>
            <button className="w-full text-left px-2 py-[6px] rounded flex items-center gap-2 transition-colors text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-gray-200">
              <Folder className="w-[18px] h-[18px]" />
              <span className="text-[15px] font-medium leading-tight">my-assets</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-user-panel)] px-2 py-[6px] flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-1 p-1 rounded hover:bg-[var(--bg-active)] cursor-pointer group min-w-0">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm uppercase">
              {user?.display_name?.charAt(0) || user?.username?.charAt(0) || "?"}
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 border-[3px] border-[var(--bg-user-panel)] rounded-full bg-[var(--success)]" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[13px] font-bold text-white truncate leading-none mb-[2px]">{user?.display_name || user?.username}</p>
            <p className="text-[11px] text-[var(--text-muted)] group-hover:text-gray-200 truncate leading-none">Online</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-active)] rounded transition-colors" title="Mute">
            <Mic className="w-4 h-4" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-active)] rounded transition-colors" title="Deafen">
            <Headphones className="w-4 h-4" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-active)] rounded transition-colors" title="Settings">
            <Settings className="w-4 h-4" />
          </button>
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
