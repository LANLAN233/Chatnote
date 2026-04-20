import { useState, useEffect, useCallback } from "react";
import { BookOpen, Hash, TrendingUp, Send, Zap, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerStore, useNoteStore, useChannelStore } from "../../stores";
import { statsApi } from "../../services";
import type { StatsData, SmartCreateResult } from "../../types";

export default function HomePage() {
  const { servers, currentServerId } = useServerStore();
  const { fetchNotes } = useNoteStore();
  const { channels, fetchChannels } = useChannelStore();
  const [quickInput, setQuickInput] = useState("");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    server_id: number;
    channel_id: number;
  } | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await statsApi.get();
      if (data.data) setStats(data.data as StatsData);
    } catch {}
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleSubmit = async () => {
    if (!quickInput.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      const { data } = await statsApi.get();
      const { aiApi } = await import("../../services");
      const res = await aiApi.smartCreate(quickInput.trim(), true);
      const result = res.data.data as SmartCreateResult;
      setSubmitResult({ server_id: result.server_id, channel_id: result.channel_id });
      setQuickInput("");
      loadStats();
      const { useServerStore, useChannelStore } = await import("../../stores");
      await useServerStore.getState().fetchServers();
      if (result.server_id) {
        await useChannelStore.getState().fetchChannels(result.server_id);
      }
    } catch {
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const recentNotes = stats?.recent_notes || [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">ChatNote Dashboard</h1>
          <p className="text-[var(--text-muted)]">
            Type anything below to capture a thought. AI will auto-classify it.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard
            icon={<BookOpen className="w-5 h-5" />}
            label="Total Notes"
            value={String(stats?.total_notes ?? 0)}
            color="var(--accent)"
          />
          <StatCard
            icon={<Hash className="w-5 h-5" />}
            label="Channels"
            value={String(stats?.total_channels ?? 0)}
            color="var(--success)"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Servers"
            value={String(stats?.total_servers ?? 0)}
            color="#fee75c"
          />
        </div>

        <div className="mb-8">
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-5 shadow-[0_0_20px_rgba(88,101,242,0.05)]">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-white font-semibold text-sm">Smart Input</h3>
              <span className="text-[11px] text-[var(--text-muted)]">
                Use @Server #Channel to specify location
              </span>
            </div>
            <div className="flex items-end gap-3">
              <textarea
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a note, @ServerName #ChannelName or /command..."
                className="flex-1 px-4 py-3 bg-[var(--bg-deep)] text-white rounded-lg border border-[var(--bg-active)] focus:border-[var(--accent)] transition-colors resize-none h-24 text-[15px] placeholder:text-[var(--text-muted)]"
              />
              <button
                onClick={handleSubmit}
                disabled={!quickInput.trim() || isSubmitting}
                className={`px-5 py-3 rounded-lg font-medium transition-all flex items-center gap-2 shrink-0 ${
                  quickInput.trim() && !isSubmitting
                    ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-lg shadow-[var(--accent)]/20"
                    : "bg-[var(--bg-accent)] text-[var(--text-muted)] cursor-not-allowed"
                }`}
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? "..." : "Send"}
              </button>
            </div>
            {submitResult && (
              <div className="mt-3 px-3 py-2 bg-[var(--success)]/10 border border-[var(--success)]/30 rounded-lg text-[13px] text-[var(--success)]">
                Note saved! AI auto-classified your note.
              </div>
            )}
          </div>
        </div>

        {recentNotes.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-[var(--text-muted)]" />
              <h3 className="text-white font-semibold">Recent Activity</h3>
            </div>
            <div className="space-y-2">
              {recentNotes.map((note) => (
                <div
                  key={note.id}
                  className="bg-[var(--bg-secondary)] p-4 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)]/50 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-[var(--bg-deep)] text-[var(--accent)] text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      ch#{note.channel_id}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] ml-auto">
                      {new Date(note.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-primary)] line-clamp-2 prose prose-invert prose-sm max-w-none">
                    {note.content.length > 150 ? (
                      <>{note.content.substring(0, 150)}...</>
                    ) : (
                      <ReactMarkdown>{note.content}</ReactMarkdown>
                    )}
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
