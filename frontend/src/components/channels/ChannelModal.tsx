import { useState } from "react";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-[var(--bg-secondary)] rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-white mb-4">{channel ? "Edit Channel" : "Create Channel"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Channel Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--border-color)] focus:outline-none focus:border-[var(--text-accent)]"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--border-color)] focus:outline-none focus:border-[var(--text-accent)] resize-none h-20"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-[var(--text-secondary)] hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-[var(--text-accent)] text-white rounded hover:bg-[var(--text-accent)]/80 transition-colors">
              {channel ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}