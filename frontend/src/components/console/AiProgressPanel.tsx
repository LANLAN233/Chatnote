import { useState, useEffect } from "react";
import type { AiProgressEvent } from "../../types";

interface AiProgressPanelProps {
  progress: AiProgressEvent | null;
  defaultExpanded?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  in_progress: "text-[#5865f2]",
  completed: "text-[#23a559]",
  failed: "text-[#f23f43]",
  fallback: "text-[#fee75c]",
  skipped: "text-[#949ba4]",
  pending: "text-[#949ba4]",
};

const STATUS_ICONS: Record<string, string> = {
  in_progress: "⏳",
  completed: "✅",
  failed: "❌",
  fallback: "⚠️",
  skipped: "⏭️",
  pending: "○",
};

/** Human-readable stage names for daily summary pipeline */
const STAGE_DISPLAY_NAMES: Record<string, string> = {
  fetching_notes: "📋 获取笔记",
  extraction: "🧠 知识提取",
  summary: "✍️ 生成总结",
  keywords: "🏷️ 关键词关联",
};

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AiProgressPanel({
  progress,
}: AiProgressPanelProps) {
  const [expanded, setExpanded] = useState(() => progress?.overall_status === "in_progress");

  useEffect(() => {
    if (progress?.overall_status === "completed" || progress?.overall_status === "failed") {
      setExpanded(false);
    }
  }, [progress?.overall_status]);

  if (!progress) return null;

  const { stages, current_stage, overall_status } = progress;
  const totalStages = stages.length;
  const currentStageIndex = Math.min(current_stage, totalStages - 1);
  const currentStage = stages[currentStageIndex];

  const overallIcon = STATUS_ICONS[overall_status] || STATUS_ICONS.pending;
  const overallColorClass = STATUS_COLORS[overall_status] || STATUS_COLORS.pending;

  const isInProgress = overall_status === "in_progress";
  const isCompleted = overall_status === "completed";
  const isFailed = overall_status === "failed";

  const completedCount = stages.filter((s) => s.status === "completed").length;
  const totalDurationMs = stages.reduce((sum, s) => sum + (s.duration_ms || 0), 0);

  let summaryText: string;
  if (isCompleted) {
    summaryText = `完成 — ${completedCount}/${totalStages} stages | ${formatDuration(totalDurationMs)}`;
  } else if (isFailed) {
    summaryText = `失败 — ${completedCount}/${totalStages} stages`;
  } else {
    summaryText = currentStage?.message || "Processing...";
  }

  return (
    <div className="bg-[#2b2d31] border border-[#1e1f22] rounded-md overflow-hidden">
      {/* Summary row / toggle */}
      <div data-testid="progress-summary">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#35373c] transition-colors"
          aria-expanded={expanded}
          data-testid="progress-toggle"
        >
        <span
          className={`text-sm shrink-0 ${isInProgress ? "animate-pulse" : ""}`}
          aria-hidden="true"
        >
          {overallIcon}
        </span>
        <span
          className={`text-xs font-medium flex-1 text-left truncate ${overallColorClass}`}
        >
          {summaryText}
        </span>
        {!(isCompleted || isFailed) && (
          <span className="text-[10px] text-[#949ba4] shrink-0">
            {currentStageIndex + 1}/{totalStages}
          </span>
        )}
          <span className="text-[10px] text-[#949ba4] shrink-0 ml-1">
            {expanded ? "▼" : "▶"}
          </span>
        </button>
      </div>

      {/* Expanded step list */}
      <div
        className={`overflow-hidden transition-all duration-300 ${
          expanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-3 pb-2 space-y-1">
          {stages.map((stage, idx) => {
            const isActive = idx === currentStageIndex && stage.status === "in_progress";
            const isFallback = stage.status === "fallback";
            const colorClass = STATUS_COLORS[stage.status] || STATUS_COLORS.pending;
            const icon = STATUS_ICONS[stage.status] || STATUS_ICONS.pending;
            const displayName = STAGE_DISPLAY_NAMES[stage.stage] || stage.stage;
            const modelLabel = stage.model && stage.model !== "system"
              ? stage.model
              : null;

            return (
              <div
                key={`${stage.stage}-${idx}`}
                className={`flex flex-col gap-0.5 py-1.5 border-b border-[#1e1f22] last:border-b-0 ${
                  isFallback ? "bg-[#fee75c]/10 rounded px-1 -mx-1" : ""
                }`}
                data-testid={`progress-step-${idx}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs shrink-0 ${isActive ? "animate-pulse" : ""}`}
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                  <span className={`text-xs font-medium flex-1 ${colorClass}`}>
                    {displayName}
                  </span>
                  <span className="text-[10px] text-[#949ba4]">
                    {stage.status === "completed"
                      ? `Done (${formatDuration(stage.duration_ms)})`
                      : stage.status === "in_progress"
                      ? stage.message
                      : stage.status === "pending"
                      ? "Pending"
                      : stage.status === "failed"
                      ? "Failed"
                      : stage.status === "fallback"
                      ? "Fallback"
                      : "Skipped"}
                  </span>
                </div>
                {/* Model info row — show during in_progress too, not just completed */}
                {modelLabel && (
                  <div className="flex items-center gap-1 pl-5">
                    <span className="text-[10px] text-[#949ba4]">
                      Model: {modelLabel}
                    </span>
                    {stage.tier && stage.tier !== "system" && (
                      <>
                        <span className="text-[10px] text-[#949ba4]">|</span>
                        <span className="text-[10px] text-[#949ba4]">
                          Tier: {stage.tier}
                        </span>
                      </>
                    )}
                    {stage.duration_ms != null && (
                      <>
                        <span className="text-[10px] text-[#949ba4]">|</span>
                        <span className="text-[10px] text-[#949ba4]">
                          {formatDuration(stage.duration_ms)}
                        </span>
                      </>
                    )}
                  </div>
                )}
                {/* Progress bar — shown when progress_pct is set */}
                {stage.progress_pct != null && (
                  <div className="pl-5 pr-1">
                    <div className="h-1.5 bg-[#1e1f22] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          stage.status === "completed" ? "bg-[#23a559]" :
                          stage.status === "failed" ? "bg-[#f23f43]" :
                          "bg-[#5865f2]"
                        }`}
                        style={{ width: `${stage.progress_pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
