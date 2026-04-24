import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  BookOpen, Clock, Target, ArrowRight, Star, Hash, SendHorizontal, Zap, CalendarDays
} from "lucide-react";
import { statsApi, aiApi, scheduleApi } from "../../services";
import { useServerStore, useChannelStore } from "../../stores";
import SearchModal from "../search/SearchModal";
import HomeConsolePanel from "./HomeConsolePanel";
import ScheduleImportPanel from "./ScheduleImportPanel";
import type { StatsData, SmartCreateResult, Schedule, Note } from "../../types";

interface OutletContext {
  homeTab: "overview" | "console" | "import";
}

function OverviewTab() {
  const navigate = useNavigate();
  const { fetchServers } = useServerStore();
  const { fetchChannels } = useChannelStore();
  const [quickNote, setQuickNote] = useState("");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadStats = useCallback(async () => {
    if (!localStorage.getItem("token")) return;
    try {
      const { data } = await statsApi.get();
      if (data.data) setStats(data.data as StatsData);
    } catch {}
  }, []);

  const loadTodaySchedules = useCallback(async () => {
    if (!localStorage.getItem("token")) return;
    try {
      const data = await scheduleApi.getTodaySchedules();
      setTodaySchedules(data || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadStats();
    loadTodaySchedules();
  }, [loadStats, loadTodaySchedules]);

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
      loadTodaySchedules();
      await fetchServers();
      if (result.server_id) {
        await fetchChannels(result.server_id);
      }
    } catch {
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQuickSubmit();
    }
  };

  const handleNoteClick = (note: Note) => {
    setShowSearch(false);
    navigate(`/server/0/channel/${note.channel_id}`);
  };

  const recentNotes = stats?.recent_notes || [];
  const totalNotes = stats?.total_notes ?? 0;

  const formatScheduleTime = (schedule: Schedule) => {
    if (schedule.is_all_day) return "全天";
    const start = schedule.start_time.slice(0, 5);
    const end = schedule.end_time ? schedule.end_time.slice(0, 5) : null;
    return end ? `${start} - ${end}` : start;
  };

  return (
    <>
      {/* Header */}
      <header className="h-48 bg-[#1e1f22] relative flex items-center px-12 overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#5865f2] rounded-full blur-[100px] -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#23a559] rounded-full blur-[80px] -ml-32 -mb-32" />
        </div>
        <div className="z-10 w-full max-w-4xl">
          <h1 className="text-3xl font-black text-white mb-2 italic tracking-tight">WELCOME BACK, SCHOLAR.</h1>
          <p className="text-[#b5bac1] text-lg mb-6">
            You've captured <span className="text-[#5865f2] font-bold">{totalNotes}</span> notes this week. Ready to learn more?
          </p>
          <div className="relative max-w-xl">
            <input
              type="text"
              placeholder="Search your knowledge base..."
              className="w-full bg-[#313338] text-white px-4 py-3 rounded-lg outline-none border border-transparent focus:border-[#5865f2] transition-all shadow-xl placeholder-[#949ba4]"
              onFocus={() => setShowSearch(true)}
              readOnly
            />
            <kbd className="absolute right-3 top-3 px-2 py-0.5 bg-[#1e1f22] text-[#949ba4] text-xs rounded border border-[#3f4147]">Ctrl + K</kbd>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Stats */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#2b2d31] p-6 rounded-xl border border-[#1e1f22] flex items-center gap-4 hover:bg-[#35373c] transition-colors shadow-md">
            <div className="w-12 h-12 bg-[#5865f2]/20 rounded-lg flex items-center justify-center text-[#5865f2]">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-[#949ba4] text-xs font-bold uppercase tracking-wider">Total Notes</p>
              <p className="text-2xl font-black text-white">{totalNotes}</p>
            </div>
          </div>
          <div className="bg-[#2b2d31] p-6 rounded-xl border border-[#1e1f22] flex items-center gap-4 hover:bg-[#35373c] transition-colors shadow-md">
            <div className="w-12 h-12 bg-[#23a559]/20 rounded-lg flex items-center justify-center text-[#23a559]">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[#949ba4] text-xs font-bold uppercase tracking-wider">Study Streak</p>
              <p className="text-2xl font-black text-white">12 Days</p>
            </div>
          </div>
          <div className="bg-[#2b2d31] p-6 rounded-xl border border-[#1e1f22] flex items-center gap-4 hover:bg-[#35373c] transition-colors shadow-md">
            <div className="w-12 h-12 bg-[#f23f43]/20 rounded-lg flex items-center justify-center text-[#f23f43]">
              <Target size={24} />
            </div>
            <div>
              <p className="text-[#949ba4] text-xs font-bold uppercase tracking-wider">Next Goal</p>
              <p className="text-2xl font-black text-white">Finals prep</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main column */}
          <section className="lg:col-span-2 space-y-8 flex flex-col">
            {/* Recent Activity */}
            {recentNotes.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <Star size={18} className="text-yellow-400" /> Recent Activity
                  </h3>
                  <button className="text-[#5865f2] text-xs font-bold hover:underline flex items-center gap-1">
                    View all <ArrowRight size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentNotes.slice(0, 4).map((note) => (
                    <div
                      key={note.id}
                      onClick={() => handleNoteClick(note)}
                      className="bg-[#2b2d31] p-5 rounded-xl border border-[#1e1f22] hover:border-[#5865f2] transition-all cursor-pointer group shadow-sm"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div className="bg-[#1e1f22] p-1.5 rounded-lg">
                          <Hash size={14} className="text-[#5865f2]" />
                        </div>
                        <span className="text-[11px] font-black text-[#949ba4] uppercase tracking-tighter">ch#{note.channel_id}</span>
                      </div>
                      <p className="text-[#dbdee1] text-sm line-clamp-2 mb-4 group-hover:text-white transition-colors leading-relaxed">
                        {note.content}
                      </p>
                      <div className="flex items-center justify-between border-t border-[#1e1f22] pt-3">
                        <span className="text-[10px] text-[#949ba4] font-bold">
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>
                        <ArrowRight size={12} className="text-[#949ba4] opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recentNotes.length === 0 && (
              <div className="py-16 flex flex-col items-center justify-center bg-[#2b2d31]/50 rounded-2xl border-2 border-dashed border-[#1e1f22]">
                <p className="text-[#949ba4] text-sm italic">No activity yet. Use the console below to start!</p>
              </div>
            )}

            {/* Quick Capture */}
            <div className="bg-[#2b2d31] p-6 rounded-2xl border border-[#5865f2]/30 shadow-[0_0_20px_rgba(88,101,242,0.1)] relative overflow-hidden group mt-auto">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Zap size={64} className="text-[#5865f2]" />
              </div>
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Zap size={18} className="text-[#5865f2]" /> Command Console: Quick Capture
              </h3>
              <form onSubmit={handleQuickSubmit} className="space-y-4">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Capture a thought, schedule a class, or solve a math problem... (Use @Server #Channel for manual tagging)"
                    className="w-full bg-[#1e1f22] text-[#dbdee1] p-4 rounded-xl border border-[#3f4147] outline-none focus:border-[#5865f2] transition-all resize-none h-48 placeholder-[#949ba4]"
                  />
                  <div className="absolute bottom-4 right-4 flex items-center gap-3">
                    <span className="text-[10px] text-[#949ba4] font-medium hidden md:inline-block">Press Enter to Submit</span>
                    <button
                      type="submit"
                      disabled={!quickNote.trim() || isSubmitting}
                      className={`p-3 rounded-xl transition-all ${
                        !quickNote.trim() || isSubmitting
                          ? "bg-[#4f545c] text-gray-500"
                          : "bg-[#5865f2] text-white hover:bg-[#4752c4] shadow-lg shadow-[#5865f2]/20 hover:scale-105"
                      }`}
                    >
                      {isSubmitting ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <SendHorizontal size={24} />
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>

          {/* Right sidebar */}
          <section className="space-y-4">
            {/* Upcoming Today */}
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Upcoming Today</h3>
              <button
                onClick={() => navigate("/calendar")}
                className="text-[#949ba4] hover:text-white transition-colors"
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <div className="bg-[#2b2d31] rounded-2xl border border-[#1e1f22] overflow-hidden shadow-lg">
              {todaySchedules.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-[#949ba4] text-sm italic">Clear schedule!</p>
                </div>
              ) : (
                <div>
                  {todaySchedules.slice(0, 3).map((schedule, idx) => (
                    <div
                      key={schedule.id}
                      className={`p-4 flex items-center justify-between group hover:bg-[#35373c] transition-colors ${idx !== 0 ? "border-t border-[#1e1f22]" : ""}`}
                    >
                      <div>
                        <p className="text-white font-bold text-sm">{schedule.title}</p>
                        <p className="text-[#949ba4] text-xs font-medium">{formatScheduleTime(schedule)}</p>
                      </div>
                      <div
                        className="w-2 h-2 rounded-full group-hover:scale-150 transition-transform shadow-[0_0_8px_rgba(35,165,89,0.5)]"
                        style={{ backgroundColor: schedule.color || "#23a559" }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="p-5 bg-[#232428] border-t border-[#1e1f22]">
                <button
                  onClick={() => navigate("/calendar")}
                  className="w-full py-2.5 bg-[#5865f2] text-white rounded-lg font-bold text-xs hover:bg-[#4752c4] transition-all active:scale-95 shadow-lg shadow-[#5865f2]/20 uppercase tracking-widest"
                >
                  OPEN SCHEDULE
                </button>
              </div>
            </div>

            {/* Learning Tip */}
            <div className="bg-gradient-to-br from-[#5865f2]/10 to-transparent p-6 rounded-2xl border border-[#5865f2]/20">
              <h4 className="text-white text-xs font-black uppercase mb-2 tracking-widest">Learning Tip</h4>
              <p className="text-[#b5bac1] text-xs leading-relaxed">
                Try summarizing your notes within 24 hours to improve long-term retention. Use the Summary Pro plugin for a quick start!
              </p>
            </div>
          </section>
        </div>
      </main>

      {showSearch && <SearchModal onClose={() => setShowSearch(false)} onNoteClick={handleNoteClick} />}
    </>
  );
}

export default function HomePage() {
  const { homeTab } = useOutletContext<OutletContext>();

  return (
    <div className="flex-1 bg-[#313338] flex flex-col h-full overflow-hidden">
      {homeTab === "overview" && <OverviewTab />}
      {homeTab === "console" && <HomeConsolePanel />}
      {homeTab === "import" && <ScheduleImportPanel />}
    </div>
  );
}
