import React, { useCallback, useEffect, useRef, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileDown,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { statsApi, dailySummaryApi } from "../../services";
import type { DailySummaryResponse } from "../../types";
import "@uiw/react-md-editor/markdown-editor.css";

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  extraction: "提取知识点",
  summary: "生成总结",
  keywords: "关联关键词",
};

function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export default function DailySummaryPage() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(getTodayISO);
  const [summary, setSummary] = useState<DailySummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [showStages, setShowStages] = useState(false);
  const [historyDates, setHistoryDates] = useState<Set<string>>(new Set());
  const [showSlowMsg, setShowSlowMsg] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSlowTimer = useCallback(() => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
    setShowSlowMsg(false);
  }, []);

  const loadSummary = useCallback(
    async (date: string) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setSummary(null);
      clearSlowTimer();
      slowTimerRef.current = setTimeout(() => {
        setShowSlowMsg(true);
      }, 30000);

      try {
        const response = await statsApi.getDailySummary(date, controller.signal);
        if (controller.signal.aborted) return;

        const data = response.data.data;
        if (data) {
          setSummary(data);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          console.error("[DailySummary] loadSummary failed:", e);
        }
      } finally {
        clearSlowTimer();
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [clearSlowTimer]
  );

  const loadHistoryDates = useCallback(async (date: string) => {
    try {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = d.getMonth();
      const from = new Date(year, month, 1).toISOString().split("T")[0];
      const to = new Date(year, month + 1, 0).toISOString().split("T")[0];
      const response = await dailySummaryApi.getHistory(from, to);
      const items = response.data.data;
      const dates = new Set(items ? items.map((item) => item.date) : []);
      setHistoryDates(dates);
    } catch (e) {
      console.error("[DailySummary] loadHistoryDates failed:", e);
    }
  }, []);

  useEffect(() => {
    loadSummary(selectedDate);
    loadHistoryDates(selectedDate);
  }, [selectedDate, loadSummary, loadHistoryDates]);

  useEffect(() => {
    return () => {
      clearSlowTimer();
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [clearSlowTimer]);

  const handleGenerate = async () => {
    setLoading(true);
    setShowStages(false);
    clearSlowTimer();
    slowTimerRef.current = setTimeout(() => {
      setShowSlowMsg(true);
    }, 30000);
    try {
      const response = await dailySummaryApi.regenerate(selectedDate);
      setSummary(response.data.data);
    } catch {
      // silent
    } finally {
      clearSlowTimer();
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (summary) {
      setEditText(summary.summary);
      setEditing(true);
    }
  };

  const handleSave = async () => {
    if (!editText.trim()) return;
    setLoading(true);
    try {
      const response = await dailySummaryApi.update(selectedDate, editText);
      setSummary(response.data.data);
      setEditing(false);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    if (summary) {
      setEditText(summary.summary);
    } else {
      setEditText("");
    }
  };

  const handleExportMarkdown = async () => {
    try {
      const response = await dailySummaryApi.exportMarkdown(selectedDate);
      const blob = response.data as Blob;
      downloadBlob(blob, `每日总结-${selectedDate}.md`);
    } catch {
      // silent
    }
  };

  const handleExportPdf = async () => {
    try {
      const response = await dailySummaryApi.exportPdf(selectedDate);
      const blob = response.data as Blob;
      downloadBlob(blob, `每日总结-${selectedDate}.pdf`);
    } catch {
      // silent
    }
  };

  const hasNoNotes = summary !== null && summary.total_notes === 0;
  const hasSummary = summary !== null && summary.total_notes > 0;

  return (
    <div className="min-h-screen bg-[#313338] text-[#dbdee1] p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Sparkles size={20} className="text-yellow-400" />
            每日总结
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-[#1e1f22] text-[#dbdee1] border border-[#1e1f22] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#5865f2] [color-scheme:dark]"
            />
            {historyDates.has(selectedDate) && (
              <span className="text-[10px] bg-[#23a559]/20 text-[#23a559] px-2 py-0.5 rounded-full font-bold">
                已保存
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-1.5 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {summary ? "重新生成" : "生成总结"}
          </button>
          {hasSummary && (
            <>
              <button
                onClick={handleEdit}
                disabled={loading || editing}
                className="flex items-center gap-1.5 bg-[#2b2d31] hover:bg-[#383a40] disabled:opacity-50 text-[#dbdee1] text-xs font-bold px-3 py-2 rounded-lg transition-colors border border-[#1e1f22] cursor-pointer"
              >
                <Edit3 size={14} />
                编辑
              </button>
              <button
                onClick={handleExportMarkdown}
                className="flex items-center gap-1.5 bg-[#2b2d31] hover:bg-[#383a40] text-[#dbdee1] text-xs font-bold px-3 py-2 rounded-lg transition-colors border border-[#1e1f22] cursor-pointer"
              >
                <FileText size={14} />
                导出 Markdown
              </button>
              <button
                onClick={handleExportPdf}
                className="flex items-center gap-1.5 bg-[#2b2d31] hover:bg-[#383a40] text-[#dbdee1] text-xs font-bold px-3 py-2 rounded-lg transition-colors border border-[#1e1f22] cursor-pointer"
              >
                <FileDown size={14} />
                导出 PDF
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div className="bg-[#2b2d31] rounded-2xl border border-[#1e1f22] overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#949ba4] space-y-2">
              <div className="flex items-center">
                <Loader2 size={20} className="animate-spin mr-2" />
                加载中...
              </div>
              {showSlowMsg && (
                <p className="text-xs text-[#949ba4]">
                  加载时间较长，请耐心等待...
                </p>
              )}
            </div>
          ) : editing ? (
            <div className="p-4" data-color-mode="dark">
              <MDEditor
                value={editText}
                onChange={(val) => setEditText(val || "")}
                height={400}
              />
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 bg-[#2b2d31] hover:bg-[#383a40] text-[#dbdee1] text-xs font-bold px-3 py-2 rounded-lg transition-colors border border-[#1e1f22] cursor-pointer"
                >
                  <X size={14} />
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  <Check size={14} />
                  保存
                </button>
              </div>
            </div>
          ) : hasSummary ? (
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[10px] text-[#949ba4]">
                  基于 {summary.total_notes} 条笔记
                </p>
                {summary.is_edited && (
                  <span className="text-[10px] bg-[#5865f2]/20 text-[#5865f2] px-2 py-0.5 rounded-full font-bold">
                    已编辑
                  </span>
                )}
              </div>
              <p className="text-[#dbdee1] text-sm leading-relaxed whitespace-pre-wrap">
                {summary.summary}
              </p>
              {summary.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {summary.keywords.map((k) => (
                    <button
                      key={k.keyword}
                      onClick={() => {
                        if (k.note_ids.length > 0) {
                          navigate(
                            `/server/0/channel/0?highlight=${encodeURIComponent(k.keyword)}`
                          );
                        }
                      }}
                      className="text-[10px] bg-[#5865f2]/20 text-[#5865f2] px-2 py-0.5 rounded-full hover:bg-[#5865f2]/30 transition-colors font-bold cursor-pointer"
                    >
                      {k.keyword}
                    </button>
                  ))}
                </div>
              )}
              {summary.stages && summary.stages.length > 0 && (
                <>
                  <button
                    onClick={() => setShowStages(!showStages)}
                    className="flex items-center gap-1.5 text-[10px] text-[#949ba4] hover:text-white transition-colors font-bold cursor-pointer"
                  >
                    {showStages ? (
                      <ChevronUp size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                    {showStages ? "收起详情" : "展开详情"}
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      showStages ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="pt-1 space-y-0">
                      {summary.stages.map((stage) => (
                        <div
                          key={stage.name}
                          className="flex items-center gap-2 py-2 border-b border-[#1e1f22] last:border-b-0"
                        >
                          {stage.status === "completed" ? (
                            <Check size={14} className="text-[#23a559] shrink-0" />
                          ) : (
                            <X size={14} className="text-[#f23f43] shrink-0" />
                          )}
                          <span
                            className={`text-xs font-bold flex-1 ${
                              stage.status === "completed"
                                ? "text-[#23a559]"
                                : "text-[#f23f43]"
                            }`}
                          >
                            {STAGE_DISPLAY_NAMES[stage.name] || stage.name}
                          </span>
                          <span className="text-[10px] text-[#949ba4]">
                            {stage.duration_ms}ms
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : hasNoNotes ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#949ba4] space-y-3">
              <FileText size={32} className="opacity-50" />
              <p className="text-sm">该日期无笔记记录</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[#949ba4] space-y-4">
              <Sparkles size={32} className="opacity-50" />
              <p className="text-sm">暂无总结，点击生成</p>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1.5 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                生成总结
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
