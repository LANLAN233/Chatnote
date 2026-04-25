import { useState, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { X, Play, Check, Rocket, FileCode, AlertCircle } from "lucide-react";
import pluginApi from "../../services/pluginApi";

interface PluginDevConsoleProps {
  onClose: () => void;
  onDeployed: () => void;
}

const BLANK_TEMPLATE = `from app.plugins.base import BasePlugin
from typing import Optional

class MyPlugin(BasePlugin):
    name = "My Plugin"
    version = "1.0.0"
    description = "A custom plugin"
    author = "You"

    def on_message(self, content: str, context: dict) -> Optional[str]:
        # Handle incoming messages
        return None

    def on_command(self, command: str, args: list, context: dict) -> Optional[str]:
        # Handle /commands
        return None
`;

const MATH_SOLVER_TEMPLATE = `from app.plugins.base import BasePlugin
import math
import re
from typing import Any, Optional

class MathSolverPlugin(BasePlugin):
    name = "Math Solver"
    version = "1.0.0"
    description = "自动检测并计算数学表达式"
    author = "ChatNote"

    MATH_PATTERN = re.compile(r"\\d+\\.?\\d*(?:\\s*[+\\-*/]\\s*\\d+\\.?\\d*)+")

    def on_message(self, content: str, context: dict[str, Any] | None = None) -> str | None:
        matches = self.MATH_PATTERN.findall(content)
        if matches:
            for match in matches:
                if match and len(match) > 2:
                    result = self._evaluate(match)
                    if result is not None:
                        return f"检测到数学表达式: {match} = **{result}**"
        return None

    def on_command(self, command: str, args: list[str], context: dict[str, Any] | None = None) -> str | None:
        if command == "calc":
            if not args:
                return "用法: /calc <表达式>"
            expression = " ".join(args)
            result = self._evaluate(expression)
            if result is not None:
                return f"{expression} = **{result}**"
            return f"无法计算: {expression}"
        return None

    def _evaluate(self, expression: str) -> float | int | None:
        try:
            expr = expression.lower()
            expr = expr.replace("pi", str(math.pi))
            expr = expr.replace("e", str(math.e))
            for func in ["sin", "cos", "tan", "sqrt", "log", "abs"]:
                if func in expr:
                    expr = expr.replace(func, f"math.{func}")
            allowed = set("0123456789+-*/.() **mathcosintaqrulbgf")
            if not all(c in allowed for c in expr):
                return None
            result = eval(expr, {"__builtins__": {}}, {"math": math})
            if isinstance(result, float):
                if result.is_integer():
                    return int(result)
                return round(result, 6)
            return result
        except Exception:
            return None
`;

const TEMPLATES: Record<string, { name: string; code: string }> = {
  blank: { name: "Blank", code: BLANK_TEMPLATE },
  math_solver: { name: "Math Solver (参考)", code: MATH_SOLVER_TEMPLATE },
};

interface LogEntry {
  type: "info" | "success" | "error" | "warning";
  message: string;
  timestamp: Date;
}

export default function PluginDevConsole({ onClose, onDeployed }: PluginDevConsoleProps) {
  const [activeTab, setActiveTab] = useState<"code" | "manifest">("code");
  const [code, setCode] = useState(BLANK_TEMPLATE);
  const [template, setTemplate] = useState("blank");
  const [manifest, setManifest] = useState({
    id: "my-plugin",
    name: "My Plugin",
    version: "1.0.0",
    description: "",
    author: "",
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const editorRef = useRef<any>(null);

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev, { type, message, timestamp: new Date() }]);
  }, []);

  const handleTemplateChange = (tpl: string) => {
    setTemplate(tpl);
    if (TEMPLATES[tpl]) {
      setCode(TEMPLATES[tpl].code);
    }
  };

  const handleValidate = () => {
    addLog("info", "Validating code...");
    // Basic validation: check for BasePlugin import and class definition
    if (!code.includes("from app.plugins.base import BasePlugin")) {
      addLog("error", "Missing import: from app.plugins.base import BasePlugin");
      return;
    }
    if (!code.includes("class ") || !code.includes("BasePlugin")) {
      addLog("error", "Missing BasePlugin subclass definition");
      return;
    }
    if (!manifest.id || !manifest.name) {
      addLog("error", "Manifest id and name are required");
      return;
    }
    addLog("success", "Validation passed (basic checks)");
  };

  const handleTestRun = async () => {
    addLog("info", "Running test... (not yet implemented on backend)");
    // In a full implementation, this would call a backend test endpoint
    addLog("warning", "Test Run requires backend sandbox test endpoint (not implemented yet)");
  };

  const handleDeploy = async () => {
    if (!manifest.id || !manifest.name) {
      addLog("error", "Manifest id and name are required");
      return;
    }
    if (!code.trim()) {
      addLog("error", "Plugin code is empty");
      return;
    }

    setIsDeploying(true);
    addLog("info", `Deploying plugin: ${manifest.id}...`);

    try {
      await pluginApi.deployPlugin({
        id: manifest.id,
        manifest: {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description || undefined,
          author: manifest.author || undefined,
        },
        code,
      });
      addLog("success", `Plugin "${manifest.name}" deployed successfully!`);
      addLog("info", "Go to the plugin list and enable it.");
      onDeployed();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || "Deploy failed";
      addLog("error", msg);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1e1f22]">
      {/* Header */}
      <header className="h-12 border-b border-[#2b2d31] px-4 flex items-center justify-between bg-[#313338] flex-shrink-0">
        <h2 className="font-bold text-white flex items-center gap-2 text-[15px]">
          <FileCode size={18} className="text-[#5865f2]" /> Developer Console
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-[#35373c] rounded transition-colors"
        >
          <X size={18} />
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-[#2b2d31] border-r border-[#1e1f22] flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-[#1e1f22]">
            <label className="block text-[10px] font-bold text-[#949ba4] uppercase tracking-wider mb-1.5">
              Template
            </label>
            <select
              value={template}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#1e1f22] border border-[#3f4147] rounded text-white text-xs focus:outline-none focus:border-[#5865f2]"
            >
              {Object.entries(TEMPLATES).map(([key, tpl]) => (
                <option key={key} value={key}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </div>

          <nav className="p-2 space-y-1">
            <button
              onClick={() => setActiveTab("code")}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                activeTab === "code"
                  ? "bg-[#35373c] text-white"
                  : "text-[#949ba4] hover:text-white hover:bg-[#35373c]"
              }`}
            >
              main.py
            </button>
            <button
              onClick={() => setActiveTab("manifest")}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                activeTab === "manifest"
                  ? "bg-[#35373c] text-white"
                  : "text-[#949ba4] hover:text-white hover:bg-[#35373c]"
              }`}
            >
              manifest.json
            </button>
          </nav>

          <div className="mt-auto p-3 border-t border-[#1e1f22] space-y-2">
            <button
              onClick={handleValidate}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#35373c] hover:bg-[#3f4147] text-white text-xs rounded transition-colors"
            >
              <Check size={14} /> Validate
            </button>
            <button
              onClick={handleTestRun}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#35373c] hover:bg-[#3f4147] text-white text-xs rounded transition-colors"
            >
              <Play size={14} /> Test Run
            </button>
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white text-xs font-bold rounded transition-colors"
            >
              <Rocket size={14} />
              {isDeploying ? "Deploying..." : "Deploy"}
            </button>
          </div>
        </aside>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeTab === "code" ? (
            <div className="flex-1">
              <Editor
                height="100%"
                defaultLanguage="python"
                value={code}
                onChange={(value) => setCode(value || "")}
                onMount={(editor) => {
                  editorRef.current = editor;
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  roundedSelection: false,
                  scrollBeyondLastLine: false,
                  readOnly: false,
                  automaticLayout: true,
                  theme: "vs-dark",
                }}
              />
            </div>
          ) : (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-lg mx-auto space-y-4">
                <h3 className="text-white font-bold text-sm mb-4">Plugin Manifest</h3>
                {[
                  { key: "id" as const, label: "Plugin ID", placeholder: "my-plugin", required: true },
                  { key: "name" as const, label: "Name", placeholder: "My Plugin", required: true },
                  { key: "version" as const, label: "Version", placeholder: "1.0.0" },
                  { key: "description" as const, label: "Description", placeholder: "What does this plugin do?" },
                  { key: "author" as const, label: "Author", placeholder: "Your name" },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium text-[#dbdee1] mb-1">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      value={manifest[field.key]}
                      onChange={(e) =>
                        setManifest((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 bg-[#1e1f22] border border-[#3f4147] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logs Panel */}
          <div className="h-40 bg-[#1e1f22] border-t border-[#2b2d31] flex flex-col flex-shrink-0">
            <div className="px-3 py-1.5 border-b border-[#2b2d31] flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#949ba4] uppercase tracking-wider">
                Logs
              </span>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] text-[#949ba4] hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
              {logs.length === 0 && (
                <p className="text-[#949ba4] italic">No logs yet...</p>
              )}
              {logs.map((log, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[#949ba4] shrink-0">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  {log.type === "error" && <AlertCircle size={12} className="text-red-400 shrink-0 mt-0.5" />}
                  {log.type === "success" && <Check size={12} className="text-green-400 shrink-0 mt-0.5" />}
                  <span
                    className={
                      log.type === "error"
                        ? "text-red-400"
                        : log.type === "success"
                        ? "text-green-400"
                        : log.type === "warning"
                        ? "text-yellow-400"
                        : "text-[#dbdee1]"
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
