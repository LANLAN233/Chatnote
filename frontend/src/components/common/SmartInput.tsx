import { useState, useRef, useCallback, useEffect } from "react";
import { SendHorizontal, Loader2 } from "lucide-react";

type SuggestionType = "server" | "channel" | "skill" | "file" | "command";

interface SmartInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  getSuggestions?: (filter: string, type: SuggestionType) => string[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  rows?: number;
  className?: string;
}

function detectSuggestion(text: string, cursorPos: number) {
  const beforeCursor = text.slice(0, cursorPos);
  const patterns: { regex: RegExp; type: SuggestionType }[] = [
    { regex: /@(\S*)$/, type: "server" },
    { regex: /#(\S*)$/, type: "channel" },
    { regex: /\$(\S*)$/, type: "skill" },
    { regex: /@file:(\S*)$/, type: "file" },
    { regex: /\/(\S*)$/, type: "command" },
  ];
  for (const { regex, type } of patterns) {
    const match = beforeCursor.match(regex);
    if (match) {
      return { type, filter: match[1] };
    }
  }
  return null;
}

export default function SmartInput({
  value,
  onChange,
  onSubmit,
  getSuggestions,
  placeholder = "Type something...",
  disabled = false,
  loading = false,
  rows = 4,
  className = "",
}: SmartInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState<SuggestionType>("command");
  const [suggestionFilter, setSuggestionFilter] = useState("");

  const handleInputChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
      if (!getSuggestions) return;

      const cursorPos = inputRef.current?.selectionStart ?? newValue.length;
      const detected = detectSuggestion(newValue, cursorPos);

      if (detected) {
        const items = getSuggestions(detected.filter, detected.type);
        if (items.length > 0) {
          setSuggestions(items);
          setSelectedSuggestion(0);
          setShowSuggestions(true);
          setSuggestionType(detected.type);
          setSuggestionFilter(detected.filter);
          return;
        }
      }
      setShowSuggestions(false);
      setSuggestions([]);
      setSelectedSuggestion(-1);
    },
    [getSuggestions, onChange]
  );

  const applySuggestion = useCallback(
    (name: string) => {
      const cursorPos = inputRef.current?.selectionStart ?? value.length;
      const beforeCursor = value.slice(0, cursorPos);
      const patterns: Record<string, RegExp> = {
        server: /@(\S*)$/,
        channel: /#(\S*)$/,
        skill: /\$(\S*)$/,
        file: /@file:(\S*)$/,
        command: /\/(\S*)$/,
      };
      const regex = patterns[suggestionType];
      if (!regex) return;

      const newBefore = beforeCursor.replace(
        regex,
        suggestionType === "command"
          ? `/${name} `
          : `${
              suggestionType === "file"
                ? "@file:"
                : suggestionType === "skill"
                ? "$"
                : suggestionType === "channel"
                ? "#"
                : "@"
            }${name} `
      );
      const afterCursor = value.slice(cursorPos);
      const newValue = newBefore + afterCursor;
      onChange(newValue);
      setShowSuggestions(false);
      setSuggestions([]);
      setSelectedSuggestion(-1);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [value, suggestionType, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions) {
      if (e.key === "Tab") {
        e.preventDefault();
        if (selectedSuggestion >= 0 && selectedSuggestion < suggestions.length) {
          applySuggestion(suggestions[selectedSuggestion]);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestion((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestion(
          (prev) => (prev - 1 + suggestions.length) % suggestions.length
        );
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions && selectedSuggestion >= 0) {
        applySuggestion(suggestions[selectedSuggestion]);
      } else {
        onSubmit();
      }
    }
  };

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className="w-full bg-[#1e1f22] text-[#dbdee1] p-4 rounded-xl border border-[#3f4147] outline-none focus:border-[#5865f2] transition-all resize-none placeholder-[#949ba4]"
      />
      <div className="absolute bottom-3 right-3 flex items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={!value.trim() || disabled || loading}
          className={`p-2.5 rounded-xl transition-all ${
            value.trim() && !disabled && !loading
              ? "bg-[#5865f2] text-white hover:scale-105"
              : "bg-[#4f545c] text-gray-500 cursor-not-allowed"
          }`}
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <SendHorizontal size={20} />}
        </button>
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
                onClick={() => applySuggestion(s)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  i === selectedSuggestion
                    ? "bg-[#5865f2]/20 text-white"
                    : "text-[#949ba4] hover:bg-[#3f4147]"
                }`}
              >
                {suggestionType === "skill" && <span className="text-[#5865f2] mr-1">$</span>}
                {suggestionType === "command" && <span className="text-[#5865f2] mr-1">/</span>}
                {suggestionType === "file" && <span className="text-[#5865f2] mr-1">@file:</span>}
                {suggestionType === "server" && <span className="text-[#f0c040] mr-1">@</span>}
                {suggestionType === "channel" && <span className="text-[#5865f2] mr-1">#</span>}
                {prefix}
                {match && <span className="text-[#5865f2] font-bold">{match}</span>}
                {suffix}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
