import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink } from "lucide-react";
import type { QuerySource } from "../../types";

interface QuerySourcesModalProps {
  sources: QuerySource[];
  serverName?: string;
  channelName?: string;
  onClose: () => void;
  onNavigate?: (serverName: string, channelName: string) => void;
}

export default function QuerySourcesModal({
  sources,
  serverName,
  channelName,
  onClose,
  onNavigate,
}: QuerySourcesModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col rounded-xl border border-[#3f4147] bg-[#1e1f22] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3f4147] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">📚 参考来源</h2>
            {(serverName || channelName) && (
              <p className="text-xs text-[#949ba4] mt-0.5">
                {serverName && `@${serverName}`}
                {channelName && ` #${channelName}`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[#949ba4] hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Source list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {sources.length === 0 ? (
            <p className="text-[#949ba4] text-sm text-center py-8">
              暂无参考来源
            </p>
          ) : (
            sources.map((source, i) => (
              <div
                key={i}
                className="bg-[#2b2d31] border border-[#3f4147] rounded-lg p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-purple-400 font-bold">
                    @{source.server}
                  </span>
                  <span className="text-[#949ba4]">/</span>
                  <span className="text-[#5865f2] font-bold">
                    #{source.channel}
                  </span>
                </div>
                <p className="text-[#dbdee1] text-sm leading-relaxed break-words">
                  {source.excerpt}
                </p>
                <div className="flex items-center justify-end pt-1">
                  <button
                    onClick={() => onNavigate?.(source.server, source.channel)}
                    className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors px-2 py-1 rounded hover:bg-purple-500/10"
                  >
                    <ExternalLink size={12} />
                    <span>跳转</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#3f4147] shrink-0 flex items-center justify-between">
          <span className="text-xs text-[#949ba4]">
            共 {sources.length} 条参考笔记
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-[#949ba4] hover:text-white transition-colors rounded-lg hover:bg-[#3f4147]"
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
