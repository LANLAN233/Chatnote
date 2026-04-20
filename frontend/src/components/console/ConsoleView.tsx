import { useState, useRef, useEffect, useCallback } from "react";
import { Terminal } from "lucide-react";
import { consoleApi } from "../../services";
import type { ConsoleLog } from "../../types";

export default function ConsoleView() {
  const [logs, setLogs] = useState<ConsoleLog[]>([
    {
      id: "init",
      type: "system",
      content: "ChatNote Console v0.2 — Type /help for available commands",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
      const result = response.data as { type: string; content?: string; data?: unknown };

      if (result.type === "clear") {
        setLogs([
          {
            id: "cleared",
            type: "system",
            content: "Console cleared.",
            timestamp: new Date(),
          },
        ]);
      } else if (result.type === "todo_created") {
        addLog("output", result.content || "Todo created.");
      } else if (result.type === "error") {
        addLog("error", result.content || "Error occurred.");
      } else if (result.note) {
        addLog(
          "output",
          `Note saved to server #${(result as Record<string, unknown>).server_id}, channel #${(result as Record<string, unknown>).channel_id}`,
        );
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
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-12 px-4 flex items-center border-b border-[var(--border-color)] shadow-[0_1px_0_var(--shadow-color)] shrink-0">
        <Terminal className="w-5 h-5 text-[var(--text-muted)] mr-2" />
        <h2 className="font-semibold text-white">Console</h2>
        <span className="ml-3 text-[12px] text-[var(--text-muted)]">
          Type notes or /commands
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed">
        {logs.map((log) => (
          <div key={log.id} className="mb-1">
            {log.type === "input" && (
              <div className="flex items-start gap-2">
                <span className="text-[var(--success)] shrink-0">$</span>
                <span className="text-white">{log.content}</span>
              </div>
            )}
            {log.type === "output" && (
              <pre className="text-[var(--text-secondary)] whitespace-pre-wrap pl-4">{log.content}</pre>
            )}
            {log.type === "error" && (
              <pre className="text-[var(--danger)] whitespace-pre-wrap pl-4">{log.content}</pre>
            )}
            {log.type === "system" && (
              <div className="text-[var(--text-muted)] italic pl-4">{log.content}</div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="text-[var(--text-muted)] pl-4 animate-pulse">Processing...</div>
        )}
      </div>

      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex items-center gap-3 bg-[var(--bg-tertiary)] rounded-lg px-4 py-3">
          <span className="text-[var(--success)] font-mono shrink-0">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a note or /command..."
            className="flex-1 bg-transparent text-[var(--text-primary)] text-[15px] placeholder:text-[var(--text-muted)] outline-none font-mono"
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
