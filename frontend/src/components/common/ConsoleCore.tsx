import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  Save,
  FolderOpen,
  Copy,
  FileInput,
  ExternalLink,
} from "lucide-react";
import type { ConsoleMessage, ConsoleMessageMetadata, ConsoleSession, LoadedContext, Server, Channel } from "../../types";
import { consoleSessionApi, serverApi, channelApi } from "../../services";
import ConsoleImportModal from "../console/ConsoleImportModal";
import QuerySourcesModal from "../console/QuerySourcesModal";
import UrlPreviewCard from "./UrlPreviewCard";
import CodeExecutionBlock from "./CodeExecutionBlock";
import ToolCallIndicator from "./ToolCallIndicator";
import ToolResultAccordion from "./ToolResultAccordion";

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
  getSuggestions?: (filter: string, type: string, fullText: string) => string[] | Promise<string[]>;
  headerTitle?: string;
  footerLabel?: string;
  initMessages?: string[];
  onNavigateToSource?: (serverName: string, channelName: string) => void;
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
  onNavigateToSource,
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
  const [suggestionFilter, setSuggestionFilter] = useState("");

  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Archive dialog states
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveSessionId, setArchiveSessionId] = useState<number | null>(null);
  const [archiveServers, setArchiveServers] = useState<Server[]>([]);
  const [archiveChannels, setArchiveChannels] = useState<Channel[]>([]);
  const [selectedArchiveServer, setSelectedArchiveServer] = useState<number | null>(null);
  const [selectedArchiveChannel, setSelectedArchiveChannel] = useState<number | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // Text selection toolbar state
  const [selectedText, setSelectedText] = useState("");
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [importContent, setImportContent] = useState("");

  // Loaded context state (from @Server #Channel context loading)
  const [loadedContext, setLoadedContext] = useState<LoadedContext[]>([]);

  // Query sources modal state
  const [querySourcesMessage, setQuerySourcesMessage] = useState<ConsoleMessage | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectionToolbarRef = useRef<HTMLDivElement>(null);

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

  const handleCopyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const handleImportToChannel = async (text: string) => {
    setImportContent(text);
    setShowSelectionToolbar(false);
    try {
      const { data: res } = await serverApi.list();
      if (res?.success && res.data) {
        setArchiveServers(res.data);
      }
    } catch {
      // silent fail
    }
  };

  // Text selection handler
  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || "";

      if (text) {
        // Get selection range to calculate position
        const range = selection?.getRangeAt(0);
        if (range) {
          const rect = range.getBoundingClientRect ? range.getBoundingClientRect() : null;
          setToolbarPosition({
            x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
            y: rect ? rect.top - 8 : 100,
          });
        }
        setSelectedText(text);
        setShowSelectionToolbar(true);
      } else {
        setShowSelectionToolbar(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showSelectionToolbar) {
        setShowSelectionToolbar(false);
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showSelectionToolbar]);

  // Close toolbar on outside click
  useEffect(() => {
    if (!showSelectionToolbar) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (selectionToolbarRef.current && !selectionToolbarRef.current.contains(e.target as Node)) {
        setShowSelectionToolbar(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSelectionToolbar]);

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
        // Restore loaded context from session
        if (res.data.loaded_context) {
          try {
            const ctx = JSON.parse(res.data.loaded_context);
            setLoadedContext([
              {
                server_name: ctx.server_name,
                channel_name: ctx.channel_name,
                server_id: ctx.server_id,
                channel_id: ctx.channel_id,
                notes_count: ctx.notes_count,
              },
            ]);
          } catch {
            setLoadedContext([]);
          }
        } else {
          setLoadedContext([]);
        }
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

  const handleRemoveContext = async (index: number) => {
    if (!currentSessionId) return;
    const updatedContexts = loadedContext.filter((_, i) => i !== index);
    setLoadedContext(updatedContexts);

    // If all contexts removed, clear from backend
    if (updatedContexts.length === 0) {
      try {
        await consoleSessionApi.update(currentSessionId, { loaded_context: null });
      } catch {
        // silent fail
      }
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

  // Archive dialog functions
  const openArchiveDialog = async (sessionId: number) => {
    setArchiveSessionId(sessionId);
    setShowArchiveDialog(true);
    setSelectedArchiveServer(null);
    setSelectedArchiveChannel(null);
    setArchiveChannels([]);
    try {
      const { data: res } = await serverApi.list();
      if (res?.success && res.data) {
        setArchiveServers(res.data);
      }
    } catch {
      // silent fail
    }
  };

  const handleServerSelect = async (serverId: number) => {
    setSelectedArchiveServer(serverId);
    setSelectedArchiveChannel(null);
    setArchiveChannels([]);
    try {
      const { data: res } = await channelApi.list(serverId);
      if (res?.success && res.data) {
        setArchiveChannels(res.data);
      }
    } catch {
      // silent fail
    }
  };

  const handleArchive = async () => {
    if (!archiveSessionId || !selectedArchiveServer || !selectedArchiveChannel) return;
    setArchiveLoading(true);
    try {
      await consoleSessionApi.archive(archiveSessionId, {
        server_id: selectedArchiveServer,
        channel_id: selectedArchiveChannel,
      });
      setShowArchiveDialog(false);
      setArchiveSessionId(null);
      setSelectedArchiveServer(null);
      setSelectedArchiveChannel(null);
    } catch {
      // silent fail
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleImportServerSelect = async (serverId: number) => {
    setArchiveChannels([]);
    try {
      const { data: res } = await channelApi.list(serverId);
      if (res?.success && res.data) {
        setArchiveChannels(res.data);
      }
    } catch {
      // silent fail
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
    (value: string, cursorPos?: number) => {
      setInput(value);
      if (!getSuggestions) return;

      const pos = cursorPos ?? inputRef.current?.selectionStart ?? value.length;
      const detected = detectSuggestion(value, pos);

      if (detected) {
        const resultOrPromise = getSuggestions(detected.filter, detected.type, value);
        Promise.resolve(resultOrPromise).then((items) => {
          if (items.length > 0) {
            setSuggestions(items);
            setSelectedSuggestion(0);
            setShowSuggestions(true);
            setSuggestionType(detected.type);
            setSuggestionFilter(detected.filter);
          } else {
            setShowSuggestions(false);
            setSuggestions([]);
            setSelectedSuggestion(-1);
          }
        });
        return;
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
      const isServerMention =
        text.trim().startsWith("@") && !text.trim().startsWith("@file:");
      if (
        aiEnabled &&
        !text.startsWith("/") &&
        !text.startsWith("$") &&
        !isServerMention &&
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
      let assistantMetadata: ConsoleMessageMetadata | undefined;

      // Check for query_answer (knowledge-base Q&A result with sources)
      const resultData = result.data as Record<string, unknown> | undefined;

      // Extract tool_calls and tool_results from result data (Phase 15 agno tools)
      const toolCalls = resultData?.tool_calls;
      const toolResults = resultData?.tool_results;

      // Handle context_loaded (from @Server #Channel context loading)
      if (result.type === "context_loaded") {
        // NOTE: Backend spreads context_result["data"] into ApiResponse.data,
        // and executeFn returns response.data (unwrapped), so context fields
        // (server_name, channel_name, etc.) are at the top level of `result`,
        // NOT nested under result.data (which would be resultData).
        const r = result as unknown as Record<string, unknown>;
        assistantContent = (r.content as string) || "";
        assistantType = "context_loaded";
        const ctx: LoadedContext = {
          server_name: r.server_name as string,
          channel_name: r.channel_name as string | null,
          server_id: r.server_id as number,
          channel_id: r.channel_id as number | null,
          notes_count: r.notes_count as number,
        };
        setLoadedContext((prev) => {
          const filtered = prev.filter(
            (c) => !(c.server_id === ctx.server_id && c.channel_id === ctx.channel_id)
          );
          return [...filtered, ctx];
        });
      } else if (resultData?.sources && Array.isArray(resultData.sources) && resultData.sources.length > 0) {
        assistantContent = (resultData.answer as string) || result.content || "";
        assistantType = "query_answer";
        assistantMetadata = {
          sources: resultData.sources as ConsoleMessageMetadata["sources"],
          server_name: resultData.server_name as string | undefined,
          channel_name: resultData.channel_name as string | undefined,
          total_notes_fetched: resultData.total_notes_fetched as number | undefined,
        };
      } else if (result.plugin_responses && result.plugin_responses.length > 0) {
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
      } else if (result.type === "web_result") {
        assistantContent = result.content || "";
        assistantType = "web_result";
        assistantMetadata = {
          title: (resultData as Record<string, unknown>)?.title as string | undefined,
          url: (resultData as Record<string, unknown>)?.url as string | undefined,
          web_summary: (resultData as Record<string, unknown>)?.summary as string | undefined,
          favicon: (resultData as Record<string, unknown>)?.favicon as string | undefined,
        };
      } else if (result.type === "code_execution") {
        assistantContent = result.content || "";
        assistantType = "code_execution";
        assistantMetadata = {
          code: (resultData as Record<string, unknown>)?.code as string | undefined,
          output: (resultData as Record<string, unknown>)?.output as string | undefined,
          language: (resultData as Record<string, unknown>)?.language as string | undefined,
        };
      } else if (result.content) {
        assistantContent = result.content;
      } else {
        assistantContent = JSON.stringify(result, null, 2);
      }

      // Merge tool_calls and tool_results into metadata if present
      if (toolCalls || toolResults) {
        assistantMetadata = {
          ...assistantMetadata,
          tool_calls: (toolCalls as ConsoleMessageMetadata["tool_calls"]) || undefined,
          tool_results: (toolResults as ConsoleMessageMetadata["tool_results"]) || undefined,
        };
      }

      const assistantMsg: ConsoleMessage = {
        id: -(Date.now() + 1),
        session_id: currentSessionId || 0,
        role: result.type === "clear" ? "system" : "assistant",
        content: assistantContent,
        type: assistantType,
        created_at: new Date().toISOString(),
        metadata: assistantMetadata,
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

      {loadedContext.length > 0 && (
        <div className="bg-[#2b2d31] border-b border-[#1e1f22] px-4 py-2 flex items-center gap-2 flex-wrap animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-[11px] text-[#949ba4] font-medium uppercase tracking-wider mr-1">上下文:</span>
          {loadedContext.map((ctx, i) => (
            <div
              key={`${ctx.server_id}-${ctx.channel_id}`}
              className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-full px-3 py-1 text-xs group hover:border-purple-400/50 transition-all duration-150"
            >
              <span className="text-purple-300 font-medium">@{ctx.server_name}</span>
              {ctx.channel_name && (
                <>
                  <span className="text-[#949ba4]">/</span>
                  <span className="text-[#5865f2] font-medium">#{ctx.channel_name}</span>
                </>
              )}
              <span className="text-[#949ba4] ml-1">({ctx.notes_count}条笔记)</span>
              <button
                onClick={() => handleRemoveContext(i)}
                className="text-[#949ba4] hover:text-red-400 hover:bg-red-400/10 rounded-full p-0.5 transition-colors ml-0.5"
                title="移除上下文"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

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
                                openArchiveDialog(session.id);
                              }}
                              className="text-[#949ba4] hover:text-[#23a559]"
                              title="Archive to channel"
                            >
                              <Save size={12} />
                            </button>
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
          <main
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 text-[13px] select-text selection:bg-[#5865F2]/30 scrollbar-hide"
          >
            {initMessages.map((msg, i) => (
              <div
                key={`init-${i}`}
                className="text-gray-500 text-xs border-b border-[#2b2d31] pb-2"
              >
                [SYSTEM] {msg}
              </div>
            ))}

            {messages.map((msg) => {
              const hasToolCalls = msg.metadata?.tool_calls && msg.metadata.tool_calls.length > 0;
              const hasToolResults = msg.metadata?.tool_results && msg.metadata.tool_results.length > 0;
              return (
              <div
                key={msg.id}
                data-testid={`message-row-${msg.id}`}
                className={`group relative flex ${
                  msg.role === "user"
                    ? "justify-end"
                    : msg.role === "system"
                    ? "justify-center"
                    : "justify-start"
                }`}
                onMouseEnter={() => setHoveredMessageId(msg.id)}
                onMouseLeave={() => setHoveredMessageId((current) => (current === msg.id ? null : current))}
              >
                <div className="max-w-[80%] flex flex-col gap-1.5">
                  {/* Tool call indicators — shown above the bubble */}
                  {hasToolCalls && msg.metadata?.tool_calls?.map((tc, i) => (
                    <ToolCallIndicator
                      key={`tc-${msg.id}-${i}`}
                      toolName={tc.tool_name}
                      isActive={false}
                    />
                  ))}

                  <div
                    className={`rounded-xl px-4 py-2.5 whitespace-pre-wrap break-words ${
                      msg.type === "query_answer"
                        ? "border-l-4 border-purple-500 pl-4 bg-[#2b2040]/30 text-gray-200 border border-purple-500/20"
                        : msg.type === "web_result"
                        ? "border-l-4 border-blue-500 pl-4 bg-[#0d1117]/30 text-gray-200 border border-blue-500/20"
                        : msg.type === "code_execution"
                        ? "border-l-4 border-[#d2a8ff] pl-4 bg-[#1e1a2e]/30 text-gray-200 border border-[#d2a8ff]/20"
                        : msg.role === "user"
                        ? "bg-[#23a559]/20 text-green-100 border border-[#23a559]/30"
                        : msg.role === "system"
                        ? "bg-[#5865f2]/10 text-blue-300 text-xs border border-[#5865f2]/20"
                        : msg.type === "context_loaded"
                        ? "bg-purple-500/10 text-purple-300 text-xs border border-purple-500/20"
                        : msg.type === "error"
                        ? "bg-red-500/10 text-red-300 border border-red-500/20"
                        : "bg-[#2b2d31] text-gray-200 border border-[#3f4147]"
                    }`}
                  >
                    <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-2">
                      {msg.role === "user" && (
                        <span className="text-[#23a559] font-bold">You</span>
                      )}
                      {msg.role === "assistant" && msg.type !== "query_answer" && msg.type !== "web_result" && msg.type !== "code_execution" && (
                        <span className="text-[#5865f2] font-bold">Assistant</span>
                      )}
                      {msg.type === "query_answer" && (
                        <span className="text-purple-400 font-bold">🔍 知识库查询</span>
                      )}
                      {msg.type === "web_result" && (
                        <span className="text-[#58a6ff] font-bold">🌐 网页预览</span>
                      )}
                      {msg.type === "code_execution" && (
                        <span className="text-[#d2a8ff] font-bold">💻 代码执行</span>
                      )}
                      {msg.role === "system" && (
                        <span className="text-blue-400 font-bold">System</span>
                      )}
                      {msg.type === "context_loaded" && (
                        <span className="text-purple-400 font-bold">📚 上下文加载</span>
                      )}
                      <span>{formatTime(msg.created_at)}</span>
                    </div>
                    {/* Web preview card */}
                    {msg.type === "web_result" && msg.metadata?.url ? (
                      <UrlPreviewCard
                        title={msg.metadata.title || msg.metadata.url}
                        url={msg.metadata.url}
                        summary={msg.metadata.web_summary || msg.content}
                        favicon={msg.metadata.favicon}
                      />
                    ) : msg.type === "code_execution" && msg.metadata?.code ? (
                      <CodeExecutionBlock
                        code={msg.metadata.code}
                        output={msg.metadata.output || msg.content}
                        language={msg.metadata.language}
                      />
                    ) : (
                      <div className="leading-relaxed select-text">{msg.content}</div>
                    )}

                    {/* Query sources */}
                    {msg.type === "query_answer" && msg.metadata?.sources && msg.metadata.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-purple-500/20">
                        <p className="text-xs text-purple-400 mb-2">
                          基于 {msg.metadata.sources.length} 条笔记
                          {msg.metadata.total_notes_fetched && (
                            <span className="text-[#949ba4]"> · 共检索 {msg.metadata.total_notes_fetched} 条</span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.metadata.sources.map((src, i) => (
                            <button
                              key={i}
                              onClick={() => setQuerySourcesMessage(msg)}
                              className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer underline truncate max-w-[240px] text-left transition-colors"
                              title={`@${src.server} #${src.channel}: ${src.excerpt}`}
                            >
                              @{src.server}/#{src.channel}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setQuerySourcesMessage(msg)}
                          className="mt-2 flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          <ExternalLink size={12} />
                          <span>查看全部来源</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tool result accordions — shown below the bubble */}
                  {hasToolResults && msg.metadata?.tool_results?.map((tr, i) => {
                    // Look up input from tool_calls if not present in tool_result
                    const input = tr.input ?? msg.metadata?.tool_calls?.find(tc => tc.tool_name === tr.tool_name)?.input ?? null;
                    return (
                    <ToolResultAccordion
                      key={`tr-${msg.id}-${i}`}
                      toolName={tr.tool_name}
                      input={input}
                      output={tr.output}
                    />
                    );
                  })}
                </div>

                <div
                  data-testid={`message-toolbar-${msg.id}`}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 rounded-lg bg-[#111214] border border-[#3f4147] shadow-2xl py-1 px-1.5 transition-opacity duration-150 ${hoveredMessageId === msg.id ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleCopyText(msg.content)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] text-[#dbdee1] hover:bg-[#5865f2] hover:text-white rounded transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    <span>复制</span>
                  </button>
                  <button
                    onClick={() => handleImportToChannel(msg.content)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] text-[#dbdee1] hover:bg-[#5865f2] hover:text-white rounded transition-colors"
                  >
                    <FileInput className="w-4 h-4" />
                    <span>导入到...</span>
                  </button>
                </div>
              </div>
              );
            })}

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
                    onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
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

      {/* Floating Selection Toolbar */}
      {showSelectionToolbar && createPortal(
        <div
          ref={selectionToolbarRef}
          data-testid="selection-toolbar"
          className="fixed z-[9999] flex items-center gap-1 bg-[#111214] border border-[#3f4147] rounded-lg shadow-2xl py-1.5 px-2"
          style={{
            left: toolbarPosition.x,
            top: toolbarPosition.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <button
            onClick={() => {
              handleCopyText(selectedText);
              setShowSelectionToolbar(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-[#dbdee1] hover:bg-[#5865f2] hover:text-white rounded transition-colors"
          >
            <Copy className="w-4 h-4" />
            <span>复制</span>
          </button>
          <button
            onClick={() => {
              handleImportToChannel(selectedText);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-[#dbdee1] hover:bg-[#5865f2] hover:text-white rounded transition-colors"
          >
            <FileInput className="w-4 h-4" />
            <span>导入到...</span>
          </button>
        </div>,
        document.body
      )}

      {importContent && (
        <ConsoleImportModal
          content={importContent}
          servers={archiveServers}
          channels={archiveChannels}
          onClose={() => setImportContent("")}
          onServerSelect={handleImportServerSelect}
        />
      )}

      {/* Query Sources Modal */}
      {querySourcesMessage?.metadata?.sources && (
        <QuerySourcesModal
          sources={querySourcesMessage.metadata.sources}
          serverName={querySourcesMessage.metadata.server_name}
          channelName={querySourcesMessage.metadata.channel_name}
          onClose={() => setQuerySourcesMessage(null)}
          onNavigate={onNavigateToSource}
        />
      )}

      {/* Archive Dialog */}
      {showArchiveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#313338] rounded-xl border border-[#1e1f22] shadow-2xl w-[420px] max-w-[90vw] p-6 space-y-5">
            <div className="flex items-center gap-3">
              <FolderOpen size={20} className="text-[#5865f2]" />
              <h3 className="text-white font-bold text-lg">Archive Session</h3>
            </div>
            <p className="text-[#949ba4] text-sm">
              Save this console session as a note in a channel.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#949ba4] uppercase tracking-wider mb-1.5">
                  Server
                </label>
                <select
                  value={selectedArchiveServer || ""}
                  onChange={(e) => handleServerSelect(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm"
                >
                  <option value="">Select a server...</option>
                  {archiveServers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#949ba4] uppercase tracking-wider mb-1.5">
                  Channel
                </label>
                <select
                  value={selectedArchiveChannel || ""}
                  onChange={(e) => setSelectedArchiveChannel(Number(e.target.value))}
                  disabled={!selectedArchiveServer || archiveChannels.length === 0}
                  className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm disabled:opacity-40"
                >
                  <option value="">Select a channel...</option>
                  {archiveChannels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowArchiveDialog(false);
                  setArchiveSessionId(null);
                  setSelectedArchiveServer(null);
                  setSelectedArchiveChannel(null);
                }}
                className="px-4 py-2 text-[#949ba4] hover:text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={!selectedArchiveChannel || archiveLoading}
                className="px-5 py-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-60 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
              >
                {archiveLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
