import {
  Search,
  Calculator,
  Globe,
  FileSearch,
  Wrench,
} from "lucide-react";

interface ToolCallIndicatorProps {
  toolName: string;
  isActive: boolean;
}

interface ToolDisplayMeta {
  icon: React.ReactNode;
  label: string; // Chinese label shown to the user
  accentColor: string; // CSS color for icon accent
}

const TOOL_MAP: Record<string, ToolDisplayMeta> = {
  duckduckgo_search: {
    icon: <Search size={16} />,
    label: "正在搜索...",
    accentColor: "#f0c040",
  },
  duckduckgo_news: {
    icon: <Search size={16} />,
    label: "正在搜索新闻...",
    accentColor: "#f0c040",
  },
  calculator: {
    icon: <Calculator size={16} />,
    label: "正在计算...",
    accentColor: "#23a559",
  },
  python: {
    icon: <Wrench size={16} />,
    label: "正在执行代码...",
    accentColor: "#5865f2",
  },
  search_notes: {
    icon: <FileSearch size={16} />,
    label: "查询笔记...",
    accentColor: "#c27cff",
  },
  get_stats: {
    icon: <FileSearch size={16} />,
    label: "获取统计...",
    accentColor: "#c27cff",
  },
  trafilatura: {
    icon: <Globe size={16} />,
    label: "正在抓取网页...",
    accentColor: "#00a8fc",
  },
  duckduckgo: {
    icon: <Search size={16} />,
    label: "正在搜索...",
    accentColor: "#f0c040",
  },
  web_search: {
    icon: <Globe size={16} />,
    label: "正在抓取网页...",
    accentColor: "#00a8fc",
  },
};

const DEFAULT_META: ToolDisplayMeta = {
  icon: <Wrench size={16} />,
  label: "正在处理...",
  accentColor: "#949ba4",
};

function getToolMeta(toolName: string): ToolDisplayMeta {
  // Try exact match first, then lowercase
  if (TOOL_MAP[toolName]) return TOOL_MAP[toolName];
  const lower = toolName.toLowerCase();
  for (const [key, meta] of Object.entries(TOOL_MAP)) {
    if (key.toLowerCase() === lower) return meta;
  }
  return DEFAULT_META;
}

export default function ToolCallIndicator({ toolName, isActive }: ToolCallIndicatorProps) {
  const meta = getToolMeta(toolName);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${
        isActive ? "animate-pulse opacity-100" : "opacity-70"
      } bg-[#1e1f22] border-[#3f4147]`}
      style={{
        animation: isActive ? "tool-pulse 1.5s ease-in-out infinite" : undefined,
      }}
      data-testid="tool-call-indicator"
    >
      <style>{`
        @keyframes tool-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <span className="shrink-0" style={{ color: meta.accentColor }}>
        {meta.icon}
      </span>
      <span className="text-[#b5bac8] text-xs whitespace-nowrap">
        {meta.label}
      </span>
      <span className="text-[10px] text-gray-500 ml-1 truncate max-w-[200px]">
        {toolName}
      </span>
    </div>
  );
}
