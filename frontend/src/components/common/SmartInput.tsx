import { useState, useEffect, useRef, useCallback } from "react";
import { Hash, Server } from "lucide-react";
import { useServerStore, useChannelStore } from "../../stores";

interface SmartInputProps {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
}

export default function SmartInput({ onSubmit, placeholder }: SmartInputProps) {
  const { servers } = useServerStore();
  const { channels, fetchChannels } = useChannelStore();
  const [content, setContent] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState<"server" | "channel" | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const detectSuggestion = useCallback(
    (text: string, cursorPos: number) => {
      const beforeCursor = text.slice(0, cursorPos);
      const atMatch = beforeCursor.match(/@(\w*)$/);
      if (atMatch) {
        setSuggestionType("server");
        setFilter(atMatch[1].toLowerCase());
        setShowSuggestions(true);
        setSelectedIdx(0);
        return;
      }
      const hashMatch = beforeCursor.match(/#(\w*)$/);
      if (hashMatch) {
        setSuggestionType("channel");
        setFilter(hashMatch[1].toLowerCase());
        setShowSuggestions(true);
        setSelectedIdx(0);
        return;
      }
      setShowSuggestions(false);
    },
    [],
  );

  const getFilteredServers = () => {
    if (!filter) return servers;
    return servers.filter((s) => s.name.toLowerCase().includes(filter));
  };

  const getFilteredChannels = () => {
    let list = channels;
    if (filter) {
      list = list.filter((c) => c.name.toLowerCase().includes(filter));
    }
    return list;
  };

  const applySuggestion = (name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = content.slice(0, cursorPos);
    const prefix = suggestionType === "server" ? "@" : "#";
    const replaced = beforeCursor.replace(new RegExp(`\\${prefix}\\w*$`), `${prefix}${name} `);
    const afterCursor = content.slice(cursorPos);
    const newContent = replaced + afterCursor;
    setContent(newContent);
    setShowSuggestions(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    const pos = e.target.selectionStart ?? val.length;
    detectSuggestion(val, pos);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      const items = suggestionType === "server" ? getFilteredServers() : getFilteredChannels();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, items.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (items[selectedIdx]) {
          applySuggestion(items[selectedIdx].name);
        }
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!content.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(content.trim());
      setContent("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const suggestions =
    suggestionType === "server"
      ? getFilteredServers()
      : suggestionType === "channel"
        ? getFilteredChannels()
        : [];

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Type @Server #Channel or just a note..."}
        className="w-full px-4 py-3 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] focus:border-[#5865f2] transition-colors resize-none h-20 text-[14px] placeholder:text-[#949ba4] outline-none"
      />

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute bottom-full mb-1 left-0 w-64 bg-[#2b2d31] border border-[#1e1f22] rounded-lg shadow-xl overflow-hidden z-50"
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold text-[#949ba4] uppercase border-b border-[#1e1f22]">
            {suggestionType === "server" ? "Servers" : "Channels"}
          </div>
          {suggestions.slice(0, 8).map((item, idx) => (
            <button
              key={item.id}
              className={`w-full px-3 py-2 text-left text-[13px] flex items-center gap-2 transition-colors ${
                idx === selectedIdx
                  ? "bg-[#3f4147] text-white"
                  : "text-[#dbdee1] hover:bg-[#35373c]"
              }`}
              onClick={() => applySuggestion(item.name)}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              {suggestionType === "server" ? (
                <Server className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Hash className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
