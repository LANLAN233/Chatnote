import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  BookOpen, Clock, ArrowRight, Star, Hash, Zap,
  Flame, TrendingUp, Tag, Inbox, Loader2, Sparkles, RefreshCw
} from "lucide-react";
import { statsApi, aiApi, scheduleApi, inboxApi } from "../../services";
import { useServerStore, useChannelStore } from "../../stores";
import SearchModal from "../search/SearchModal";
import HomeConsolePanel from "./HomeConsolePanel";
import ScheduleImportPanel from "./ScheduleImportPanel";
import HomeInboxPanel from "./HomeInboxPanel";
import SmartInput from "../common/SmartInput";
import type { StatsData, SmartCreateResult, Schedule, Note } from "../../types";

interface OutletContext {
  homeTab: "overview" | "console" | "import" | "inbox";
}

/* ------------------------------------------------------------------ */
/*  Mini Trend Chart (pure CSS)                                       */
/* ------------------------------------------------------------------ */
function MiniTrendChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-8 mt-2">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 bg-[#5865f2]/60 rounded-t-sm hover:bg-[#5865f2] transition-colors relative group"
          style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 2 }}
          title={`${d.date}: ${d.count}`}
        >
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-[#1e1f22] text-[10px] text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
            {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Heatmap (pure CSS, last 30 days)                                  */
/* ------------------------------------------------------------------ */
function Heatmap() {
  const days = useMemo(() => {
    const arr = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      // Random activity for demo; will be replaced by real data later
      const intensity = Math.random();
      arr.push({ date: d.toISOString().slice(0, 10), intensity });
    }
    return arr;
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-white text-xs font-black uppercase tracking-widest">学习热力图</h4>
        <span className="text-[10px] text-[#949ba4]">近30天</span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {days.map((d) => (
          <div
            key={d.date}
            className="aspect-square rounded-[2px] transition-colors hover:ring-1 hover:ring-white/30"
            style={{
              backgroundColor:
                d.intensity > 0.7 ? "#5865f2" :
                d.intensity > 0.4 ? "#5865f2aa" :
                d.intensity > 0.1 ? "#5865f255" : "#2b2d31",
            }}
            title={d.date}
          />
        ))}
      </div>
      <div className="flex items-center justify-end gap-1">
        <span className="text-[9px] text-[#949ba4]">Less</span>
        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#2b2d31]" />
        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#5865f255]" />
        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#5865f2aa]" />
        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#5865f2]" />
        <span className="text-[9px] text-[#949ba4]">More</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Schedule Countdown                                                */
/* ------------------------------------------------------------------ */
function ScheduleCountdown({ schedules }: { schedules: Schedule[] }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const upcoming = useMemo(() => {
    const todayStr = now.toISOString().slice(0, 10);
    return schedules
      .filter((s) => {
        if (s.date && s.date !== todayStr) return false;
        const [h, m] = s.start_time.split(":").map(Number);
        const start = new Date();
        start.setHours(h, m, 0, 0);
        return start > now;
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  }, [schedules, now]);

  if (!upcoming) return null;

  const [h, m] = upcoming.start_time.split(":").map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const diffMs = start.getTime() - now.getTime();
  const diffMin = Math.max(0, Math.ceil(diffMs / 60000));

  return (
    <div className="bg-gradient-to-r from-[#f23f43]/10 to-transparent p-3 rounded-lg border border-[#f23f43]/20 flex items-center gap-3">
      <Clock size={16} className="text-[#f23f43] shrink-0" />
      <div>
        <p className="text-white text-xs font-bold">{upcoming.title}</p>
        <p className="text-[#f23f43] text-[11px] font-black">
          还有 {diffMin} 分钟开始
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview Tab                                                      */
/* ------------------------------------------------------------------ */
function OverviewTab() {
  const navigate = useNavigate();
  const { fetchServers } = useServerStore();
  const { fetchChannels } = useChannelStore();
  const [quickNote, setQuickNote] = useState("");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);

  const [dailySummary, setDailySummary] = useState<{
    summary: string;
    keywords: Array<{ keyword: string; note_ids: number[] }>;
    total_notes: number;
    highlight_note_id: number | null;
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

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

  const loadDailySummary = useCallback(async () => {
    if (!localStorage.getItem("token")) return;
    setSummaryLoading(true);
    try {
      const { data } = await statsApi.getDailySummary?.() ?? { data: null };
      if (data?.data) setDailySummary(data.data as typeof dailySummary);
    } catch {
      // silent
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadTodaySchedules();
    loadDailySummary();
  }, [loadStats, loadTodaySchedules, loadDailySummary]);

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
      const text = quickNote.trim();
      const hasTarget = /(^|\s)@[^\s#]+/.test(text) || /(^|\s)#[^\s]+/.test(text);
      if (hasTarget) {
        const res = await aiApi.smartCreate(text, true);
        const result = res.data.data as SmartCreateResult;
        await fetchServers();
        if (result.server_id) {
          await fetchChannels(result.server_id);
        }
      } else {
        await inboxApi.create({ content: text, raw_input: text });
      }
      setQuickNote("");
      loadStats();
      loadTodaySchedules();
    } catch {
      // silent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNoteClick = (note: Note) => {
    setShowSearch(false);
    navigate(`/server/0/channel/${note.channel_id}`);
  };

  const recentNotes = stats?.recent_notes || [];
  const totalNotes = stats?.total_notes ?? 0;
  const studyStreak = stats?.study_streak ?? 0;
  const weeklyTrend = stats?.weekly_trend || [];
  const serverDistribution = stats?.server_distribution || [];
  const topTags = stats?.top_tags || [];
  const inboxPending = stats?.inbox_pending_count ?? 0;

  // Suggestions for SmartInput
  const servers = useServerStore((s) => s.servers);
  const channels = useChannelStore((s) => s.channels);
  const getSuggestions = useCallback((filter: string, type: string): string[] => {
    const f = filter.toLowerCase();
    let items: string[] = [];
    switch (type) {
      case "server":
        items = servers.filter((s) => s.name.toLowerCase().includes(f)).map((s) => s.name);
        break;
      case "channel":
        items = channels.filter((c) => c.name.toLowerCase().includes(f)).map((c) => c.name);
        break;
      case "skill":
        items = ["summarize", "translate", "explain", "ask", "todo", "schedule", "math"].filter((s) => s.includes(f));
        break;
      case "command":
        items = ["help", "clear", "search", "todo", "today", "stats", "plugins", "calc"].filter((c) => c.includes(f));
        break;
      default:
        items = [];
    }
    return items.sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(f);
      const bStarts = b.toLowerCase().startsWith(f);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    });
  }, [servers, channels]);

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
            <div className="flex-1">
              <p className="text-[#949ba4] text-xs font-bold uppercase tracking-wider">Total Notes</p>
              <p className="text-2xl font-black text-white">{totalNotes}</p>
              <MiniTrendChart data={weeklyTrend} />
            </div>
          </div>
          <div className="bg-[#2b2d31] p-6 rounded-xl border border-[#1e1f22] flex items-center gap-4 hover:bg-[#35373c] transition-colors shadow-md">
            <div className="w-12 h-12 bg-[#23a559]/20 rounded-lg flex items-center justify-center text-[#23a559]">
              <Flame size={24} />
            </div>
            <div>
              <p className="text-[#949ba4] text-xs font-bold uppercase tracking-wider">Study Streak</p>
              <p className="text-2xl font-black text-white">{studyStreak} Days</p>
              <p className="text-[10px] text-[#949ba4] mt-1">
                {studyStreak > 0 ? "Keep the fire burning!" : "Start today!"}
              </p>
            </div>
          </div>
          <div className="bg-[#2b2d31] p-6 rounded-xl border border-[#1e1f22] flex items-center gap-4 hover:bg-[#35373c] transition-colors shadow-md">
            <div className="w-12 h-12 bg-[#f23f43]/20 rounded-lg flex items-center justify-center text-[#f23f43]">
              <Inbox size={24} />
            </div>
            <div>
              <p className="text-[#949ba4] text-xs font-bold uppercase tracking-wider">Inbox</p>
              <p className="text-2xl font-black text-white">{inboxPending}</p>
              <p className="text-[10px] text-[#949ba4] mt-1">
                {inboxPending > 0 ? "waiting to be sorted" : "all caught up"}
              </p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main column */}
          <section className="lg:col-span-2 space-y-8 flex flex-col">
            {/* Server Distribution & Top Tags */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#2b2d31] p-5 rounded-xl border border-[#1e1f22]">
                <h4 className="text-white text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                  <TrendingUp size={14} className="text-[#5865f2]" /> 伺服器分布
                </h4>
                {serverDistribution.length > 0 ? (
                  <div className="space-y-2">
                    {serverDistribution.slice(0, 5).map((s) => (
                      <div key={s.server_name} className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-[#1e1f22] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#5865f2] rounded-full"
                            style={{
                              width: `${(s.note_count / (serverDistribution[0]?.note_count || 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-[#949ba4] w-20 text-right truncate">{s.server_name}</span>
                        <span className="text-[10px] text-white font-bold w-6 text-right">{s.note_count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#949ba4] text-xs italic">No data yet</p>
                )}
              </div>
              <div className="bg-[#2b2d31] p-5 rounded-xl border border-[#1e1f22]">
                <h4 className="text-white text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Tag size={14} className="text-[#23a559]" /> 热门标签
                </h4>
                {topTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {topTags.map((t) => (
                      <span
                        key={t.tag}
                        className="text-xs bg-[#1e1f22] text-[#b5bac1] px-2.5 py-1 rounded-full border border-[#3f4147] hover:border-[#5865f2]/50 transition-colors cursor-pointer"
                      >
                        {t.tag} <span className="text-[#949ba4]">({t.count})</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#949ba4] text-xs italic">No tags yet</p>
                )}
              </div>
            </div>

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
            <div className="bg-[#2b2d31] p-6 rounded-2xl border border-[#5865f2]/30 shadow-[0_0_20px_rgba(88,101,242,0.1)] relative group mt-auto">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Zap size={64} className="text-[#5865f2]" />
              </div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <Zap size={18} className="text-[#5865f2]" /> 快速控制台
                </h3>
              </div>
              <SmartInput
                value={quickNote}
                onChange={setQuickNote}
                onSubmit={() => handleQuickSubmit()}
                getSuggestions={getSuggestions}
                placeholder="输入内容，使用 @Server #Channel 直接归档到指定位置，未指定则进入白板待分类..."
                loading={isSubmitting}
                rows={6}
              />
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
              <ScheduleCountdown schedules={todaySchedules} />
              <div className="p-5 bg-[#232428] border-t border-[#1e1f22]">
                <button
                  onClick={() => navigate("/calendar")}
                  className="w-full py-2.5 bg-[#5865f2] text-white rounded-lg font-bold text-xs hover:bg-[#4752c4] transition-all active:scale-95 shadow-lg shadow-[#5865f2]/20 uppercase tracking-widest"
                >
                  OPEN SCHEDULE
                </button>
              </div>
            </div>

            {/* Daily Summary */}
            <div className="bg-[#2b2d31] p-5 rounded-2xl border border-[#1e1f22]">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <Sparkles size={14} className="text-yellow-400" /> 每日总结
                </h4>
                <button
                  onClick={loadDailySummary}
                  disabled={summaryLoading}
                  className="text-[#949ba4] hover:text-white transition-colors"
                  title="重新生成"
                >
                  <RefreshCw size={12} className={summaryLoading ? "animate-spin" : ""} />
                </button>
              </div>
              {summaryLoading ? (
                <div className="flex items-center justify-center py-4 text-[#949ba4]">
                  <Loader2 size={16} className="animate-spin mr-2" /> 生成中...
                </div>
              ) : dailySummary ? (
                <div className="space-y-3">
                  <p className="text-[#dbdee1] text-xs leading-relaxed">{dailySummary.summary}</p>
                  {dailySummary.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {dailySummary.keywords.map((k) => (
                        <button
                          key={k.keyword}
                          onClick={() => {
                            if (k.note_ids.length > 0) {
                              navigate(`/server/0/channel/0?highlight=${encodeURIComponent(k.keyword)}`);
                            }
                          }}
                          className="text-[10px] bg-[#5865f2]/20 text-[#5865f2] px-2 py-0.5 rounded-full hover:bg-[#5865f2]/30 transition-colors font-bold"
                        >
                          {k.keyword}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-[#949ba4]">基于 {dailySummary.total_notes} 条笔记</p>
                </div>
              ) : (
                <p className="text-[#949ba4] text-xs italic">暂无总结数据</p>
              )}
            </div>

            {/* Heatmap */}
            <div className="bg-[#2b2d31] p-5 rounded-2xl border border-[#1e1f22]">
              <Heatmap />
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
      {homeTab === "inbox" && <HomeInboxPanel />}
      {homeTab === "console" && <HomeConsolePanel />}
      {homeTab === "import" && <ScheduleImportPanel />}
    </div>
  );
}
