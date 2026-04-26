import { useState, useRef, useEffect, useCallback } from "react";
import { Terminal, Trash2, RefreshCw, SendHorizontal, Zap, Code } from "lucide-react";
import type { ConsoleLog } from "../../types";

interface ConsoleScope {
  type: "global";
} | {
  type: "server";
  serverId: number;
  serverName: string;
}

interface ConsoleCoreProps {
  scope: ConsoleScope;
  compact?: boolean;
  onBack?: () => void;
  showRefresh?: boolean;
  aiEnabled?: boolean;
  onToggleAI?: () => void;
  executeFn: (text: string, aiEnabled: boolean) => Promise<{ type: string; content?: string; data?: unknown; note?: unknown; plugin_responses?: Array<{ plugin_name: string; message: string }> }>;
  getSuggestions?: (partial: string, type: string) => string[];
  headerTitle?: string;
  footerLabel?: string;
  initMessages?: string[];
}

export default function ConsoleCore({
  scope,
  compact = false,
  onBack,
  showRefresh = false,
  aiEnabled = false,
  onToggleAI,
  executeFn,
  getSuggestions,
  headerTitle,
  footerLabel = "Smart Capture",
  initMessages = [],
}: ConsoleCoreProps) {
  const initLogs: ConsoleLog[] = [
    ...initMessages.map((msg, i) => ({
      id: `init-${i}`,
      type: "system" as const,
      content: msg,
      timestamp: new Date(),
    })),
    {
      id: "banner",
      type: "output" as const,
      content: "Type /help for available commands. Use $skill for AI skills.",
      timestamp: new Date(),
    },
  ];

  const [logs, setLogs] = useState<ConsoleLog[]>(initLogs);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addLog = useCallback((type: ConsoleLog["type"], content: string) => {
    setLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, type, content, timestamp: new Date() },
    ]);
  }, []);

  const detectSuggestion = useCallback((text: string, cursorPos: number) => {
    const beforeCursor = text.slice(0, cursorPos);
    const patterns = [
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
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    if (!getSuggestions) return;

    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const detected = detectSuggestion(value, cursorPos);

    if (detected) {
      const items = getSuggestions(detected.filter, detected.type);
      if (items.length > 0) {
        setSuggestions(items);
        setSelectedSuggestion(0);
        setShowSuggestions(true);
        setSuggestionType(detected.type);
        return;
      }
    }
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedSuggestion(-1);
  }, [getSuggestions, detectSuggestion]);

  const applySuggestion = useCallback((name: string) => {
    const cursorPos = inputRef.current?.selectionStart ?? input.length;
    const beforeCursor = input.slice(0, cursorPos);
    const patterns: Record<string, RegExp> = {
      server: /@(\S*)$/,
      channel: /#(\S*)$/,
      skill: /\$(\S*)$/,
      file: /@file:(\S*)$/,
      command: /\/(\S*)$/,
    };
    const regex = patterns[suggestionType];
    if (!regex) return;

    const newBefore = beforeCursor.replace(regex, suggestionType === "command" ? `/${name} ` : `${suggestionType === "file" ? "@file:" : suggestionType === "skill" ? "$" : suggestionType === "channel" ? "#" : "@"}${name} `);
    const afterCursor = input.slice(cursorPos);
    setInput(newBefore + afterCursor);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedSuggestion(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [input, suggestionType]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
        setSelectedSuggestion((prev) => (prev - 1 + suggestions.length) % suggestions.length);
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
        handleSubmit();
      }
    }
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    addLog("input", text);
    setInput("");
    setIsLoading(true);
    setShowSuggestions(false);

    try {
      const result = await executeFn(text, aiEnabled);

      if (result.plugin_responses && result.plugin_responses.length > 0) {
        result.plugin_responses.forEach((pr) => {
          addLog("system", `[${pr.plugin_name}] ${pr.message}`);
        });
      }

      if (result.type === "clear") {
        setLogs([
          { id: "cleared", type: "system", content: "Console cleared.", timestamp: new Date() },
        ]);
      } else if (result.type === "todo_created") {
        addLog("output", result.content || "Todo created.");
      } else if (result.type === "error") {
        addLog("error", result.content || "Error occurred.");
      } else if (result.type === "plugin_response") {
        addLog("output", result.content || "Plugin executed.");
      } else if (result.note) {
        addLog("output", "Note saved successfully.");
      } else if (result.content) {
        addLog("output", result.content);
      } else {
        addLog("output", JSON.stringify(result, null, 2));
      }
    } catch {
      addLog("error", "Failed to execute command. Please try again.");
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const getLevelColor = (type: string) => {
    switch (type) {
      case "error": return "text-red-400";
      case "output": return "text-gray-200";
      case "system": return "text-blue-400";
      default: return "text-gray-400";
    }
  };

  const title = headerTitle || (
    scope.type === "server"
      ? `SERVER_CONSOLE #${scope.serverId}`
      : "CHATNOTE_TERMINAL_V1.0"
  );

  return (
    <div className={`flex-1 bg-[#1e1f22] flex flex-col h-full overflow-hidden font-mono ${compact ? "" : ""}`}>
      <header className="h-12 bg-[#313338] border-b border-[#1e1f22] px-4 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="text-[#949ba4] hover:text-white transition-colors" title="Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
          )}
          <Terminal size={18} className="text-[#5865F2]" />
          <h2 className="font-bold text-white text-[14px] uppercase tracking-wider">
            {title}
          </h2>
          {onToggleAI && (
            <button
              onClick={onToggleAI}
              className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                aiEnabled
                  ? "bg-[#5865f2]/20 text-[#5865f2] border border-[#5865f2]/30"
                  : "bg-[#2b2d31] text-[#949ba4] border border-[#3f4147]"
              }`}
              title={aiEnabled ? "AI Enabled" : "AI Disabled"}
            >
              {aiEnabled ? "AI ON" : "AI OFF"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {showRefresh && (
            <button className="text-[#949ba4] hover:text-white transition-colors" title="Restart Services">
              <RefreshCw size={16} />
            </button>
          )}
          <button
            className="text-[#949ba4] hover:text-white transition-colors"
            title="Clear Logs"
            onClick={() => setLogs([])}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-1 text-[13px] selection:bg-[#5865F2]/30 scrollbar-hide">
        <div className="text-gray-500 mb-4 border-b border-[#2b2d31] pb-2">
          {initMessages.map((msg, i) => (
            <span key={i}>[SYSTEM] {msg}<br /></span>
          ))}
        </div>

        {logs.filter(l => !l.id.startsWith("init")).map((log) => (
          <div key={log.id} className="flex gap-2 group">
            {log.type === "input" ? (
              <span className="text-[#23a559] shrink-0 font-bold">&gt;</span>
            ) : (
              <span className="text-gray-600 shrink-0">
                [{log.timestamp.toLocaleTimeString([], { hour12: false })}]
              </span>
            )}
            <span className={`${getLevelColor(log.type)} break-words whitespace-pre-wrap`}>{log.content}</span>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4 px-4 animate-pulse mt-4">
            <div className="w-10 h-10 rounded-full bg-[#23a559] opacity-20 shrink-0" />
            <div className="flex-1 py-1 space-y-2">
              <div className="h-4 bg-[#3f4147] rounded w-1/4" />
              <div className="h-4 bg-[#3f4147] rounded w-1/2" />
            </div>
          </div>
        )}
        <div ref={logEndRef} />
      </main>

      <footer className="p-6 bg-[#2b2d31] border-t border-[#1e1f22]">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-2 text-[#949ba4] text-xs font-bold uppercase tracking-widest px-1">
            <Zap size={14} className={aiEnabled ? "text-[#5865f2] animate-pulse" : "text-[#949ba4]"} />
            <span>{footerLabel}</span>
          </div>

          <div className="relative">
            <div className={`relative group bg-[#1e1f22] rounded-xl border transition-all shadow-lg ${
              aiEnabled ? "border-[#5865f2]/50 focus-within:border-[#5865f2]" : "border-[#3f4147] focus-within:border-[#5865f2]"
            }`}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Note or /command or $skill..."
                className="w-full bg-transparent outline-none text-white text-[15px] p-4 resize-none h-32 placeholder-gray-600 leading-relaxed"
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-3">
                <div className="flex items-center gap-2 text-[10px] text-gray-500 mr-2">
                  <Code size={12} />
                  <span>Tab complete · Shift+Enter newline</span>
                </div>
                <button
                  onClick={handleSubmit}
                  className={`p-2.5 rounded-lg transition-all ${input.trim() ? "bg-[#5865f2] text-white hover:scale-105" : "bg-[#4f545c] text-gray-500 cursor-not-allowed"}`}
                >
                  <SendHorizontal size={20} />
                </button>
              </div>
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 bottom-full mb-1 bg-[#2b2d31] border border-[#3f4147] rounded-lg shadow-xl max-h-48 overflow-y-auto z-50">
                {suggestions.map((s, i) => (
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
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-6 text-[11px] text-gray-500 px-1 font-bold flex-wrap">
            <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer" onClick={() => { setInput("/help"); inputRef.current?.focus(); }}><span className="text-[#5865f2]">/help</span> Commands</span>
            <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer" onClick={() => { setInput("/clear"); inputRef.current?.focus(); }}><span className="text-[#5865f2]">/clear</span> Clear</span>
            <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer" onClick={() => { setInput("/search "); inputRef.current?.focus(); }}><span className="text-[#5865f2]">/search</span> Search</span>
            <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"><span className="text-[#23a559]">$summarize</span> Summarize</span>
            <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"><span className="text-[#23a559]">$ask</span> Ask AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
