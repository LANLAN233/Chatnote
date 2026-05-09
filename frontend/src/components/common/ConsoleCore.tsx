import { useState, useRef, useEffect, useCallback } from "react";
import {
  Terminal, RefreshCw, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import type { ConsoleMessage, ConsoleMessageMetadata, ConsoleSession, LoadedContext, Server, Channel } from "../../types";
import { useAiProgress } from "../../hooks/useAiProgress";
import { consoleSessionApi, serverApi, channelApi, wsService } from "../../services";
import MessageList from "../console/MessageList";
import ConsoleInput from "../console/ConsoleInput";
import SessionPanel from "../console/SessionPanel";
import ConsoleModals from "../console/ConsoleModals";
import AiProgressPanel from "../console/AiProgressPanel";

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
    type: string; content?: string; data?: unknown; note?: unknown;
    plugin_responses?: Array<{ plugin_name: string; message: string }>;
  }>;
  getSuggestions?: (filter: string, type: string, fullText: string) => string[] | Promise<string[]>;
  headerTitle?: string;
  footerLabel?: string;
  initMessages?: string[];
  onNavigateToSource?: (serverName: string, channelName: string) => void;
}

export default function ConsoleCore({
  scope, compact = false, onBack, showRefresh = false, aiEnabled = false,
  onToggleAI, executeFn, getSuggestions, headerTitle,
  footerLabel = "Smart Capture", initMessages = [], onNavigateToSource,
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
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveSessionId, setArchiveSessionId] = useState<number | null>(null);
  const [archiveServers, setArchiveServers] = useState<Server[]>([]);
  const [archiveChannels, setArchiveChannels] = useState<Channel[]>([]);
  const [selectedArchiveServer, setSelectedArchiveServer] = useState<number | null>(null);
  const [selectedArchiveChannel, setSelectedArchiveChannel] = useState<number | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [importContent, setImportContent] = useState("");
  const [loadedContext, setLoadedContext] = useState<LoadedContext[]>([]);
  const [querySourcesMessage, setQuerySourcesMessage] = useState<ConsoleMessage | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectionToolbarRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const { progress: currentProgress, disconnected, startTracking, stopTracking, clearProgress } = useAiProgress();

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);
  useEffect(() => { inputRef.current?.focus(); }, [currentSessionId]);
  useEffect(() => { clearProgress(); }, [currentSessionId]);

  // T19: Listen for backend-generated session titles via WebSocket
  useEffect(() => {
    const unsub = wsService.on("title_updated", (data: { session_id: number; title: string }) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === data.session_id ? { ...s, title: data.title } : s
        )
      );
    });
    return unsub;
  }, []);

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() || "";
      if (text) {
        const rect = sel?.getRangeAt(0)?.getBoundingClientRect?.() || null;
        setToolbarPosition({ x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, y: rect ? rect.top - 8 : 100 });
        setSelectedText(text); setShowSelectionToolbar(true);
      } else { setShowSelectionToolbar(false); }
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setShowSelectionToolbar(false); };
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("mouseup", onMouseUp); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  useEffect(() => {
    if (!showSelectionToolbar) return;
    const onClickOutside = (e: MouseEvent) => {
      if (selectionToolbarRef.current && !selectionToolbarRef.current.contains(e.target as Node)) setShowSelectionToolbar(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showSelectionToolbar]);

  const loadSessions = async () => {
    try { const { data: res } = await consoleSessionApi.list(); if (res?.success && res.data) { setSessions(res.data); if (res.data.length > 0 && !currentSessionId) await selectSession(res.data[0].id); } } catch { /* */ }
  };
  const selectSession = async (id: number) => {
    setLoadingSession(true); setCurrentSessionId(id);
    try {
      const { data: res } = await consoleSessionApi.get(id);
      if (res?.success && res.data) {
        setMessages(res.data.messages || []);
        if (res.data.loaded_context) {
          try { const ctx = JSON.parse(res.data.loaded_context); setLoadedContext([{ server_name: ctx.server_name, channel_name: ctx.channel_name, server_id: ctx.server_id, channel_id: ctx.channel_id, notes_count: ctx.notes_count }]); } catch { setLoadedContext([]); }
        } else { setLoadedContext([]); }
      }
    } catch { setMessages([]); } finally { setLoadingSession(false); }
  };
  const createSession = async () => {
    try { const { data: res } = await consoleSessionApi.create({ title: "New Session", server_id: scope.type === "server" ? scope.serverId : undefined }); if (res?.success && res.data) { setSessions(prev => [res.data!, ...prev]); await selectSession(res.data.id); } } catch { /* */ }
  };
  const deleteSession = async (id: number) => {
    if (!confirm("Delete this session?")) return;
    try { await consoleSessionApi.delete(id); setSessions(prev => prev.filter(s => s.id !== id)); if (currentSessionId === id) { setCurrentSessionId(null); setMessages([]); } } catch { /* */ }
  };
  const handleRemoveContext = async (index: number) => {
    if (!currentSessionId) return;
    const updated = loadedContext.filter((_, i) => i !== index); setLoadedContext(updated);
    if (updated.length === 0) { try { await consoleSessionApi.update(currentSessionId, { loaded_context: null }); } catch { /* */ } }
  };
  const startEditTitle = (session: ConsoleSession) => { setEditingSessionId(session.id); setEditingTitle(session.title); };
  const saveTitle = async (id: number) => {
    try { await consoleSessionApi.update(id, { title: editingTitle }); setSessions(prev => prev.map(s => (s.id === id ? { ...s, title: editingTitle } : s))); } catch { /* */ } finally { setEditingSessionId(null); }
  };
  const openArchiveDialog = async (sessionId: number) => {
    setArchiveSessionId(sessionId); setShowArchiveDialog(true); setSelectedArchiveServer(null); setSelectedArchiveChannel(null); setArchiveChannels([]);
    try { const { data: res } = await serverApi.list(); if (res?.success && res.data) setArchiveServers(res.data); } catch { /* */ }
  };
  const handleServerSelect = async (serverId: number) => {
    setSelectedArchiveServer(serverId); setSelectedArchiveChannel(null); setArchiveChannels([]);
    try { const { data: res } = await channelApi.list(serverId); if (res?.success && res.data) setArchiveChannels(res.data); } catch { /* */ }
  };
  const handleArchive = async () => {
    if (!archiveSessionId || !selectedArchiveServer || !selectedArchiveChannel) return;
    setArchiveLoading(true);
    try { await consoleSessionApi.archive(archiveSessionId, { server_id: selectedArchiveServer, channel_id: selectedArchiveChannel }); setShowArchiveDialog(false); setArchiveSessionId(null); setSelectedArchiveServer(null); setSelectedArchiveChannel(null); } catch { /* */ } finally { setArchiveLoading(false); }
  };
  const handleImportServerSelect = async (serverId: number) => {
    setArchiveChannels([]);
    try { const { data: res } = await channelApi.list(serverId); if (res?.success && res.data) setArchiveChannels(res.data); } catch { /* */ }
  };
  const handleCopyText = async (text: string) => { await navigator.clipboard.writeText(text); };
  const handleImportToChannel = async (text: string) => {
    setImportContent(text); setShowSelectionToolbar(false);
    try { const { data: res } = await serverApi.list(); if (res?.success && res.data) setArchiveServers(res.data); } catch { /* */ }
  };

  const detectSuggestion = useCallback((text: string, cursorPos: number) => {
    const patterns: Array<{ regex: RegExp; type: string }> = [
      { regex: /@(\S*)$/, type: "server" }, { regex: /#(\S*)$/, type: "channel" },
      { regex: /\$(\S*)$/, type: "skill" }, { regex: /@file:(\S*)$/, type: "file" }, { regex: /\/(\S*)$/, type: "command" },
    ];
    for (const { regex, type } of patterns) { const m = text.slice(0, cursorPos).match(regex); if (m) return { type, filter: m[1] }; }
    return null;
  }, []);
  const handleInputChange = useCallback((value: string, cursorPos?: number) => {
    setInput(value); if (!getSuggestions) return;
    const pos = cursorPos ?? inputRef.current?.selectionStart ?? value.length;
    const detected = detectSuggestion(value, pos);
    if (detected) {
      Promise.resolve(getSuggestions(detected.filter, detected.type, value)).then(items => {
        if (items.length > 0) { setSuggestions(items); setSelectedSuggestion(0); setShowSuggestions(true); setSuggestionType(detected.type); setSuggestionFilter(detected.filter); }
        else { setShowSuggestions(false); setSuggestions([]); setSelectedSuggestion(-1); }
      }); return;
    }
    setShowSuggestions(false); setSuggestions([]); setSelectedSuggestion(-1);
  }, [getSuggestions, detectSuggestion]);
  const applySuggestion = useCallback((name: string) => {
    const cursorPos = inputRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, cursorPos);
    const patterns: Record<string, RegExp> = { server: /@(\S*)$/, channel: /#(\S*)$/, skill: /\$(\S*)$/, file: /@file:(\S*)$/, command: /\/(\S*)$/ };
    const regex = patterns[suggestionType]; if (!regex) return;
    const prefixes: Record<string, string> = { command: `/${name} `, file: `@file:${name} `, skill: `$${name} `, channel: `#${name} `, server: `@${name} ` };
    setInput(before.replace(regex, prefixes[suggestionType]) + input.slice(cursorPos));
    setShowSuggestions(false); setSuggestions([]); setSelectedSuggestion(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [input, suggestionType]);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === "Tab") { e.preventDefault(); if (selectedSuggestion >= 0 && selectedSuggestion < suggestions.length) applySuggestion(suggestions[selectedSuggestion]); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedSuggestion(prev => (prev + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedSuggestion(prev => (prev - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === "Escape") { setShowSuggestions(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (showSuggestions && selectedSuggestion >= 0) applySuggestion(suggestions[selectedSuggestion]); else handleSubmit(); }
  };

  const handleSubmit = async () => {
    const text = input.trim(); if (!text || isLoading) return;
    setMessages(prev => [...prev, { id: -Date.now(), session_id: currentSessionId || 0, role: "user", content: text, type: "text", created_at: new Date().toISOString() }]);
    setInput(""); setIsLoading(true); setShowSuggestions(false);
    startTracking();
    try {
      let execText = text;
      const isMention = text.trim().startsWith("@") && !text.trim().startsWith("@file:");
      if (aiEnabled && !text.startsWith("/") && !text.startsWith("$") && !isMention && scope.type === "global") execText = `$ask ${text}`;
      const result = await executeFn(execText, aiEnabled, currentSessionId || undefined);
      let c = ""; let t = "text"; let m: ConsoleMessageMetadata | undefined;
      const rd = result.data as Record<string, unknown> | undefined;
      const tc = rd?.tool_calls, tr = rd?.tool_results;
      if (result.type === "context_loaded") {
        const r = result as unknown as Record<string, unknown>;
        c = (r.content as string) || ""; t = "context_loaded";
        setLoadedContext(prev => { const f = prev.filter(x => !(x.server_id === r.server_id && x.channel_id === r.channel_id)); return [...f, { server_name: r.server_name as string, channel_name: r.channel_name as string | null, server_id: r.server_id as number, channel_id: r.channel_id as number | null, notes_count: r.notes_count as number }]; });
      } else if (rd?.sources && Array.isArray(rd.sources) && rd.sources.length > 0) {
        c = (rd.answer as string) || result.content || ""; t = "query_answer";
        m = { sources: rd.sources as ConsoleMessageMetadata["sources"], server_name: rd.server_name as string | undefined, channel_name: rd.channel_name as string | undefined, total_notes_fetched: rd.total_notes_fetched as number | undefined };
      } else if (result.plugin_responses && result.plugin_responses.length > 0) {
        c = result.plugin_responses.map(pr => `[${pr.plugin_name}] ${pr.message}`).join("\n"); t = "plugin_response";
      } else if (result.type === "clear") { c = result.content || "Session cleared."; t = "clear"; }
      else if (result.type === "todo_created") { c = result.content || "Todo created."; t = "todo_created"; }
      else if (result.type === "error") { c = result.content || "Error occurred."; t = "error"; }
      else if (result.note) { c = "Note saved successfully."; t = "note"; }
      else if (result.type === "web_result") { c = result.content || ""; t = "web_result"; m = { title: (rd as Record<string, unknown>)?.title as string | undefined, url: (rd as Record<string, unknown>)?.url as string | undefined, web_summary: (rd as Record<string, unknown>)?.summary as string | undefined, favicon: (rd as Record<string, unknown>)?.favicon as string | undefined }; }
      else if (result.type === "code_execution") { c = result.content || ""; t = "code_execution"; m = { code: (rd as Record<string, unknown>)?.code as string | undefined, output: (rd as Record<string, unknown>)?.output as string | undefined, language: (rd as Record<string, unknown>)?.language as string | undefined }; }
      else if (result.content) { c = result.content; }
      else { c = JSON.stringify(result, null, 2); }
      if (tc || tr) m = { ...m, tool_calls: (tc as ConsoleMessageMetadata["tool_calls"]) || undefined, tool_results: (tr as ConsoleMessageMetadata["tool_results"]) || undefined };
      const msg: ConsoleMessage = { id: -(Date.now() + 1), session_id: currentSessionId || 0, role: result.type === "clear" ? "system" : "assistant", content: c, type: t, created_at: new Date().toISOString(), metadata: m };
      if (result.type === "clear") setMessages([msg]); else setMessages(prev => [...prev, msg]);
      loadSessions();
    } catch {
      setMessages(prev => [...prev, { id: -(Date.now() + 1), session_id: currentSessionId || 0, role: "assistant", content: "Failed to execute command. Please try again.", type: "error", created_at: new Date().toISOString() }]);
    } finally {
      stopTracking();
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const title = headerTitle || (scope.type === "server" ? `SERVER_CONSOLE #${scope.serverId}` : "CHATNOTE_TERMINAL_V1.0");
  const session = sessions.find(s => s.id === currentSessionId);

  return (
    <div className="flex-1 bg-[#1e1f22] flex flex-col h-full overflow-hidden font-mono">
      <header className="h-12 bg-[#313338] border-b border-[#1e1f22] px-4 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="text-[#949ba4] hover:text-white transition-colors" title="Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
          )}
          <Terminal size={18} className="text-[#5865F2]" />
          <h2 className="font-bold text-white text-[14px] uppercase tracking-wider">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {!compact && (
            <button onClick={() => setSidebarCollapsed(v => !v)} className="text-[#949ba4] hover:text-white transition-colors" title="Toggle Sidebar">
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
          {showRefresh && <button className="text-[#949ba4] hover:text-white transition-colors" title="Restart Services"><RefreshCw size={16} /></button>}
        </div>
      </header>

      {loadedContext.length > 0 && (
        <div className="bg-[#2b2d31] border-b border-[#1e1f22] px-4 py-2 flex items-center gap-2 flex-wrap animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-[11px] text-[#949ba4] font-medium uppercase tracking-wider mr-1">上下文:</span>
          {loadedContext.map((ctx, i) => (
            <div key={`${ctx.server_id}-${ctx.channel_id}`} className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-full px-3 py-1 text-xs group hover:border-purple-400/50 transition-all duration-150">
              <span className="text-purple-300 font-medium">@{ctx.server_name}</span>
              {ctx.channel_name && (<><span className="text-[#949ba4]">/</span><span className="text-[#5865f2] font-medium">#{ctx.channel_name}</span></>)}
              <span className="text-[#949ba4] ml-1">({ctx.notes_count}条笔记)</span>
              <button onClick={() => handleRemoveContext(i)} className="text-[#949ba4] hover:text-red-400 hover:bg-red-400/10 rounded-full p-0.5 transition-colors ml-0.5" title="移除上下文"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <SessionPanel
          sessions={sessions} currentSessionId={currentSessionId} editingSessionId={editingSessionId}
          editingTitle={editingTitle} sidebarCollapsed={sidebarCollapsed}
          onSelectSession={selectSession} onCreateSession={createSession} onDeleteSession={deleteSession}
          onArchiveSession={openArchiveDialog} onStartEditTitle={startEditTitle} onSaveTitle={saveTitle}
          onCancelEdit={() => setEditingSessionId(null)} onEditTitleChange={setEditingTitle}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <MessageList
            messages={messages} initMessages={initMessages} hoveredMessageId={hoveredMessageId}
            onHoverMessage={setHoveredMessageId} onCopy={handleCopyText} onImport={handleImportToChannel}
            onQuerySources={setQuerySourcesMessage} isLoading={isLoading} loadingSession={loadingSession}
            messagesContainerRef={messagesContainerRef} logEndRef={logEndRef} onNavigateToSource={onNavigateToSource}
          />
          {isLoading && disconnected && (
            <div className="px-3 py-2 bg-[#f23f43]/10 border border-[#f23f43]/20 text-[#f23f43] text-xs rounded mx-3 shrink-0">
              WebSocket 连接中断 — AI 进度更新已停止，等待 HTTP 响应...
            </div>
          )}
          {isLoading && currentProgress && (
            <div className="px-4 py-1 shrink-0">
              <AiProgressPanel progress={currentProgress} />
            </div>
          )}
          <ConsoleInput
            input={input} isLoading={isLoading} aiEnabled={aiEnabled} onToggleAI={onToggleAI}
            onInputChange={handleInputChange} onKeyDown={handleKeyDown} onSubmit={handleSubmit}
            showSuggestions={showSuggestions} suggestions={suggestions} selectedSuggestion={selectedSuggestion}
            suggestionType={suggestionType} suggestionFilter={suggestionFilter} onApplySuggestion={applySuggestion}
            footerLabel={footerLabel} currentSession={session} inputRef={inputRef}
          />
        </div>
      </div>

      <ConsoleModals
        showSelectionToolbar={showSelectionToolbar} toolbarPosition={toolbarPosition} selectedText={selectedText}
        onCopySelection={() => { handleCopyText(selectedText); setShowSelectionToolbar(false); }}
        onImportSelection={() => { handleImportToChannel(selectedText); }}
        selectionToolbarRef={selectionToolbarRef}
        importContent={importContent} importServers={archiveServers} importChannels={archiveChannels}
        onImportClose={() => setImportContent("")} onImportServerSelect={handleImportServerSelect}
        showArchiveDialog={showArchiveDialog} archiveServers={archiveServers} archiveChannels={archiveChannels}
        selectedArchiveServer={selectedArchiveServer} selectedArchiveChannel={selectedArchiveChannel}
        archiveLoading={archiveLoading}
        onArchiveServerSelect={handleServerSelect} onArchiveChannelSelect={setSelectedArchiveChannel}
        onArchive={handleArchive}
        onArchiveClose={() => { setShowArchiveDialog(false); setArchiveSessionId(null); setSelectedArchiveServer(null); setSelectedArchiveChannel(null); }}
        querySourcesMessage={querySourcesMessage} onQuerySourcesClose={() => setQuerySourcesMessage(null)}
        onNavigateToSource={onNavigateToSource}
      />
    </div>
  );
}
