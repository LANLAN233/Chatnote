import { useState } from "react";
import type { AiProgressStage } from "../../types";

const ICONS: Record<string, string> = {
  in_progress: "⏳",
  completed: "✅",
  failed: "❌",
  fallback: "⚠️",
  skipped: "⏭️",
  pending: "○",
};

const COLORS: Record<string, string> = {
  in_progress: "text-[#5865f2]",
  completed: "text-[#23a559]",
  failed: "text-[#f23f43]",
  fallback: "text-[#fee75c]",
  skipped: "text-[#949ba4]",
  pending: "text-[#949ba4]",
};

function stageLabel(name: string): string {
  const map: Record<string, string> = {
    retrieval: "检索",
    answer_generation: "回答生成",
  };
  return map[name] || name;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface AgentConversationProps {
  stages: AiProgressStage[];
}

export default function AgentConversation({ stages }: AgentConversationProps) {
  const [expanded, setExpanded] = useState(false);

  if (!stages || stages.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="agent-conversation"
      className="border border-[#3f4147] bg-[#1e1f22] rounded-lg overflow-hidden"
    >
      {/* Title bar — clickable toggle */}
      <button
        type="button"
        data-testid="agent-conversation-toggle"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#2b2d31]"
      >
        <span className="text-[#b5bac8]">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="text-sm text-[#dbdee1] font-medium">
          Agent Conversation
        </span>
        <span className="text-[10px] text-[#949ba4]">
          {stages.length} stages
        </span>
      </button>

      {/* Collapsible body */}
      <div
        data-testid="agent-conversation-body"
        style={{
          maxHeight: expanded ? "400px" : "0px",
          overflow: "hidden",
          transition: "max-height 0.3s ease-in-out",
        }}
      >
        <div className="px-3 pb-3 border-t border-[#3f4147] pt-2">
          {/* Pipeline visual */}
          <div className="flex items-center gap-2">
            {stages.map((stage, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {/* Stage card */}
                <div
                  data-testid={`stage-card-${idx}`}
                  className={`
                    flex-1 min-w-0 rounded border px-2 py-1.5
                    ${stage.status === "failed" ? "border-[#f23f43] bg-[#f23f43]/5" : "border-[#3f4147] bg-[#2b2d31]"}
                  `}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={COLORS[stage.status] || COLORS.pending}>
                      {ICONS[stage.status] || ICONS.pending}
                    </span>
                    <span className="text-xs text-[#dbdee1] font-medium truncate">
                      {stageLabel(stage.stage)}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#949ba4] mt-0.5">
                    {stage.model} | {stage.tier}
                  </div>
                  {stage.duration_ms !== null && stage.duration_ms !== undefined && (
                    <div className="text-[10px] text-[#949ba4]">
                      {formatDuration(stage.duration_ms)}
                    </div>
                  )}
                  {stage.message && (
                    <div className="text-[10px] text-[#b5bac8] mt-0.5 break-all">
                      {stage.message}
                    </div>
                  )}
                </div>

                {/* Arrow between stages */}
                {idx < stages.length - 1 && (
                  <span className="text-[#949ba4] text-sm">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
