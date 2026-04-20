import { useState } from "react";
import { X } from "lucide-react";
import { useServerStore } from "../../stores";

interface ServerModalProps {
  onClose: () => void;
  server?: { id: number; name: string; description?: string };
}

export default function ServerModal({ onClose, server }: ServerModalProps) {
  const [name, setName] = useState(server?.name || "");
  const [description, setDescription] = useState(server?.description || "");
  const { createServer, updateServer } = useServerStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (server) {
      await updateServer(server.id, { name, description: description || undefined });
    } else {
      await createServer({ name, description: description || undefined });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[var(--bg-secondary)] rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">{server ? "Edit Server" : "Create a Server"}</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
            Server Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--bg-active)] focus:border-[var(--accent)] transition-colors text-[15px]"
            required
          />

          <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide mb-2 mt-4">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2.5 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--bg-active)] focus:border-[var(--accent)] transition-colors resize-none h-20 text-[15px]"
          />

          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[var(--text-secondary)] hover:text-white transition-colors text-[15px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-[var(--accent)] text-white rounded font-medium hover:bg-[var(--accent-hover)] transition-colors text-[15px]"
            >
              {server ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}