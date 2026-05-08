import { Zap, SendHorizontal, Code } from "lucide-react";
import type { ConsoleSession } from "../../types";

interface ConsoleInputProps {
  input: string;
  isLoading: boolean;
  aiEnabled: boolean;
  onToggleAI?: () => void;
  onInputChange: (value: string, cursorPos?: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSubmit: () => void;
  showSuggestions: boolean;
  suggestions: string[];
  selectedSuggestion: number;
  suggestionType: string;
  suggestionFilter: string;
  onApplySuggestion: (name: string) => void;
  footerLabel: string;
  currentSession?: ConsoleSession;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  compact?: boolean;
}

export default function ConsoleInput({
  input,
  isLoading: _isLoading,
  aiEnabled,
  onToggleAI,
  onInputChange,
  onKeyDown,
  onSubmit,
  showSuggestions,
  suggestions,
  selectedSuggestion,
  suggestionType,
  suggestionFilter,
  onApplySuggestion,
  footerLabel,
  currentSession,
  inputRef,
  compact: _compact,
}: ConsoleInputProps) {
  const setQuickInput = (text: string) => {
    onInputChange(text, text.length);
    inputRef.current?.focus();
  };

  return (
    <footer className="p-4 bg-[#2b2d31] border-t border-[#1e1f22]">
      <div className="max-w-4xl mx-auto space-y-3">
        <div className="flex items-center justify-between gap-2 text-[#949ba4] text-xs font-bold uppercase tracking-widest px-1">
          <div className="flex items-center gap-2">
            <Zap
              size={14}
              className={
                aiEnabled
                  ? "text-[#5865f2] animate-pulse"
                  : "text-[#949ba4]"
              }
            />
            <span>{footerLabel}</span>
            {currentSession && (
              <span className="text-[10px] text-gray-600 normal-case">
                · {currentSession.title}
              </span>
            )}
          </div>
          {onToggleAI && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span
                className={`text-[10px] ${
                  aiEnabled ? "text-[#5865f2]" : "text-[#949ba4]"
                }`}
              >
                AI
              </span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={onToggleAI}
                  className="sr-only"
                />
                <div
                  className={`block w-8 h-4 rounded-full transition-colors ${
                    aiEnabled ? "bg-[#5865f2]" : "bg-[#4f545c]"
                  }`}
                />
                <div
                  className={`absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                    aiEnabled
                      ? "translate-x-4"
                      : "translate-x-0"
                  }`}
                />
              </div>
            </label>
          )}
        </div>

        <div className="relative">
          <div
            className={`relative group bg-[#1e1f22] rounded-xl border transition-all shadow-lg ${
              aiEnabled
                ? "border-[#5865f2]/50 focus-within:border-[#5865f2]"
                : "border-[#3f4147] focus-within:border-[#5865f2]"
            }`}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={onKeyDown}
              placeholder="Note or /command or $skill..."
              className="w-full bg-transparent outline-none text-white text-[15px] p-4 resize-none h-28 placeholder-gray-600 leading-relaxed"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-3">
              <div className="flex items-center gap-2 text-[10px] text-gray-500 mr-2">
                <Code size={12} />
                <span>Tab complete · Shift+Enter newline</span>
              </div>
              <button
                onClick={onSubmit}
                className={`p-2.5 rounded-lg transition-all ${
                  input.trim()
                    ? "bg-[#5865f2] text-white hover:scale-105"
                    : "bg-[#4f545c] text-gray-500 cursor-not-allowed"
                }`}
              >
                <SendHorizontal size={20} />
              </button>
            </div>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 bottom-full mb-1 bg-[#2b2d31] border border-[#3f4147] rounded-lg shadow-xl max-h-48 overflow-y-auto z-50">
              {suggestions.map((s, i) => {
                const lowerS = s.toLowerCase();
                const lowerF = suggestionFilter.toLowerCase();
                const idx = lowerS.indexOf(lowerF);
                const prefix = idx >= 0 ? s.slice(0, idx) : s;
                const match = idx >= 0 ? s.slice(idx, idx + suggestionFilter.length) : "";
                const suffix = idx >= 0 ? s.slice(idx + suggestionFilter.length) : "";
                return (
                  <button
                    key={s}
                    onClick={() => onApplySuggestion(s)}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      i === selectedSuggestion
                        ? "bg-[#5865f2]/20 text-white"
                        : "text-[#949ba4] hover:bg-[#3f4147]"
                    }`}
                  >
                    {suggestionType === "skill" && (
                      <span className="text-[#5865f2] mr-1">$</span>
                    )}
                    {suggestionType === "command" && (
                      <span className="text-[#5865f2] mr-1">/</span>
                    )}
                    {suggestionType === "file" && (
                      <span className="text-[#5865f2] mr-1">@file:</span>
                    )}
                    {suggestionType === "server" && (
                      <span className="text-[#f0c040] mr-1">@</span>
                    )}
                    {suggestionType === "channel" && (
                      <span className="text-[#5865f2] mr-1">#</span>
                    )}
                    {prefix}
                    {match && (
                      <span className="text-[#5865f2] font-bold">{match}</span>
                    )}
                    {suffix}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-6 text-[11px] text-gray-500 px-1 font-bold flex-wrap">
          <span
            className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"
            onClick={() => setQuickInput("/help")}
          >
            <span className="text-[#5865f2]">/help</span> Commands
          </span>
          <span
            className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"
            onClick={() => setQuickInput("/clear")}
          >
            <span className="text-[#5865f2]">/clear</span> Clear
          </span>
          <span
            className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"
            onClick={() => setQuickInput("/search ")}
          >
            <span className="text-[#5865f2]">/search</span> Search
          </span>
          <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer">
            <span className="text-[#23a559]">$summarize</span>{" "}
            Summarize
          </span>
          <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer">
            <span className="text-[#23a559]">$ask</span> Ask AI
          </span>
        </div>
      </div>
    </footer>
  );
}
