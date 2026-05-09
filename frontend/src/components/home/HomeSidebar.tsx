import { LayoutDashboard, Terminal, Upload, Inbox, History, Sparkles } from "lucide-react";

interface HomeSidebarProps {
  activeTab: "overview" | "console" | "import" | "inbox" | "recent" | "daily-summary";
  onTabChange: (tab: "overview" | "console" | "import" | "inbox" | "recent" | "daily-summary") => void;
  inboxBadge?: number;
}

const tabs = [
  { id: "overview" as const, label: "概要", Icon: LayoutDashboard },
  { id: "daily-summary" as const, label: "每日总结", Icon: Sparkles },
  { id: "recent" as const, label: "最近活动", Icon: History },
  { id: "inbox" as const, label: "待分类", Icon: Inbox },
  { id: "console" as const, label: "总控制台", Icon: Terminal },
  { id: "import" as const, label: "日程表导入", Icon: Upload },
];

export default function HomeSidebar({ activeTab, onTabChange, inboxBadge = 0 }: HomeSidebarProps) {
  return (
    <div className="w-60 bg-[#2b2d31] flex flex-col h-full flex-shrink-0 select-none">
      {/* Header */}
      <div className="h-12 border-b border-[#1e1f22] px-4 flex items-center shadow-sm">
        <h1 className="font-bold text-white text-[15px] truncate">首页</h1>
      </div>

      <div className="flex-1 overflow-y-auto pt-3 px-2 scrollbar-hide">
        <div className="space-y-[2px]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === "inbox" && inboxBadge > 0;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`w-full text-left px-2 py-[6px] rounded flex items-center gap-2 group transition-colors
                  ${isActive
                    ? "bg-[#3f4147] text-white"
                    : "text-[#949ba4] hover:bg-[#35373c] hover:text-gray-200"
                  }`}
              >
                <tab.Icon
                  size={20}
                  className={isActive ? "text-[#5865F2]" : "text-[#80848e]"}
                />
                <span className="truncate text-[15px] font-bold leading-tight flex-1">
                  {tab.label}
                </span>
                {showBadge && (
                  <span className="bg-[#f23f43] text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {inboxBadge > 99 ? "99+" : inboxBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
