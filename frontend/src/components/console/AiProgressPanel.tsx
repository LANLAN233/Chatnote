import { useState, useEffect, useRef } from "react";
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

// ===================================================================
// Stage metadata: friendly name (no emoji) + description
// ===================================================================
interface StageMeta {
  name: string;
  description: string;
}

const STAGE_META: Record<string, StageMeta> = {
  parsing: {
    name: "解析输入",
    description: "正在分析你的输入内容，识别命令、技能或自然语言意图...",
  },
  skill_dispatch: {
    name: "调度技能",
    description: "正在将请求分发到对应的 AI 技能处理模块...",
  },
  skill_execution: {
    name: "技能执行",
    description: "AI 技能正在处理你的请求...",
  },
  context_loading: {
    name: "加载上下文",
    description: "正在从指定频道加载相关笔记作为 AI 参考上下文...",
  },
  intent_analysis: {
    name: "意图分析",
    description: "AI 正在分析你的输入意图，自动匹配最合适的处理方式...",
  },
  fallback: {
    name: "备用处理",
    description: "主流程未匹配，正在使用备用 AI 流程处理你的请求...",
  },
  fast_classification: {
    name: "快速分类",
    description: "正在用快速模型将笔记归类到合适的主题和频道...",
  },
  strong_review: {
    name: "深度复核",
    description: "快速分类置信度不足，正在用更强模型进行二次审核...",
  },
  classification_complete: {
    name: "分类完成",
    description: "笔记已自动归类到最匹配的主题和频道。",
  },
  tool_call: {
    name: "调用工具",
    description: "AI 正在搜索你的笔记知识库以获取准确信息...",
  },
  fetching_notes: {
    name: "获取笔记",
    description: "正在从知识库中提取今日笔记...",
  },
  extraction: {
    name: "知识提取",
    description: "AI 正在从笔记中提取关键知识点和概念...",
  },
  keywords: {
    name: "关键词关联",
    description: "正在为提取的知识点生成检索关键词...",
  },
  rerank: {
    name: "精准重排",
    description: "正在用语义模型重新排序候选笔记，选出最相关的内容...",
  },
  retrieval: {
    name: "智能检索",
    description: "正在从知识库中检索与问题最相关的笔记片段...",
  },
  answer_generation: {
    name: "生成回答",
    description: "正在基于检索到的笔记内容生成回答，并标注引用来源...",
  },
  summary: {
    name: "生成总结",
    description: "正在基于提取的知识生成今日学习总结...",
  },
};

// ===================================================================
// Model ID → user-friendly name mapping
// ===================================================================
const MODEL_FRIENDLY_NAMES: Record<string, string> = {
  "deepseek-v4-flash": "DeepSeek 快速模型",
  "deepseek-v4-pro": "DeepSeek 深度模型",
  "deepseek-v4": "DeepSeek 模型",
  "gpt-5.4-mini": "GPT 快速模型",
  "gpt-5.5": "GPT 深度模型",
  "kimi-k2.6": "Kimi 模型",
  "kimi-k2.5": "Kimi 快速模型",
  "glm-4.7": "智谱 GLM",
  "glm-4.7-flash": "智谱 GLM 快速",
  "glm-5": "智谱 GLM 深度",
  "glm-5.1": "智谱 GLM 深度",
  "glm-4.6v": "智谱 GLM 视觉",
  "qwen3.5-plus": "通义千问",
  "qwen3.5-flash": "通义千问 快速",
  "qwen3-max": "通义千问 深度",
  "qwen3.6-plus": "通义千问",
  "qwen3.7-max": "通义千问 深度",
  "qwen3-vl-plus": "通义千问 视觉",
  "mimo-v2.5": "MiMo 快速模型",
  "mimo-v2.5-pro": "MiMo 深度模型",
  "minimax-m2.5": "MiniMax 快速模型",
  "minimax-m2.7": "MiniMax 深度模型",
  "jina-reranker-v3": "Jina 语义排序",
  "text-embedding-3-small": "OpenAI 嵌入",
  mock: "模拟模型",
  system: "系统",
};

// ===================================================================
// Tier → Chinese label mapping
// ===================================================================
const TIER_LABELS: Record<string, string> = {
  fast: "快速",
  strong: "深度",
  primary: "主流程",
  fallback: "备用",
  system: "系统",
};

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatStatus(status: string, durationMs: number | null | undefined): string {
  switch (status) {
    case "completed":
      return `完成 (${formatDuration(durationMs)})`;
    case "in_progress":
      return "处理中...";
    case "pending":
      return "等待中";
    case "failed":
      return "失败";
    case "fallback":
      return "备用处理";
    case "skipped":
      return "已跳过";
    default:
      return status;
  }
}

function getFriendlyModel(model: string): string {
  if (!model) return "AI 模型";
  return MODEL_FRIENDLY_NAMES[model] || model;
}

function getFriendlyTier(tier: string): string {
  return TIER_LABELS[tier] || tier;
}

// ===================================================================
// Component
// ===================================================================
export default function AiProgressPanel({
  progress,
}: AiProgressPanelProps) {
  const [expanded, setExpanded] = useState(
    () => progress?.overall_status === "in_progress"
  );
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-collapse after 3s delay when completed/failed
  useEffect(() => {
    if (progress?.overall_status === "completed" || progress?.overall_status === "failed") {
      collapseTimerRef.current = setTimeout(() => {
        setExpanded(false);
      }, 3000);
    } else if (progress?.overall_status === "in_progress") {
      // Cancel any pending collapse timer and expand
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      setExpanded(true);
    }

    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, [progress?.overall_status]);

  if (!progress) return null;

  const { stages, current_stage, overall_status } = progress;
  const totalStages = stages.length;
  const currentStageIndex = Math.min(current_stage, totalStages - 1);
  const currentStage = stages[currentStageIndex];

  const overallIcon = STATUS_ICONS[overall_status] || STATUS_ICONS.pending;
  const overallColorClass =
    STATUS_COLORS[overall_status] || STATUS_COLORS.pending;

  const isInProgress = overall_status === "in_progress";
  const isCompleted = overall_status === "completed";
  const isFailed = overall_status === "failed";

  const completedCount = stages.filter((s) => s.status === "completed").length;
  const totalDurationMs = stages.reduce(
    (sum, s) => sum + (s.duration_ms || 0),
    0
  );

  // Summary text
  let summaryText: string;
  if (isCompleted) {
    summaryText = `已完成 ${completedCount}/${totalStages} 个步骤 · ${formatDuration(totalDurationMs)}`;
  } else if (isFailed) {
    summaryText = `处理失败 · 已完成 ${completedCount}/${totalStages} 个步骤`;
  } else if (currentStage) {
    const meta = STAGE_META[currentStage.stage];
    summaryText = meta?.description || currentStage.message || "正在处理...";
  } else {
    summaryText = "正在处理...";
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
          {isInProgress && (
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
          expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-3 pb-2 space-y-1">
          {stages.map((stage, idx) => {
            const isActive =
              idx === currentStageIndex && stage.status === "in_progress";
            const isFallback = stage.status === "fallback";
            const colorClass =
              STATUS_COLORS[stage.status] || STATUS_COLORS.pending;
            const icon = STATUS_ICONS[stage.status] || STATUS_ICONS.pending;
            const meta = STAGE_META[stage.stage];
            const displayName = meta ? meta.name : stage.stage;
            const description = meta?.description || "";
            const friendlyModel = getFriendlyModel(stage.model);
            const friendlyTier = stage.tier ? getFriendlyTier(stage.tier) : "";
            const hasModelInfo = stage.model !== "system" && stage.model !== "";
            const hasTierInfo = stage.tier && stage.tier !== "system" && stage.tier !== "";

            return (
              <div
                key={`${stage.stage}-${idx}`}
                className={`flex flex-col gap-1 py-1.5 border-b border-[#1e1f22] last:border-b-0 ${
                  isFallback ? "bg-[#fee75c]/10 rounded px-1 -mx-1" : ""
                }`}
                data-testid={`progress-step-${idx}`}
              >
                {/* Stage name + status */}
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs shrink-0 ${isActive ? "animate-pulse" : ""}`}
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                  <span
                    className={`text-xs font-medium flex-1 ${colorClass}`}
                  >
                    {displayName}
                  </span>
                  <span className="text-[10px] text-[#949ba4]">
                    {stage.status === "in_progress"
                      ? stage.message || "处理中..."
                      : formatStatus(stage.status, stage.duration_ms)}
                  </span>
                </div>

                {/* Description — shows what the AI is thinking */}
                {description && isInProgress && stage.status === "in_progress" && (
                  <div className="pl-5">
                    <span className="text-[10px] text-[#949ba4] italic">
                      {description}
                    </span>
                  </div>
                )}

                {/* Model + tier info row */}
                <div className="flex items-center gap-1 pl-5 flex-wrap">
                  <span className="text-[10px] text-[#72767d]">
                    {hasModelInfo ? friendlyModel : "AI 模型"}
                  </span>
                  {hasTierInfo && (
                    <>
                      <span className="text-[10px] text-[#72767d]">·</span>
                      <span className="text-[10px] text-[#72767d]">
                        {friendlyTier}
                      </span>
                    </>
                  )}
                  {stage.duration_ms != null && (
                    <>
                      <span className="text-[10px] text-[#72767d]">·</span>
                      <span className="text-[10px] text-[#72767d]">
                        {formatDuration(stage.duration_ms)}
                      </span>
                    </>
                  )}
                </div>

                {/* Progress bar */}
                {stage.progress_pct != null && (
                  <div className="pl-5 pr-1">
                    <div className="h-1.5 bg-[#1e1f22] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          stage.status === "completed"
                            ? "bg-[#23a559]"
                            : stage.status === "failed"
                              ? "bg-[#f23f43]"
                              : "bg-[#5865f2]"
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
