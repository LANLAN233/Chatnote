import { useState, useRef, useEffect, useCallback } from "react";
import {
  Terminal,
  Trash2,
  RefreshCw,
  SendHorizontal,
  Zap,
  Code,
  Plus,
  MessageSquare,
  Edit3,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ConsoleMessage, ConsoleSession } from "../../types";
import { consoleSessionApi } from "../../services";

type ConsoleScope =
  | { type: "global" }
  | { type: "server"; serverId: number; serverName: string };

interface ConsoleCoreProps {
  scope: ConsoleScope;
  compact?: boolean;
  onBack?: () => void;
  showRefresh?: boolean;
  aiEnabled?: boolean;
  onToggleAI?: () => void;
  executeFn: (
    text: string,
    aiEnabled: boolean,
    sessionId?: number
  ) => Promise<{
    type: string;
    content?: string;
    data?: unknown;
    note?: unknown;
    plugin_responses?: Array<{ plugin_name: string; message: string }>;
  }>;
  getSuggestions?: (partial: string, type: string) => string[];
  headerTitle?: string;
  footerLabel?: string;
  initMessages?: string[];
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour12: false });
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
  const [sessions, setSessions] = useState<ConsoleSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState("");

  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Auto-scroll
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentSessionId]);

  const loadSessions = async () => {
    try {
      const { data: res } = await consoleSessionApi.list();
      if (res?.success && res.data) {
        setSessions(res.data);
        // Auto-select first session if none selected
        if (res.data.length > 0 && !currentSessionId) {
          await selectSession(res.data[0].id);
        }
      }
    } catch {
      // silent fail
    }
  };

  const selectSession = async (id: number) => {
    setLoadingSession(true);
    setCurrentSessionId(id);
    try {
      const { data: res } = await consoleSessionApi.get(id);
      if (res?.success && res.data) {
        setMessages(res.data.messages || []);
      }
    } catch {
      setMessages([]);
    } finally {
      setLoadingSession(false);
    }
  };

  const createSession = async () => {
    try {
      const { data: res } = await consoleSessionApi.create({
        title: "New Session",
        server_id: scope.type === "server" ? scope.serverId : undefined,
      });
      if (res?.success && res.data) {
        setSessions((prev) => [res.data!, ...prev]);
        await selectSession(res.data.id);
      }
    } catch {
      // silent fail
    }
  };

  const deleteSession = async (id: number) => {
    if (!confirm("Delete this session?")) return;
    try {
      await consoleSessionApi.delete(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch {
      // silent fail
    }
  };

  const startEditTitle = (session: ConsoleSession) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const saveTitle = async (id: number) => {
    try {
      await consoleSessionApi.update(id, { title: editingTitle });
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: editingTitle } : s))
      );
    } catch {
      // silent fail
    } finally {
      setEditingSessionId(null);
    }
  };

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

  const handleInputChange = useCallback(
    (value: string) => {
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
    },
    [getSuggestions, detectSuggestion]
  );

  const applySuggestion = useCallback(
    (name: string) => {
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
      const afterCursor = input.slice(cursorPos);
      setInput(newBefore + afterCursor);
      setShowSuggestions(false);
      setSuggestions([]);
      setSelectedSuggestion(-1);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [input, suggestionType]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === "Tab") {
        e.preventDefault();
        if (
          selectedSuggestion >= 0 &&
          selectedSuggestion < suggestions.length
        ) {
          applySuggestion(suggestions[selectedSuggestion]);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestion(
          (prev) => (prev + 1) % suggestions.length
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestion(
          (prev) =>
            (prev - 1 + suggestions.length) % suggestions.length
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
        handleSubmit();
      }
    }
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Optimistically add user message
    const optimisticUserMsg: ConsoleMessage = {
      id: -Date.now(),
      session_id: currentSessionId || 0,
      role: "user",
      content: text,
      type: "text",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);
    setInput("");
    setIsLoading(true);
    setShowSuggestions(false);

    try {
      let executeText = text;
      if (
        aiEnabled &&
        !text.startsWith("/") &&
        !text.startsWith("$") &&
        scope.type === "global"
      ) {
        executeText = `$ask ${text}`;
      }
      const result = await executeFn(
        executeText,
        aiEnabled,
        currentSessionId || undefined
      );

      // Build assistant message from result
      let assistantContent = "";
      let assistantType = "text";

      if (result.plugin_responses && result.plugin_responses.length > 0) {
        assistantContent = result.plugin_responses
          .map((pr) => `[${pr.plugin_name}] ${pr.message}`)
          .join("\n");
        assistantType = "plugin_response";
      } else if (result.type === "clear") {
        assistantContent = result.content || "Session cleared.";
        assistantType = "clear";
      } else if (result.type === "todo_created") {
        assistantContent = result.content || "Todo created.";
        assistantType = "todo_created";
      } else if (result.type === "error") {
        assistantContent = result.content || "Error occurred.";
        assistantType = "error";
      } else if (result.note) {
        assistantContent = "Note saved successfully.";
        assistantType = "note";
      } else if (result.content) {
        assistantContent = result.content;
      } else {
        assistantContent = JSON.stringify(result, null, 2);
      }

      const assistantMsg: ConsoleMessage = {
        id: -(Date.now() + 1),
        session_id: currentSessionId || 0,
        role: result.type === "clear" ? "system" : "assistant",
        content: assistantContent,
        type: assistantType,
        created_at: new Date().toISOString(),
      };

      if (result.type === "clear") {
        setMessages([assistantMsg]);
      } else {
        setMessages((prev) => [...prev, assistantMsg]);
      }

      // Refresh session list to update title/timestamp if needed
      loadSessions();
    } catch {
      const errorMsg: ConsoleMessage = {
        id: -(Date.now() + 1),
        session_id: currentSessionId || 0,
        role: "assistant",
        content: "Failed to execute command. Please try again.",
        type: "error",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const title =
    headerTitle ||
    (scope.type === "server"
      ? `SERVER_CONSOLE #${scope.serverId}`
      : "CHATNOTE_TERMINAL_V1.0");

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  return (
    <div
      className={`flex-1 bg-[#1e1f22] flex flex-col h-full overflow-hidden font-mono ${
        compact ? "" : ""
      }`}
    >
      <header className="h-12 bg-[#313338] border-b border-[#1e1f22] px-4 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="text-[#949ba4] hover:text-white transition-colors"
              title="Back"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <Terminal size={18} className="text-[#5865F2]" />
          <h2 className="font-bold text-white text-[14px] uppercase tracking-wider">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {!compact && (
            <button
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="text-[#949ba4] hover:text-white transition-colors"
              title="Toggle Sidebar"
            >
              {sidebarCollapsed ? (
                <ChevronRight size={16} />
              ) : (
                <ChevronLeft size={16} />
              )}
            </button>
          )}
          {showRefresh && (
            <button
              className="text-[#949ba4] hover:text-white transition-colors"
              title="Restart Services"
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Session Sidebar */}
        {!sidebarCollapsed && (
          <aside className="w-64 bg-[#2b2d31] border-r border-[#1e1f22] flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-[#1e1f22]">
              <button
                onClick={createSession}
                className="w-full flex items-center justify-center gap-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
              >
                <Plus size={16} /> New Session
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((session) => {
                const isActive = session.id === currentSessionId;
                const isEditing = editingSessionId === session.id;
                return (
                  <div
                    key={session.id}
                    onClick={() => selectSession(session.id)}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isActive
                        ? "bg-[#5865f2]/20 text-white"
                        : "text-[#949ba4] hover:bg-[#35373c] hover:text-gray-300"
                    }`}
                  >
                    <MessageSquare size={14} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveTitle(session.id);
                              if (e.key === "Escape")
                                setEditingSessionId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-[#1e1f22] text-white text-xs px-1 py-0.5 rounded outline-none border border-[#5865f2]"
                            autoFocus
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              saveTitle(session.id);
                            }}
                            className="text-green-400 hover:text-green-300"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSessionId(null);
                            }}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-sm truncate">
                            {session.title}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditTitle(session);
                              }}
                              className="text-[#949ba4] hover:text-white"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(session.id);
                              }}
                              className="text-[#949ba4] hover:text-red-400"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                      <span className="text-[10px] text-gray-500">
                        {new Date(session.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
              {sessions.length === 0 && (
                <div className="text-center text-gray-600 text-xs py-4">
                  No sessions yet.
                  <br />
                  Click "New Session" to start.
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-y-auto p-4 space-y-3 text-[13px] selection:bg-[#5865F2]/30 scrollbar-hide">
            {initMessages.map((msg, i) => (
              <div
                key={`init-${i}`}
                className="text-gray-500 text-xs border-b border-[#2b2d31] pb-2"
              >
                [SYSTEM] {msg}
              </div>
            ))}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === "user"
                    ? "justify-end"
                    : msg.role === "system"
                    ? "justify-center"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2.5 whitespace-pre-wrap break-words ${
                    msg.role === "user"
                      ? "bg-[#23a559]/20 text-green-100 border border-[#23a559]/30"
                      : msg.role === "system"
                      ? "bg-[#5865f2]/10 text-blue-300 text-xs border border-[#5865f2]/20"
                      : msg.type === "error"
                      ? "bg-red-500/10 text-red-300 border border-red-500/20"
                      : "bg-[#2b2d31] text-gray-200 border border-[#3f4147]"
                  }`}
                >
                  <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-2">
                    {msg.role === "user" && (
                      <span className="text-[#23a559] font-bold">You</span>
                    )}
                    {msg.role === "assistant" && (
                      <span className="text-[#5865f2] font-bold">Assistant</span>
                    )}
                    {msg.role === "system" && (
                      <span className="text-blue-400 font-bold">System</span>
                    )}
                    <span>{formatTime(msg.created_at)}</span>
                  </div>
                  <div className="leading-relaxed">{msg.content}</div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#2b2d31] border border-[#3f4147] rounded-xl px-4 py-3 animate-pulse">
                  <div className="flex items-center gap-2 text-gray-400 text-xs">
                    <div className="w-2 h-2 bg-[#5865f2] rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-[#5865f2] rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className="w-2 h-2 bg-[#5865f2] rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <span>Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {loadingSession && (
              <div className="flex justify-center text-gray-500 text-xs py-4">
                Loading session...
              </div>
            )}

            <div ref={logEndRef} />
          </main>

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
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Note or /command or $skill..."
                    className="w-full bg-transparent outline-none text-white text-[15px] p-4 resize-none h-28 placeholder-gray-600 leading-relaxed"
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 mr-2">
                      <Code size={12} />
                      <span>Tab complete · Shift+Enter newline</span>
                    </div>
                    <button
                      onClick={handleSubmit}
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
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-6 text-[11px] text-gray-500 px-1 font-bold flex-wrap">
                <span
                  className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"
                  onClick={() => {
                    setInput("/help");
                    inputRef.current?.focus();
                  }}
                >
                  <span className="text-[#5865f2]">/help</span> Commands
                </span>
                <span
                  className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"
                  onClick={() => {
                    setInput("/clear");
                    inputRef.current?.focus();
                  }}
                >
                  <span className="text-[#5865f2]">/clear</span> Clear
                </span>
                <span
                  className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"
                  onClick={() => {
                    setInput("/search ");
                    inputRef.current?.focus();
                  }}
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
        </div>
      </div>
    </div>
  );
}
