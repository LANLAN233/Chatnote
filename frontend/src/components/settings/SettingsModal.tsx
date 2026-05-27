import { useState, useEffect } from "react";
import { useAuthStore } from "../../stores";
import { settingsApi, apiKeyApi } from "../../services";
import { X, User, Key, Bell, Palette, Database, Brain, Shield, Loader2, CheckCircle2, AlertCircle, Trash2, Eye, EyeOff, Lock, Sparkles, Zap, Crown, Image } from "lucide-react";
import ExportPanel from "./ExportPanel";
import type { UserSettingsUpdate, UserApiKey, ProviderInfo } from "../../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabId =
  | "account"
  | "profile"
  | "ai-preferences"
  | "api-keys"
  | "appearance"
  | "notifications"
  | "export";

interface TabGroup {
  label: string;
  tabs: { id: TabId; label: string; icon: React.ReactNode }[];
}

const tabGroups: TabGroup[] = [
  {
    label: "用户设置",
    tabs: [
      { id: "account", label: "我的账号", icon: <User size={16} /> },
      { id: "profile", label: "资料编辑", icon: <Shield size={16} /> },
    ],
  },
  {
    label: "AI 设置",
    tabs: [
      { id: "ai-preferences", label: "AI 提供商偏好", icon: <Brain size={16} /> },
      { id: "api-keys", label: "API Key 管理", icon: <Key size={16} /> },
    ],
  },
  {
    label: "应用设置",
    tabs: [
      { id: "appearance", label: "外观", icon: <Palette size={16} /> },
      { id: "notifications", label: "通知", icon: <Bell size={16} /> },
    ],
  },
  {
    label: "数据",
    tabs: [
      { id: "export", label: "数据导出", icon: <Database size={16} /> },
    ],
  },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user, updateSettings, apiKeys, fetchApiKeys, addApiKey, deleteApiKey, toggleProvider } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>("account");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Form states
  const [displayName, setDisplayName] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [theme, setTheme] = useState("dark");

  // AI provider states
  const [providerList, setProviderList] = useState<ProviderInfo[]>([]);
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [providerSaving, setProviderSaving] = useState(false);

  // API Key states
  const [keyInputs, setKeyInputs] = useState<Record<string, { key: string; model: string; show: boolean; modelMode: "preset" | "custom"; customModel: string }>>({});
  const [keyLoading, setKeyLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setNotificationsEnabled(user.notifications_enabled ?? true);
      setTheme(user.theme || "dark");
      setEnabledProviders(user.enabled_providers || (user.preferred_llm ? [user.preferred_llm] : []));
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      fetchApiKeys();
      loadProviders();
      setSaved(false);
      setError("");
    }
  }, [isOpen, fetchApiKeys]);

  const loadProviders = async () => {
    try {
      const { data } = await apiKeyApi.providers();
      const providers = (data.data?.providers || []) as ProviderInfo[];
      setProviderList(providers);
      const inputs: Record<string, { key: string; model: string; show: boolean; modelMode: "preset" | "custom"; customModel: string }> = {};
      providers.forEach((p) => {
        const saved = apiKeys.find((k) => k.provider === p.id);
        const savedModel = saved?.model;
        const presets = p.preset_models || [];
        const isPreset = savedModel && presets.includes(savedModel);
        const initialModel = savedModel || p.models.default?.model || "";
        inputs[p.id] = {
          key: "",
          model: initialModel,
          show: false,
          modelMode: isPreset || !savedModel ? "preset" : "custom",
          customModel: isPreset || !savedModel ? "" : savedModel,
        };
      });
      setKeyInputs(inputs);
    } catch {}
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError("");
    try {
      await updateSettings({ display_name: displayName || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProvider = async (providerId: string) => {
    setProviderSaving(true);
    try {
      await toggleProvider(providerId);
    } catch {
      setError("切换失败");
    } finally {
      setProviderSaving(false);
    }
  };

  const handleSaveAppearance = async () => {
    setSaving(true);
    setError("");
    try {
      await updateSettings({ theme });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    setError("");
    try {
      await updateSettings({ notifications_enabled: notificationsEnabled });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async (provider: string) => {
    const input = keyInputs[provider];
    if (!input) return;
    setKeyLoading(true);
    try {
      const modelToSend = input.modelMode === "custom" && input.customModel.trim()
        ? input.customModel.trim()
        : input.model;
      await addApiKey({ provider, api_key: input.key, model: modelToSend });
      setKeyInputs((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], key: "" },
      }));
      // Refresh provider list to update has_api_key status
      loadProviders();
    } catch {
      setError("保存 API Key 失败");
    } finally {
      setKeyLoading(false);
    }
  };

  const handleDeleteApiKey = async (id: number) => {
    try {
      await deleteApiKey(id);
      // Refresh provider list to update has_api_key status
      loadProviders();
    } catch {
      setError("删除失败");
    }
  };

  const getSavedKeyForProvider = (providerId: string): UserApiKey | undefined => {
    return apiKeys.find((k) => k.provider === providerId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-[#313338] animate-in fade-in duration-200">
      {/* Left Sidebar */}
      <div className="w-[280px] bg-[#2b2d31] flex flex-col h-full flex-shrink-0">
        {/* Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#1e1f22]">
          <h2 className="text-white font-bold text-base">用户设置</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#35373c] text-[#949ba4] hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {tabGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] font-bold text-[#949ba4] uppercase tracking-wider px-3 mb-1">
                {group.label}
              </p>
              <div className="space-y-[2px]">
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setError("");
                      setSaved(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative
                      ${activeTab === tab.id
                        ? "bg-[#3f4147] text-white"
                        : "text-[#b5bac1] hover:bg-[#35373c] hover:text-white"
                      }`}
                  >
                    {activeTab === tab.id && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-r" />
                    )}
                    <span className={activeTab === tab.id ? "text-white" : "text-[#80848e]"}>
                      {tab.icon}
                    </span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* User Card */}
        <div className="p-4 border-t border-[#1e1f22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center text-white font-bold text-sm">
              {(user?.display_name || user?.username || "?")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold truncate">{user?.display_name || user?.username}</p>
              <p className="text-[#949ba4] text-xs truncate">{user?.username}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-10 max-w-3xl">
          {error && (
            <div className="mb-6 flex items-center gap-2 text-[#f23f43] text-sm bg-[#f23f43]/10 px-4 py-3 rounded-xl">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Account Tab */}
          {activeTab === "account" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">我的账号</h2>
                <p className="text-[#949ba4] text-sm">查看你的账号信息和登录状态</p>
              </div>

              <div className="bg-[#2b2d31] rounded-xl p-6 space-y-6 border border-[#1e1f22]">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#5865f2] flex items-center justify-center text-white font-bold text-xl">
                    {(user?.display_name || user?.username || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg">{user?.display_name || user?.username}</p>
                    <p className="text-[#949ba4] text-sm">@{user?.username}</p>
                  </div>
                </div>
                <div className="border-t border-[#1e1f22] pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[#949ba4] text-sm">用户 ID</span>
                    <span className="text-white text-sm font-mono">{user?.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#949ba4] text-sm">注册时间</span>
                    <span className="text-white text-sm">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">资料编辑</h2>
                <p className="text-[#949ba4] text-sm">修改你的显示名称等基本信息</p>
              </div>

              <div className="bg-[#2b2d31] rounded-xl p-6 space-y-5 border border-[#1e1f22]">
                <div>
                  <label className="block text-sm font-bold text-[#949ba4] uppercase tracking-wider mb-2">
                    显示名称
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="输入显示名称"
                    className="w-full px-4 py-2.5 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm"
                  />
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#5865f2] text-white rounded-lg font-bold text-sm hover:bg-[#4752c4] transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : null}
                  {saved ? "已保存" : "保存更改"}
                </button>
              </div>
            </div>
          )}

          {/* AI Preferences Tab — 勾选列表 */}
          {activeTab === "ai-preferences" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">AI 模型偏好</h2>
                <p className="text-[#949ba4] text-sm">
                  已配置 API Key 的供应商将出现在下方，勾选以启用。系统将在不同任务中自动选择对应层级的模型。
                </p>
              </div>

              <div className="space-y-3">
                {(() => {
                  const configured = providerList.filter((p) => p.has_api_key);
                  const unconfigured = providerList.filter((p) => !p.has_api_key);

                  const tierIcons: Record<string, React.ReactNode> = {
                    fast: <Zap size={12} />,
                    default: null,
                    strong: <Crown size={12} />,
                    vision: <Image size={12} />,
                  };
                  const tierColors: Record<string, string> = {
                    fast: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                    default: "bg-blue-500/15 text-blue-400 border-blue-500/30",
                    strong: "bg-purple-500/15 text-purple-400 border-purple-500/30",
                    vision: "bg-orange-500/15 text-orange-400 border-orange-500/30",
                  };

                  return (
                    <>
                      {configured.map((provider) => {
                        const isEnabled = enabledProviders.includes(provider.id);
                        const isLastChecked = enabledProviders.length === 1 && isEnabled;
                        const modelTiers = provider.models;

                        return (
                          <div
                            key={provider.id}
                            className={`bg-[#2b2d31] rounded-xl p-5 border transition-colors cursor-pointer ${
                              isEnabled ? "border-[#5865f2]/50 bg-[#5865f2]/5" : "border-[#1e1f22] hover:border-[#3f4147]"
                            }`}
                            onClick={() => {
                              if (isLastChecked) return; // 最后一个不可取消
                              handleToggleProvider(provider.id);
                            }}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                    isEnabled
                                      ? "bg-[#5865f2] border-[#5865f2]"
                                      : "border-[#4f545c]"
                                  }`}
                                >
                                  {isEnabled && (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                                <div>
                                  <span className="text-white font-bold text-sm">{provider.name}</span>
                                  {provider.has_real_vision && (
                                    <span className="ml-2 text-orange-400" title="支持真实多模态识别">
                                      <Sparkles size={13} className="inline" />
                                    </span>
                                  )}
                                  {isLastChecked && (
                                    <span className="ml-2 text-[10px] text-[#80848e] bg-[#80848e]/15 px-1.5 py-0.5 rounded">必选</span>
                                  )}
                                </div>
                              </div>
                              <span className="px-2 py-0.5 bg-[#23a559]/20 text-[#23a559] rounded text-[10px] font-bold">
                                已配置
                              </span>
                            </div>

                            {/* 层级模型展示 */}
                            <div className="flex flex-wrap gap-2 ml-8">
                              {(["fast", "default", "strong", "vision"] as const).map((tier) => {
                                const t = modelTiers[tier];
                                if (!t) return null;
                                return (
                                  <span
                                    key={tier}
                                    className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 ${tierColors[tier] || "bg-gray-500/15 text-gray-400 border-gray-500/30"}`}
                                    title={`${t.label}模型: ${t.model}`}
                                  >
                                    {tierIcons[tier]}
                                    {t.label}: {t.model}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {/* 未配置 Key 的供应商 */}
                      {unconfigured.length > 0 && (
                        <>
                          <div className="flex items-center gap-3 pt-4 pb-1">
                            <div className="flex-1 h-px bg-[#3f4147]" />
                            <span className="text-[10px] text-[#80848e] uppercase tracking-wider">以下供应商未配置 API Key</span>
                            <div className="flex-1 h-px bg-[#3f4147]" />
                          </div>
                          {unconfigured.map((provider) => (
                            <div
                              key={provider.id}
                              className="bg-[#2b2d31]/50 rounded-xl p-5 border border-[#1e1f22] opacity-50"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-5 h-5 rounded border-2 border-[#3f4147] flex items-center justify-center">
                                    <Lock size={10} className="text-[#80848e]" />
                                  </div>
                                  <div>
                                    <span className="text-[#949ba4] font-bold text-sm">{provider.name}</span>
                                    {provider.has_real_vision && (
                                      <span className="ml-2 text-orange-400/50">
                                        <Sparkles size={13} className="inline" />
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 bg-[#80848e]/15 text-[#80848e] rounded text-[10px]">未配置</span>
                              </div>
                              <div className="flex flex-wrap gap-2 ml-8">
                                {(["fast", "default", "strong", "vision"] as const).map((tier) => {
                                  const t = provider.models[tier];
                                  if (!t) return null;
                                  return (
                                    <span
                                      key={tier}
                                      className="text-[10px] px-2 py-0.5 rounded border bg-gray-500/10 text-gray-500 border-gray-500/20 flex items-center gap-1"
                                    >
                                      {tierIcons[tier]}
                                      {t.label}: {t.model}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {configured.length === 0 && (
                        <div className="bg-[#2b2d31] rounded-xl p-8 border border-[#1e1f22] text-center">
                          <Key size={32} className="text-[#80848e] mx-auto mb-3" />
                          <p className="text-[#dbdee1] text-sm font-bold mb-1">尚未配置任何 API Key</p>
                          <p className="text-[#949ba4] text-xs">
                            请先在「API Key 管理」选项卡中添加至少一个供应商的 API Key
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* API Keys Tab */}
          {activeTab === "api-keys" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">API Key 管理</h2>
                <p className="text-[#949ba4] text-sm">管理你的 AI 服务密钥。密钥将加密存储在服务器端。</p>
              </div>

              <div className="space-y-4">
                {providerList.map((provider) => {
                  const saved = getSavedKeyForProvider(provider.id);
                  const defaultModel = provider.models.default?.model || "";
                  const input = keyInputs[provider.id] || { key: "", model: defaultModel, show: false };
                  return (
                    <div key={provider.id} className="bg-[#2b2d31] rounded-xl p-6 border border-[#1e1f22] space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-white font-bold text-sm">{provider.name}</h3>
                          <p className="text-[#949ba4] text-xs">{provider.id}</p>
                        </div>
                        {saved && (
                          <span className="px-2 py-1 bg-[#23a559]/20 text-[#23a559] rounded text-xs font-bold">
                            已配置
                          </span>
                        )}
                      </div>

                      {saved && (
                        <div className="flex items-center gap-2 text-sm">
                          <Key size={14} className="text-[#949ba4]" />
                          <span className="text-[#dbdee1] font-mono">{saved.api_key_masked}</span>
                          <button
                            onClick={() => handleDeleteApiKey(saved.id)}
                            className="ml-auto text-[#f23f43] hover:text-red-300 p-1 rounded hover:bg-[#f23f43]/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-[#949ba4] uppercase tracking-wider mb-1">
                            模型
                          </label>
                            <select
                              value={input.modelMode}
                              onChange={(e) => {
                                const mode = e.target.value as "preset" | "custom";
                                const defModel = provider.models.default?.model || "";
                                setKeyInputs((prev) => ({
                                  ...prev,
                                  [provider.id]: {
                                    ...prev[provider.id],
                                    modelMode: mode,
                                    model: mode === "preset" ? (provider.preset_models?.[0] || defModel) : prev[provider.id].model,
                                  },
                                }));
                              }}
                              className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm mb-2"
                            >
                              <option value="preset">预设模型</option>
                              <option value="custom">自定义输入</option>
                            </select>
                            {input.modelMode === "preset" ? (
                              <select
                                value={input.model}
                                onChange={(e) =>
                                  setKeyInputs((prev) => ({
                                    ...prev,
                                    [provider.id]: { ...prev[provider.id], model: e.target.value },
                                  }))
                                }
                                className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm"
                              >
                                {(provider.preset_models || [provider.models.default?.model || ""]).map((m) => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={input.customModel}
                                onChange={(e) =>
                                  setKeyInputs((prev) => ({
                                    ...prev,
                                    [provider.id]: { ...prev[provider.id], customModel: e.target.value },
                                  }))
                                }
                                placeholder={provider.models.default?.model || ""}
                                className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm"
                              />
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#949ba4] uppercase tracking-wider mb-1">
                            API Key
                          </label>
                          <div className="relative">
                            <input
                              type={input.show ? "text" : "password"}
                              value={input.key}
                              onChange={(e) =>
                                setKeyInputs((prev) => ({
                                  ...prev,
                                  [provider.id]: { ...prev[provider.id], key: e.target.value },
                                }))
                              }
                              placeholder={saved ? "输入新 Key 以更新" : "输入 API Key"}
                              className="w-full px-3 py-2 pr-10 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm"
                            />
                            <button
                              onClick={() =>
                                setKeyInputs((prev) => ({
                                  ...prev,
                                  [provider.id]: { ...prev[provider.id], show: !prev[provider.id].show },
                                }))
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#949ba4] hover:text-white"
                            >
                              {input.show ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => handleSaveApiKey(provider.id)}
                          disabled={keyLoading || !input.key.trim()}
                          className="px-4 py-2 bg-[#5865f2] text-white rounded-lg font-bold text-xs hover:bg-[#4752c4] transition-all disabled:opacity-60 flex items-center gap-2"
                        >
                          {keyLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          {saved ? "更新 Key" : "添加 Key"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === "appearance" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">外观</h2>
                <p className="text-[#949ba4] text-sm">自定义应用的外观主题</p>
              </div>

              <div className="bg-[#2b2d31] rounded-xl p-6 space-y-5 border border-[#1e1f22]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-sm">主题</p>
                    <p className="text-[#949ba4] text-xs mt-0.5">选择适合你的界面风格</p>
                  </div>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="px-4 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm"
                  >
                    <option value="dark">深色</option>
                    <option value="light">浅色</option>
                  </select>
                </div>

                <button
                  onClick={handleSaveAppearance}
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#5865f2] text-white rounded-lg font-bold text-sm hover:bg-[#4752c4] transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : null}
                  {saved ? "已保存" : "保存更改"}
                </button>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">通知</h2>
                <p className="text-[#949ba4] text-sm">管理浏览器通知和提醒</p>
              </div>

              <div className="bg-[#2b2d31] rounded-xl p-6 space-y-5 border border-[#1e1f22]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-sm">日程提醒</p>
                    <p className="text-[#949ba4] text-xs mt-0.5">在日程开始前接收浏览器通知</p>
                  </div>
                  <button
                    onClick={async () => {
                      const permission = await Notification.requestPermission();
                      const enabled = permission === "granted";
                      setNotificationsEnabled(enabled);
                      try {
                        await updateSettings({ notifications_enabled: enabled });
                      } catch {}
                    }}
                    className={`
                      relative w-14 h-8 rounded-full transition-colors duration-300 flex items-center px-1
                      ${notificationsEnabled ? "bg-[#23a559]" : "bg-[#4f545c]"}
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

                <button
                  onClick={handleSaveNotifications}
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#5865f2] text-white rounded-lg font-bold text-sm hover:bg-[#4752c4] transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : null}
                  {saved ? "已保存" : "保存更改"}
                </button>
              </div>
            </div>
          )}

          {/* Export Tab */}
          {activeTab === "export" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">数据导出</h2>
                <p className="text-[#949ba4] text-sm">将你的笔记数据导出为多种格式</p>
              </div>
              <ExportPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
