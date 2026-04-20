import { useState } from "react";
import { Hash, BookOpen, TrendingUp, Send } from "lucide-react";
import { useServerStore, useNoteStore, useChannelStore } from "../../stores";

export default function HomePage() {
  const { servers, currentServerId } = useServerStore();
  const { channels, currentChannelId } = useChannelStore();
  const { notes, totalNotes } = useNoteStore();
  const [quickNote, setQuickNote] = useState("");
  const currentServer = servers.find((s) => s.id === currentServerId);

  if (!currentServerId || !currentServer) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-[var(--accent)]/20 flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-[var(--accent)]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Welcome to ChatNote</h2>
          <p className="text-[var(--text-muted)] text-[15px]">
            Select a server from the sidebar to start taking notes
          </p>
        </div>
      </div>
    );
  }

  const recentNotes = notes.slice(0, 6);
  const totalChannels = channels.length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">{currentServer.name}</h1>
          {currentServer.description && (
            <p className="text-[var(--text-muted)]">{currentServer.description}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            label="Total Notes"
            value={String(totalNotes)}
            color="var(--accent)"
          />
          <StatCard
            icon={<Hash className="w-5 h-5" />}
            label="Channels"
            value={String(totalChannels)}
            color="var(--success)"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Active Since"
            value={new Date(currentServer.created_at).toLocaleDateString()}
            color="#fee75c"
          />
        </div>

        {currentChannelId && (
          <div className="mb-8">
            <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-5 shadow-[0_0_20px_rgba(88,101,242,0.05)]">
              <h3 className="text-white font-semibold mb-3">Quick Note</h3>
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                placeholder="Quickly capture a thought..."
                className="w-full px-4 py-3 bg-[var(--bg-deep)] text-white rounded-lg border border-[var(--bg-active)] focus:border-[var(--accent)] transition-colors resize-none h-32 text-[15px] placeholder:text-[var(--text-muted)]"
              />
              <div className="flex justify-end mt-3">
                <button
                  onClick={async () => {
                    if (!quickNote.trim()) return;
                    const { createNote } = useNoteStore.getState();
                    await createNote({
                      channel_id: currentChannelId,
                      content: quickNote.trim(),
                      content_type: "markdown",
                    });
                    setQuickNote("");
                  }}
                  disabled={!quickNote.trim()}
                  className={`px-5 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                    quickNote.trim()
                      ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-lg shadow-[var(--accent)]/20"
                      : "bg-[var(--bg-accent)] text-[var(--text-muted)] cursor-not-allowed"
                  }`}
                >
                  <Send className="w-4 h-4" /> Send
                </button>
              </div>
            </div>
          </div>
        )}

        {recentNotes.length > 0 && (
          <div>
            <h3 className="text-white font-semibold mb-4">Recent Notes</h3>
            <div className="grid grid-cols-2 gap-3">
              {recentNotes.map((note) => (
                <div
                  key={note.id}
                  className="bg-[var(--bg-secondary)] p-5 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)] transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-[var(--bg-deep)] text-[var(--accent)] text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      {channels.find((c) => c.id === note.channel_id)?.name || "channel"}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] ml-auto">
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-primary)] line-clamp-2">
                    {note.content.length > 100 ? note.content.substring(0, 100) + "..." : note.content}
                  </div>
                  <div className="flex items-center justify-between mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[11px] text-[var(--text-muted)]">View note →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-color)]">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20`, color }}>
          {icon}
        </div>
        <span className="text-[var(--text-muted)] text-[13px]">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}