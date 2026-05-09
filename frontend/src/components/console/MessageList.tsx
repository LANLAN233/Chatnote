import { useRef } from "react";
import { Copy, FileInput, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ConsoleMessage } from "../../types";
import UrlPreviewCard from "../common/UrlPreviewCard";
import CodeExecutionBlock from "../common/CodeExecutionBlock";
import ToolCallIndicator from "../common/ToolCallIndicator";
import ToolResultAccordion from "../common/ToolResultAccordion";
import AgentConversation from "../console/AgentConversation";

interface MessageListProps {
  messages: ConsoleMessage[];
  initMessages: string[];
  hoveredMessageId: number | null;
  onHoverMessage: (id: number | null) => void;
  onCopy: (text: string) => void;
  onImport: (text: string) => void;
  onQuerySources: (msg: ConsoleMessage) => void;
  isLoading: boolean;
  loadingSession: boolean;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  logEndRef: React.RefObject<HTMLDivElement | null>;
  onNavigateToSource?: (serverName: string, channelName: string) => void;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour12: false });
}

export default function MessageList({
  messages,
  initMessages,
  hoveredMessageId,
  onHoverMessage,
  onCopy,
  onImport,
  onQuerySources,
  isLoading,
  loadingSession,
  messagesContainerRef,
  logEndRef,
  onNavigateToSource,
}: MessageListProps) {
  const localLogEndRef = useRef<HTMLDivElement>(null);
  const endRef = logEndRef || localLogEndRef;

  return (
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
            onMouseEnter={() => onHoverMessage(msg.id)}
            onMouseLeave={() => onHoverMessage((current) => (current === msg.id ? null : current))}
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
                ) : msg.role === "assistant" &&
                  !["context_loaded", "code_execution", "web_result", "tool_call", "tool_result"].includes(
                    msg.type
                  ) ? (
                  <div className="prose prose-invert prose-sm max-w-none break-words select-text">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words leading-relaxed select-text">
                    {msg.content}
                  </div>
                )}

                {msg.type === "query_answer" && msg.metadata?.stages && msg.metadata.stages.length > 0 && (
                  <div className="mt-3">
                    <AgentConversation stages={msg.metadata.stages} />
                  </div>
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
                          onClick={() => onQuerySources(msg)}
                          className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer underline truncate max-w-[240px] text-left transition-colors"
                          title={`@${src.server} #${src.channel}: ${src.excerpt}`}
                        >
                          @{src.server}/#{src.channel}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => onQuerySources(msg)}
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
                onClick={() => onCopy(msg.content)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] text-[#dbdee1] hover:bg-[#5865f2] hover:text-white rounded transition-colors"
              >
                <Copy className="w-4 h-4" />
                <span>复制</span>
              </button>
              <button
                onClick={() => onImport(msg.content)}
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

      <div ref={endRef} />
    </main>
  );
}
