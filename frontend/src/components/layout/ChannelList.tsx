import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Hash, Plus, ChevronDown, Terminal, Book, Folder, Mic, Headphones, Settings, Server } from "lucide-react";
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
  const location = useLocation();

  const currentServer = servers.find((s) => s.id === currentServerId);
  const isConsole = location.pathname === "/console";
  const isServerConsole = location.pathname.startsWith("/server/") && location.pathname.endsWith("/console");

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
      <div className="w-60 bg-[#2b2d31] flex flex-col h-full flex-shrink-0 select-none">
        <div className="p-4 text-[#949ba4] text-sm text-center">
          Select a server to get started
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 bg-[#2b2d31] flex flex-col h-full flex-shrink-0 select-none">
      {/* Server header */}
      <div className="h-12 border-b border-[#1e1f22] px-4 flex items-center justify-between shadow-sm cursor-pointer hover:bg-[#35373c] transition-colors">
        <h1 className="font-bold text-white text-[15px] truncate">{currentServer.name}</h1>
        <ChevronDown size={14} className="text-white opacity-60" />
      </div>

      <div className="flex-1 overflow-y-auto pt-3 px-2 scrollbar-hide">
        {/* Console */}
        <div className="mb-4 space-y-[2px]">
          <button
            onClick={() => navigate("/console")}
            className={`w-full text-left px-2 py-[6px] rounded flex items-center gap-2 group transition-colors
              ${isConsole && !isServerConsole
                ? "bg-[#3f4147] text-white"
                : "text-[#949ba4] hover:bg-[#35373c] hover:text-gray-200"
              }`}
          >
            <Terminal size={20} className={isConsole && !isServerConsole ? "text-[#5865F2]" : "text-[#80848e]"} />
            <span className="truncate text-[15px] font-bold leading-tight">全局控制台</span>
          </button>
          <button
            onClick={() => currentServerId && navigate(`/server/${currentServerId}/console`)}
            className={`w-full text-left px-2 py-[6px] rounded flex items-center gap-2 group transition-colors
              ${isServerConsole
                ? "bg-[#3f4147] text-white"
                : "text-[#949ba4] hover:bg-[#35373c] hover:text-gray-200"
              }`}
          >
            <Server size={20} className={isServerConsole ? "text-[#5865F2]" : "text-[#80848e]"} />
            <span className="truncate text-[15px] font-bold leading-tight">服务器控制台</span>
          </button>
        </div>

        {/* Channels */}
        <div className="mb-4">
          <div className="px-1 mb-1 flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-1">
              <ChevronDown
                size={10}
                className={`text-gray-400 transition-transform duration-200 ${channelsOpen ? "" : "-rotate-90"}`}
                onClick={() => setChannelsOpen(!channelsOpen)}
              />
              <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wide group-hover:text-gray-200">
                Channels
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowAddChannel(true); }}
              className="p-0.5 hover:bg-[#3f4147] rounded"
            >
              <Plus size={16} className="text-gray-400 hover:text-white" />
            </button>
          </div>

          {channelsOpen && (
            <div className="space-y-[2px]">
              {channels.map((channel) => {
                const isActive = currentChannelId === channel.id && !isConsole;
                return (
                  <button
                    key={channel.id}
                    onClick={() => handleChannelClick(channel.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ id: channel.id, x: e.clientX, y: e.clientY });
                    }}
                    className={`w-full text-left px-2 py-[6px] rounded flex items-center gap-2 group transition-colors
                      ${isActive
                        ? "bg-[#3f4147] text-white"
                        : "text-[#949ba4] hover:bg-[#35373c] hover:text-gray-200"
                      }`}
                  >
                    <Hash size={20} className="text-[#80848e]" />
                    <span className="truncate text-[15px] font-medium leading-tight">{channel.name.toLowerCase()}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Resources */}
        <div className="mt-6">
          <div className="px-1 mb-1 flex items-center gap-1 group cursor-pointer">
            <ChevronDown size={10} className="text-gray-400" />
            <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wide group-hover:text-gray-200">
              Resources
            </span>
          </div>
          <div className="space-y-[2px]">
            <button className="w-full text-left px-2 py-[6px] rounded flex items-center gap-2 transition-colors text-[#949ba4] hover:bg-[#35373c] hover:text-gray-200">
              <Book size={18} />
              <span className="text-[15px] font-medium leading-tight">library</span>
            </button>
            <button className="w-full text-left px-2 py-[6px] rounded flex items-center gap-2 transition-colors text-[#949ba4] hover:bg-[#35373c] hover:text-gray-200">
              <Folder size={18} />
              <span className="text-[15px] font-medium leading-tight">my-assets</span>
            </button>
          </div>
        </div>
      </div>

      {/* User panel */}
      <div className="bg-[#232428] px-2 py-[6px] flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 p-1 rounded hover:bg-[#3f4147] cursor-pointer group min-w-0">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm uppercase">
              {user?.display_name?.charAt(0) || user?.username?.charAt(0) || "?"}
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 border-[3px] border-[#232428] rounded-full bg-[#23a559]" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-[13px] font-bold text-white truncate leading-none mb-[2px]">{user?.display_name || user?.username}</p>
            <p className="text-[11px] text-[#949ba4] group-hover:text-gray-200 truncate leading-none">Online</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button className="w-8 h-8 flex items-center justify-center text-[#dbdee1] hover:bg-[#3f4147] rounded transition-colors" title="Mute">
            <Mic size={16} />
          </button>
          <button className="w-8 h-8 flex items-center justify-center text-[#dbdee1] hover:bg-[#3f4147] rounded transition-colors" title="Deafen">
            <Headphones size={16} />
          </button>
          <button className="w-8 h-8 flex items-center justify-center text-[#dbdee1] hover:bg-[#3f4147] rounded transition-colors" title="Settings">
            <Settings size={16} />
          </button>
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
              className="w-full px-4 py-2 text-left text-[13px] text-[#dbdee1] hover:bg-[#35373c] transition-colors"
              onClick={() => {
                const ch = channels.find((c) => c.id === contextMenu.id);
                if (ch) setEditingChannel({ id: ch.id, name: ch.name, description: ch.description || undefined });
                setContextMenu(null);
              }}
            >
              Edit Channel
            </button>
            <button
              className="w-full px-4 py-2 text-left text-[13px] text-[#f23f43] hover:bg-[#f23f43]/10 transition-colors"
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
