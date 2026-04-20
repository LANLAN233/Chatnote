import { useState, useEffect, useCallback } from "react";
import { BookOpen, Clock, Target, ArrowRight, Star, Hash, SendHorizontal, Zap, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { statsApi, aiApi } from "../../services";
import { useServerStore, useChannelStore } from "../../stores";
import type { StatsData, SmartCreateResult } from "../../types";

export default function HomePage() {
  const { fetchServers } = useServerStore();
  const { fetchChannels } = useChannelStore();
  const [quickNote, setQuickNote] = useState("");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await statsApi.get();
      if (data.data) setStats(data.data as StatsData);
    } catch {}
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape") setShowSearch(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleQuickSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickNote.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await aiApi.smartCreate(quickNote.trim(), true);
      const result = res.data.data as SmartCreateResult;
      setQuickNote("");
      loadStats();
      await fetchServers();
      if (result.server_id) {
        await fetchChannels(result.server_id);
      }
    } catch {
    } finally {
      setIsSubmitting(false);
    }
  };

  const recentNotes = stats?.recent_notes || [];
  const totalNotes = stats?.total_notes ?? 0;

  return (
    <div className="flex-1 bg-[var(--bg-primary)] flex flex-col h-full overflow-hidden">
      <header className="h-48 bg-[var(--bg-deep)] relative flex items-center px-12 overflow-hidden shrink-0">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#5865f2] rounded-full blur-[100px] -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#23a559] rounded-full blur-[80px] -ml-32 -mb-32" />
        </div>
        <div className="z-10 w-full max-w-4xl">
          <h1 className="text-3xl font-black text-white mb-2 italic tracking-tight">WELCOME BACK, SCHOLAR.</h1>
          <p className="text-[var(--text-secondary)] text-lg mb-6">
            You've captured {totalNotes} notes. Ready to learn more?
          </p>
          <div className="relative max-w-xl">
            <input
              type="text"
              placeholder="Search your knowledge base..."
              className="w-full bg-[var(--bg-primary)] text-white px-4 py-3 rounded-lg outline-none border border-transparent focus:border-[#5865f2] transition-all shadow-xl"
              onFocus={() => setShowSearch(true)}
              readOnly
            />
            <kbd className="absolute right-3 top-3 px-2 py-0.5 bg-[var(--bg-deep)] text-[var(--text-muted)] text-xs rounded border border-[var(--border-light)]">
              Ctrl + K
            </kbd>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={<BookOpen className="w-6 h-6" />}
            label="Total Notes"
            value={String(totalNotes)}
            color="#5865f2"
          />
          <StatCard
            icon={<Clock className="w-6 h-6" />}
            label="Study Streak"
            value="--"
            color="#23a559"
          />
          <StatCard
            icon={<Target className="w-6 h-6" />}
            label="Next Goal"
            value="--"
            color="#f23f43"
          />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-8 flex flex-col">
            {recentNotes.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <Star className="w-[18px] h-[18px] text-yellow-400" /> Recent Activity
                  </h3>
                  <button className="text-[var(--accent)] text-xs font-bold hover:underline flex items-center gap-1">
                    View all <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentNotes.slice(0, 4).map((note) => (
                    <div
                      key={note.id}
                      className="bg-[var(--bg-secondary)] p-5 rounded-xl border border-[var(--border-color)] hover:border-[#5865f2] transition-all cursor-pointer group shadow-sm"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div className="bg-[var(--bg-deep)] p-1.5 rounded-lg">
                          <Hash className="w-3.5 h-3.5 text-[#5865f2]" />
                        </div>
                        <span className="text-[11px] font-black text-[var(--text-muted)] uppercase tracking-tighter">
                          ch#{note.channel_id}
                        </span>
                      </div>
                      <p className="text-[var(--text-primary)] text-sm line-clamp-2 mb-4 group-hover:text-white transition-colors leading-relaxed">
                        {note.content}
                      </p>
                      <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                        <span className="text-[10px] text-[var(--text-muted)] font-bold">
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>
                        <ArrowRight className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recentNotes.length === 0 && (
              <div className="py-16 flex flex-col items-center justify-center bg-[var(--bg-secondary)]/50 rounded-2xl border-2 border-dashed border-[var(--border-color)]">
                <p className="text-[var(--text-muted)] text-sm italic">No activity yet. Use the console below to start!</p>
              </div>
            )}

            <div className="bg-[var(--bg-secondary)] p-6 rounded-2xl border border-[#5865f2]/30 shadow-[0_0_20px_rgba(88,101,242,0.1)] relative overflow-hidden group mt-auto">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Zap className="w-16 h-16 text-[#5865f2]" />
              </div>
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Zap className="w-[18px] h-[18px] text-[#5865f2]" /> Command Console: Quick Capture
              </h3>
              <form onSubmit={handleQuickSubmit} className="space-y-4">
                <div className="relative">
                  <textarea
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder="Capture a thought, schedule a class, or solve a math problem... (Use @Server #Channel for manual tagging)"
                    className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] p-4 rounded-xl border border-[var(--border-light)] outline-none focus:border-[#5865f2] transition-all resize-none h-48 placeholder-[var(--text-muted)]"
                  />
                  <div className="absolute bottom-4 right-4 flex items-center gap-3">
                    <span className="text-[10px] text-[var(--text-muted)] font-medium hidden md:inline-block">Press Enter to Submit</span>
                    <button
                      type="submit"
                      disabled={!quickNote.trim() || isSubmitting}
                      className={`p-3 rounded-xl transition-all ${
                        !quickNote.trim() || isSubmitting
                          ? "bg-[var(--bg-accent)] text-gray-500"
                          : "bg-[#5865f2] text-white hover:bg-[#4752c4] shadow-lg shadow-[#5865f2]/20 hover:scale-105"
                      }`}
                    >
                      {isSubmitting ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <SendHorizontal className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Upcoming Today</h3>
              <button className="text-[var(--text-muted)] hover:text-white transition-colors">
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-lg">
              <div className="p-12 text-center">
                <p className="text-[var(--text-muted)] text-sm italic">Clear schedule!</p>
              </div>
              <div className="p-5 bg-[var(--bg-user-panel)] border-t border-[var(--border-color)]">
                <button className="w-full py-2.5 bg-[#5865f2] text-white rounded-lg font-bold text-xs hover:bg-[#4752c4] transition-all active:scale-95 shadow-lg shadow-[#5865f2]/20 uppercase tracking-widest">
                  OPEN SCHEDULE
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#5865f2]/10 to-transparent p-6 rounded-2xl border border-[#5865f2]/20">
              <h4 className="text-white text-xs font-black uppercase mb-2 tracking-widest">Learning Tip</h4>
              <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
                Try summarizing your notes within 24 hours to improve long-term retention. Use the Summary Pro plugin for a quick start!
              </p>
            </div>
          </section>
        </div>
      </main>

      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm" onClick={() => setShowSearch(false)}>
          <div className="bg-[var(--bg-primary)] rounded-xl w-full max-w-lg shadow-2xl border border-[var(--border-color)] overflow-hidden animate-zoom-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)]">
              <Search className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
              <input
                type="text"
                placeholder="Search all notes..."
                className="flex-1 bg-transparent text-white text-[15px] placeholder:text-[var(--text-muted)] outline-none"
                autoFocus
              />
              <kbd className="px-2 py-0.5 bg-[var(--bg-deep)] text-[var(--text-muted)] text-xs rounded border border-[var(--border-light)]">ESC</kbd>
            </div>
            <div className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">Type to search across all your notes</div>
          </div>
        </div>
      )}
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
    <div className="bg-[var(--bg-secondary)] p-6 rounded-xl border border-[var(--border-color)] flex items-center gap-4 hover:bg-[var(--bg-hover)] transition-colors shadow-md">
      <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20`, color }}>
        {icon}
      </div>
      <div>
        <p className="text-[var(--text-muted)] text-xs font-bold uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-white">{value}</p>
      </div>
    </div>
  );
}
