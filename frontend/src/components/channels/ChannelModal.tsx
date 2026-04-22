import { useState } from "react";
import { X } from "lucide-react";
import { useChannelStore } from "../../stores";

interface ChannelModalProps {
  serverId: number;
  onClose: () => void;
  channel?: { id: number; name: string; description?: string };
}

export default function ChannelModal({ serverId, onClose, channel }: ChannelModalProps) {
  const [name, setName] = useState(channel?.name || "");
  const [description, setDescription] = useState(channel?.description || "");
  const { createChannel, updateChannel } = useChannelStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (channel) {
      await updateChannel(serverId, channel.id, { name, description: description || undefined });
    } else {
      await createChannel(serverId, { name, description: description || undefined });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#313338] w-full max-w-md rounded-xl shadow-2xl border border-[#1e1f22] overflow-hidden animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#1e1f22] flex justify-between items-center">
          <h3 className="font-bold text-white text-lg">{channel ? "Edit Channel" : "Create Channel"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#949ba4] uppercase tracking-wide mb-2">
              Channel Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#1e1f22] text-white rounded-lg border border-[#1e1f22] focus:border-[#5865f2] outline-none transition-colors text-[15px]"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#949ba4] uppercase tracking-wide mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#1e1f22] text-white rounded-lg border border-[#1e1f22] focus:border-[#5865f2] outline-none transition-colors resize-none h-20 text-[15px]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-300 hover:underline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg font-bold text-white bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 transition-all"
            >
              {channel ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
