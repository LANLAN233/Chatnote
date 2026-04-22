import { useState, useRef, useEffect, useCallback } from "react";
import { Terminal, Trash2, RefreshCw, SendHorizontal, Zap, Code } from "lucide-react";
import { consoleApi } from "../../services";
import type { ConsoleLog } from "../../types";

export default function ConsoleView() {
  const [logs, setLogs] = useState<ConsoleLog[]>([
    { id: "init-1", type: "system", content: "ChatNote Context initialized.", timestamp: new Date() },
    { id: "init-2", type: "system", content: "AI Sub-engine connected.", timestamp: new Date() },
    { id: "init-3", type: "system", content: "Capturing local knowledge for #general.", timestamp: new Date() },
    {
      id: "banner",
      type: "output",
      content: "ChatNote Console v0.2 — Type /help for available commands",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    addLog("input", text);
    setInput("");
    setIsLoading(true);

    try {
      const { data: response } = await consoleApi.execute(text);
      const result = response.data as { type: string; content?: string; data?: unknown; note?: unknown; plugin_responses?: Array<{ plugin_name: string; message: string }> };

      // Display plugin responses first
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
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

  return (
    <div className="flex-1 bg-[#1e1f22] flex flex-col h-full overflow-hidden font-mono">
      <header className="h-12 bg-[#313338] border-b border-[#1e1f22] px-4 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-[#5865F2]" />
          <h2 className="font-bold text-white text-[14px] uppercase tracking-wider">
            CHATNOTE_TERMINAL_V1.0
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-[#949ba4] hover:text-white transition-colors" title="Restart Services">
            <RefreshCw size={16} />
          </button>
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
          [SYSTEM] ChatNote Context initialized.<br />
          [SYSTEM] AI Sub-engine connected.<br />
          [SYSTEM] Capturing local knowledge for #general.
        </div>

        {logs.slice(3).map((log) => (
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
            <Zap size={14} className="text-[#5865f2]" />
            <span>Smart Capture</span>
          </div>

          <div className="relative group bg-[#1e1f22] rounded-xl border border-[#3f4147] focus-within:border-[#5865f2] transition-all shadow-lg">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="记录笔记，或输入 '/' 指令..."
              className="w-full bg-transparent outline-none text-white text-[15px] p-4 resize-none h-32 placeholder-gray-600 leading-relaxed"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-3">
              <div className="flex items-center gap-2 text-[10px] text-gray-500 mr-2">
                <Code size={12} />
                <span>Shift + Enter for multi-line</span>
              </div>
              <button
                onClick={handleSubmit}
                className={`p-2.5 rounded-lg transition-all ${input.trim() ? "bg-[#5865f2] text-white hover:scale-105" : "bg-[#4f545c] text-gray-500 cursor-not-allowed"}`}
              >
                <SendHorizontal size={20} />
              </button>
            </div>
          </div>

          <div className="flex gap-6 text-[11px] text-gray-500 px-1 font-bold">
            <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"><span className="text-[#5865f2]">/help</span> View commands</span>
            <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"><span className="text-[#5865f2]">/clear</span> Reset terminal</span>
            <span className="flex items-center gap-1 hover:text-gray-300 cursor-pointer"><span className="text-[#5865f2]">/search</span> Search notes</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
