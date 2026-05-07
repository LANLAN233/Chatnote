import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Channel, Server } from "../../types";
import { consoleApi } from "../../services";

interface ConsoleImportModalProps {
  content: string;
  servers: Server[];
  channels: Channel[];
  onClose: () => void;
}

function parseTargetText(value: string, servers: Server[], channels: Channel[]) {
  const serverName = value.match(/@([^#]+?)(?:\s+#|$)/)?.[1]?.trim();
  const channelName = value.match(/#(.+)$/)?.[1]?.trim();

  const matchedServer = serverName
    ? servers.find((server) => server.name === serverName)
    : null;
  const matchedChannel = channelName
    ? channels.find((channel) => channel.name === channelName)
    : null;

  return {
    serverId: matchedServer?.id ?? null,
    channelId: matchedChannel?.id ?? null,
  };
}

export default function ConsoleImportModal({ content, servers, channels, onClose }: ConsoleImportModalProps) {
  const [editableContent, setEditableContent] = useState(content);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(servers[0]?.id ?? null);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [targetText, setTargetText] = useState("");
  const [status, setStatus] = useState("");

  const visibleChannels = useMemo(
    () => channels.filter((channel) => (selectedServerId ? channel.server_id === selectedServerId : true)),
    [channels, selectedServerId]
  );

  const handleServerChange = (value: string) => {
    const nextServerId = value ? Number(value) : null;
    setSelectedServerId(nextServerId);
    setSelectedChannelId(null);
  };

  const handleTargetChange = (value: string) => {
    setTargetText(value);
    const parsed = parseTargetText(value, servers, channels);
    if (parsed.serverId) setSelectedServerId(parsed.serverId);
    if (parsed.channelId) setSelectedChannelId(parsed.channelId);
  };

  const handleSave = async () => {
    await consoleApi.importToChannel({
      content: editableContent,
      server_id: selectedServerId ?? undefined,
      channel_id: selectedChannelId ?? undefined,
      target_text: targetText,
    });
    setStatus("已导入到频道");
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
      <div className="w-[560px] rounded-xl border border-[#3f4147] bg-[#1e1f22] p-5 text-white shadow-2xl space-y-4">
        <h2 className="text-lg font-bold">导入到频道</h2>

        <label className="block space-y-1">
          <span className="text-sm text-[#949ba4]">Content</span>
          <textarea
            aria-label="Content"
            value={editableContent}
            onChange={(e) => setEditableContent(e.target.value)}
            className="w-full min-h-24 rounded-lg border border-[#3f4147] bg-[#111214] p-3 text-sm outline-none"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-[#949ba4]">Natural language target</span>
          <input
            aria-label="Natural language target"
            value={targetText}
            onChange={(e) => handleTargetChange(e.target.value)}
            className="w-full rounded-lg border border-[#3f4147] bg-[#111214] p-3 text-sm outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm text-[#949ba4]">Server</span>
            <select
              aria-label="Server"
              value={selectedServerId ?? ""}
              onChange={(e) => handleServerChange(e.target.value)}
              className="w-full rounded-lg border border-[#3f4147] bg-[#111214] p-3 text-sm outline-none"
            >
              <option value="">请选择服务器</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-[#949ba4]">Channel</span>
            <select
              aria-label="Channel"
              value={selectedChannelId ?? ""}
              onChange={(e) => setSelectedChannelId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border border-[#3f4147] bg-[#111214] p-3 text-sm outline-none"
            >
              <option value="">请选择频道</option>
              {visibleChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[#949ba4] hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[#5865f2] px-4 py-2 text-sm font-medium text-white"
          >
            保存
          </button>
        </div>

        {status && <div className="text-sm text-green-400">{status}</div>}
      </div>
    </div>,
    document.body
  );
}
