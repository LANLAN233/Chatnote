import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Calculator,
  Globe,
  FileSearch,
  Wrench,
} from "lucide-react";

interface ToolResultAccordionProps {
  toolName: string;
  input: Record<string, unknown> | null;
  output: string | null;
}

/** Format a value for display — truncate long strings, stringify objects */
function fmtSummary(val: unknown, maxLen = 120): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") {
    if (val.length > maxLen) return val.slice(0, maxLen) + "…";
    return val;
  }
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try {
    const s = JSON.stringify(val);
    if (s.length > maxLen) return s.slice(0, maxLen) + "…";
    return s;
  } catch {
    return "[无法显示]";
  }
}

/** Guess what the result represents based on tool name */
function guessResultSummary(
  toolName: string,
  output: string | null
): string {
  if (!output) return "无输出";
  const lower = toolName.toLowerCase();

  // Calculator
  if (lower.includes("calc")) {
    const num = parseFloat(output.trim());
    if (!isNaN(num)) return `= ${num}`;
    return `结果: ${output.trim().slice(0, 60)}`;
  }

  // Search / search_notes
  if (
    lower.includes("search") ||
    lower.includes("duckduckgo") ||
    lower === "search_notes"
  ) {
    // Try to count result entries
    const lines = output.trim().split("\n").filter(Boolean);
    if (lines.length > 1) return `找到 ${lines.length} 条结果`;
    // Single line — guess length
    if (output.length > 300) return "多条搜索结果";
    return output.trim().slice(0, 120);
  }

  // Web / trafilatura
  if (
    lower.includes("web") ||
    lower.includes("trafilatura") ||
    lower.includes("website")
  ) {
    const firstLine = output.trim().split("\n")[0];
    return firstLine.slice(0, 120) || "网页内容已抓取";
  }

  // Python
  if (lower.includes("python")) return `输出: ${output.trim().slice(0, 80)}`;

  // Generic: just show first line
  const firstLine = output.trim().split("\n")[0];
  return firstLine.slice(0, 120) || "有输出";
}

/** Build input key-value summary */
function inputSummary(
  input: Record<string, unknown> | null
): string {
  if (!input || Object.keys(input).length === 0) return "无输入";
  return Object.entries(input)
    .map(([k, v]) => `${k}=${fmtSummary(v, 60)}`)
    .join(", ");
}

/** Icon per tool category */
function toolIcon(toolName: string): React.ReactNode {
  const lower = toolName.toLowerCase();
  if (lower.includes("search") || lower.includes("duckduckgo"))
    return <Search size={14} />;
  if (lower.includes("calc")) return <Calculator size={14} />;
  if (lower.includes("web") || lower.includes("trafilatura"))
    return <Globe size={14} />;
  if (lower.includes("note") || lower.includes("stats"))
    return <FileSearch size={14} />;
  return <Wrench size={14} />;
}

export default function ToolResultAccordion({
  toolName,
  input,
  output,
}: ToolResultAccordionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid="tool-result-accordion"
      className="rounded-lg border border-[#3f4147] bg-[#1e1f22] overflow-hidden mt-2"
    >
      {/* Header — clickable toggle */}
      <button
        type="button"
        data-testid="accordion-toggle"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#2b2d31] transition-colors"
      >
        <span className="text-[#b5bac8]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="text-[#f0c040]">{toolIcon(toolName)}</span>
        <span className="text-sm text-[#dbdee1] font-medium flex-1 min-w-0 truncate">
          {toolName}
        </span>
        <span className="text-[11px] text-[#949ba4] truncate max-w-[40%]">
          {guessResultSummary(toolName, output)}
        </span>
      </button>

      {/* Collapsible body — max-h transition */}
      <div
        data-testid="accordion-body"
        style={{
          maxHeight: expanded ? "400px" : "0px",
          overflow: "hidden",
          transition: "max-height 0.3s ease-in-out",
        }}
      >
        <div className="px-3 pb-3 space-y-2 border-t border-[#3f4147] pt-2">
          {/* Input section */}
          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              输入
            </span>
            <p className="text-xs text-[#b5bac8] mt-0.5 break-all">
              {inputSummary(input)}
            </p>
          </div>

          {/* Output section */}
          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              输出
            </span>
            <pre className="text-xs text-[#dbdee1] mt-0.5 whitespace-pre-wrap break-all max-h-48 overflow-y-auto bg-[#111214] rounded p-2">
              {output || "（空）"}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
