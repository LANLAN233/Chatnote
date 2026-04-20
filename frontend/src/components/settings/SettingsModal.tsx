import { useState, useEffect } from "react";
import { useAuthStore } from "../../stores";
import { X, Moon, Sun, Key, Bell } from "lucide-react";
import ExportPanel from "./ExportPanel";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "general" | "ai" | "notifications" | "export";

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [llmProvider, setLlmProvider] = useState(user?.preferred_llm || "zhipu");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const isDark = savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDarkMode(isDark);
    setNotificationsEnabled(Notification.permission === "granted");
  }, []);

  if (!isOpen) return null;

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    }
  };

  const requestNotificationPermission = async () => {
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
  };

  const saveAISettings = () => {
    // In a real app, this would save to the backend
    alert("AI设置已保存（演示模式）");
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "通用", icon: <Sun className="w-4 h-4" /> },
    { id: "ai", label: "AI设置", icon: <Key className="w-4 h-4" /> },
    { id: "notifications", label: "通知", icon: <Bell className="w-4 h-4" /> },
    { id: "export", label: "数据导出", icon: <span className="text-sm">💾</span> },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold">设置</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-40 border-r dark:border-gray-700 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                  transition-colors duration-200
                  ${activeTab === tab.id
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === "general" && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">通用设置</h3>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">深色模式</p>
                    <p className="text-sm text-gray-500">切换应用主题</p>
                  </div>
                  <button
                    onClick={toggleDarkMode}
                    className={`
                      p-2 rounded-lg transition-colors
                      ${isDarkMode 
                        ? "bg-gray-800 text-yellow-400" 
                        : "bg-gray-100 text-gray-600"
                      }
                    `}
                  >
                    {isDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                  </button>
                </div>

                <div className="pt-4 border-t dark:border-gray-700">
                  <p className="text-sm text-gray-500">
                    当前用户: {user?.display_name || user?.username}
                  </p>
                  <p className="text-sm text-gray-500">
                    用户名: {user?.username}
                  </p>
                </div>
              </div>
            )}

            {activeTab === "ai" && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">AI设置</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      LLM 提供商
                    </label>
                    <select
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                    >
                      <option value="zhipu">智谱 AI</option>
                      <option value="openai">OpenAI</option>
                      <option value="qwen">通义千问</option>
                      <option value="mock">模拟模式（演示）</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="输入您的 API Key"
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      API Key 将加密存储在服务器端
                    </p>
                  </div>

                  <button
                    onClick={saveAISettings}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    保存设置
                  </button>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">通知设置</h3>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">日程提醒</p>
                    <p className="text-sm text-gray-500">
                      在日程开始前接收浏览器通知
                    </p>
                  </div>
                  <button
                    onClick={requestNotificationPermission}
                    className={`
                      px-4 py-2 rounded-lg transition-colors
                      ${notificationsEnabled
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 dark:bg-gray-700"
                      }
                    `}
                  >
                    {notificationsEnabled ? "已启用" : "启用通知"}
                  </button>
                </div>

                {!notificationsEnabled && (
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    请启用通知以接收日程提醒
                  </p>
                )}
              </div>
            )}

            {activeTab === "export" && <ExportPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
