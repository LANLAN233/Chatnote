import { useState, useEffect } from "react";
import { useAuthStore } from "../../stores";
import { settingsApi } from "../../services";
import { X, Key, Bell, CheckCircle2, Loader2 } from "lucide-react";
import ExportPanel from "./ExportPanel";
import type { UserSettingsUpdate } from "../../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "general" | "ai" | "notifications" | "export";

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user, updateSettings } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [apiKey, setApiKey] = useState("");
  const [llmProvider, setLlmProvider] = useState(user?.preferred_llm || "zhipu");
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.notifications_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setLlmProvider(user.preferred_llm || "zhipu");
      setNotificationsEnabled(user.notifications_enabled ?? true);
    }
  }, [user]);

  useEffect(() => {
    if (!isOpen) {
      setSaved(false);
      setError("");
      setApiKey("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const requestNotificationPermission = async () => {
    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    setNotificationsEnabled(enabled);
    try {
      await updateSettings({ notifications_enabled: enabled });
    } catch {}
  };

  const saveAISettings = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const payload: UserSettingsUpdate = {
        preferred_llm: llmProvider,
      };
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }
      await updateSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "通用", icon: <span className="text-sm">⚙️</span> },
    { id: "ai", label: "AI设置", icon: <Key className="w-4 h-4" /> },
    { id: "notifications", label: "通知", icon: <Bell className="w-4 h-4" /> },
    { id: "export", label: "数据导出", icon: <span className="text-sm">💾</span> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#313338] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-[#1e1f22] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1f22]">
          <h2 className="text-lg font-bold text-white">设置</h2>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-[#35373c] text-[#949ba4] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-44 border-r border-[#1e1f22] p-3 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-sm font-medium
                  transition-colors
                  ${activeTab === tab.id
                    ? "bg-[#3f4147] text-white"
                    : "text-[#949ba4] hover:bg-[#35373c] hover:text-white"
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
              <div className="space-y-8">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">通用设置</h3>
                  <p className="text-sm text-[#949ba4]">管理你的应用外观和基本信息</p>
                </div>

                <div className="bg-[#2b2d31] rounded-xl p-5 space-y-6 border border-[#1e1f22]">
                  <div className="pt-2 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#5865f2]/20 flex items-center justify-center text-[#5865f2] font-bold text-sm">
                        {(user?.display_name || user?.username || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{user?.display_name || user?.username}</p>
                        <p className="text-xs text-[#949ba4]">{user?.username}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "ai" && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">AI 设置</h3>
                  <p className="text-sm text-[#949ba4]">配置你的智能分类和助手服务</p>
                </div>

                <div className="bg-[#2b2d31] rounded-xl p-5 space-y-5 border border-[#1e1f22]">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">
                      LLM 提供商
                    </label>
                    <select
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#1e1f22] text-white rounded-xl border border-[#3f4147] focus:border-[#5865f2] transition-colors text-sm outline-none"
                    >
                      <option value="zhipu">智谱 AI</option>
                      <option value="openai">OpenAI</option>
                      <option value="qwen">通义千问</option>
                      <option value="mock">模拟模式（演示）</option>
                    </select>
                    <p className="text-xs text-[#949ba4] mt-2">
                      选择你喜欢的 AI 服务提供商，支持 OpenAI、智谱和通义千问
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2 text-white">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={user?.api_key_encrypted ? "••••••••••••" : "输入您的 API Key"}
                      className="w-full px-4 py-2.5 bg-[#1e1f22] text-white rounded-xl border border-[#3f4147] focus:border-[#5865f2] transition-colors text-sm outline-none placeholder-[#949ba4]"
                    />
                    <p className="text-xs text-[#949ba4] mt-2">
                      API Key 将存储在服务器端，不会暴露给前端
                    </p>
                  </div>

                  {error && (
                    <p className="text-sm text-[#f23f43] bg-[#f23f43]/10 px-3 py-2 rounded-lg">{error}</p>
                  )}

                  <button
                    onClick={saveAISettings}
                    disabled={saving}
                    className="w-full px-4 py-2.5 bg-[#5865f2] text-white rounded-xl hover:bg-[#4752c4] transition-all font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
                    {saved ? "已保存" : "保存设置"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">通知设置</h3>
                  <p className="text-sm text-[#949ba4]">管理浏览器通知和提醒</p>
                </div>

                <div className="bg-[#2b2d31] rounded-xl p-5 space-y-6 border border-[#1e1f22]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">日程提醒</p>
                      <p className="text-sm text-[#949ba4] mt-0.5">
                        在日程开始前接收浏览器通知
                      </p>
                    </div>
                    <button
                      onClick={requestNotificationPermission}
                      className={`
                        relative w-14 h-8 rounded-full transition-colors duration-300 flex items-center px-1
                        ${notificationsEnabled
                          ? "bg-[#23a559]"
                          : "bg-[#4f545c]"
                        }
                      `}
                    >
                      <div className={`
                        w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center
                        transition-transform duration-300
                        ${notificationsEnabled ? "translate-x-6" : "translate-x-0"}
                      `}>
                        <Bell className={`w-3 h-3 ${notificationsEnabled ? "text-[#23a559]" : "text-[#949ba4]"}`} />
                      </div>
                    </button>
                  </div>

                  {!notificationsEnabled && (
                    <p className="text-sm text-yellow-400 bg-yellow-400/10 px-3 py-2 rounded-lg">
                      请启用通知以接收日程提醒
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "export" && (
              <div>
                <div className="mb-6">
                  <h3 className="text-base font-bold text-white mb-1">数据导出</h3>
                  <p className="text-sm text-[#949ba4]">将你的笔记数据导出为多种格式</p>
                </div>
                <ExportPanel />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
