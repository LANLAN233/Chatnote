import { useEffect, useState } from "react";
import { Puzzle, Calculator, FileText, Zap, Construction } from "lucide-react";
import pluginApi, { type Plugin, type PluginConfigSchema } from "../../services/pluginApi";

interface PluginConfigFormProps {
  plugin: Plugin;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

function PluginConfigForm({ plugin, onSave, onCancel }: PluginConfigFormProps) {
  const [config, setConfig] = useState<Record<string, unknown>>(
    plugin.config || {}
  );

  const handleChange = (name: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const renderField = (schema: PluginConfigSchema) => {
    const value = config[schema.name] ?? schema.default;

    switch (schema.type) {
      case "boolean":
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handleChange(schema.name, e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 text-[#5865f2] focus:ring-[#5865f2]"
            />
            <span className="text-sm text-[#dbdee1]">{schema.title}</span>
          </label>
        );

      case "number":
      case "integer":
        return (
          <div>
            <label className="block text-sm font-medium text-[#dbdee1] mb-1">
              {schema.title}
            </label>
            <input
              type="number"
              value={typeof value === "number" ? value : ""}
              min={schema.minimum}
              max={schema.maximum}
              onChange={(e) =>
                handleChange(schema.name, parseFloat(e.target.value))
              }
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#3f4147] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2]"
            />
            {schema.description && (
              <p className="mt-1 text-xs text-[#949ba4]">{schema.description}</p>
            )}
          </div>
        );

      case "string":
      default:
        if (schema.enum) {
          return (
            <div>
              <label className="block text-sm font-medium text-[#dbdee1] mb-1">
                {schema.title}
              </label>
              <select
                value={String(value || "")}
                onChange={(e) => handleChange(schema.name, e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1f22] border border-[#3f4147] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2]"
              >
                {schema.enum.map((opt) => (
                  <option key={String(opt)} value={String(opt)}>
                    {String(opt)}
                  </option>
                ))}
              </select>
              {schema.description && (
                <p className="mt-1 text-xs text-[#949ba4]">
                  {schema.description}
                </p>
              )}
            </div>
          );
        }

        return (
          <div>
            <label className="block text-sm font-medium text-[#dbdee1] mb-1">
              {schema.title}
            </label>
            <input
              type="text"
              value={String(value || "")}
              onChange={(e) => handleChange(schema.name, e.target.value)}
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#3f4147] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2]"
            />
            {schema.description && (
              <p className="mt-1 text-xs text-[#949ba4]">{schema.description}</p>
            )}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#313338] w-full max-w-md rounded-xl shadow-2xl border border-[#1e1f22] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-[#1e1f22] flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Puzzle size={20} className="text-[#5865f2]" /> Configure {plugin.name}
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {plugin.config_schema?.map((schema) => (
            <div key={schema.name}>{renderField(schema)}</div>
          ))}
          {!plugin.config_schema?.length && (
            <p className="text-[#949ba4] text-sm">
              This plugin has no configurable options.
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#1e1f22] flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(config)}
            className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm rounded-md transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface InstallPluginModalProps {
  builtinPlugins: Omit<Plugin, "id" | "installed_at" | "updated_at">[];
  onInstall: (plugin: Omit<Plugin, "id" | "installed_at" | "updated_at">) => void;
  onClose: () => void;
}

function InstallPluginModal({
  builtinPlugins,
  onInstall,
  onClose,
}: InstallPluginModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#313338] rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col border border-[#1e1f22] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1e1f22]">
          <h3 className="text-lg font-semibold text-white">Install Plugin</h3>
          <p className="text-sm text-[#949ba4] mt-1">
            Choose a builtin plugin to install
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-4">
            {builtinPlugins.map((plugin) => (
              <div
                key={plugin.entry_point}
                className="flex items-start gap-4 p-4 bg-[#2b2d31] rounded-lg hover:bg-[#35373c] transition-colors border border-[#1e1f22]"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-white">{plugin.name}</h4>
                    <span className="text-xs text-[#949ba4]">
                      v{plugin.version}
                    </span>
                  </div>
                  <p className="text-sm text-[#949ba4] mt-1">
                    {plugin.description}
                  </p>
                  {plugin.author && (
                    <p className="text-xs text-[#949ba4] mt-2">
                      by {plugin.author}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onInstall(plugin)}
                  className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm rounded-md transition-colors"
                >
                  Install
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#1e1f22] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PluginManagerPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [builtinPlugins, setBuiltinPlugins] = useState<
    Omit<Plugin, "id" | "installed_at" | "updated_at">[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configuringPlugin, setConfiguringPlugin] = useState<Plugin | null>(
    null
  );
  const [showInstallModal, setShowInstallModal] = useState(false);

  const fetchPlugins = async () => {
    try {
      setLoading(true);
      const [installed, builtin] = await Promise.all([
        pluginApi.listPlugins(),
        pluginApi.listBuiltinPlugins(),
      ]);
      setPlugins(installed);
      setBuiltinPlugins(builtin);
    } catch (err) {
      setError("Failed to load plugins");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  const handleToggle = async (plugin: Plugin) => {
    try {
      await pluginApi.togglePlugin(plugin.id, !plugin.is_enabled);
      setPlugins((prev) =>
        prev.map((p) =>
          p.id === plugin.id ? { ...p, is_enabled: !p.is_enabled } : p
        )
      );
    } catch (err) {
      console.error("Failed to toggle plugin:", err);
    }
  };

  const handleConfigure = async (config: Record<string, unknown>) => {
    if (!configuringPlugin) return;

    try {
      await pluginApi.updatePlugin(configuringPlugin.id, { config });
      setPlugins((prev) =>
        prev.map((p) =>
          p.id === configuringPlugin.id ? { ...p, config } : p
        )
      );
      setConfiguringPlugin(null);
    } catch (err) {
      console.error("Failed to update plugin config:", err);
    }
  };

  const handleInstall = async (
    plugin: Omit<Plugin, "id" | "installed_at" | "updated_at">
  ) => {
    try {
      await pluginApi.installPlugin({
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        author: plugin.author,
        entry_point: plugin.entry_point,
        config_schema: plugin.config_schema,
        is_builtin: true,
      });
      await fetchPlugins();
      setShowInstallModal(false);
    } catch (err) {
      console.error("Failed to install plugin:", err);
    }
  };

  const handleUninstall = async (plugin: Plugin) => {
    if (plugin.is_builtin) {
      alert("Cannot uninstall builtin plugins");
      return;
    }

    if (!confirm(`Uninstall ${plugin.name}?`)) return;

    try {
      await pluginApi.uninstallPlugin(plugin.id);
      setPlugins((prev) => prev.filter((p) => p.id !== plugin.id));
    } catch (err) {
      console.error("Failed to uninstall plugin:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 bg-[#313338] flex items-center justify-center">
        <div className="text-[#949ba4]">Loading plugins...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 bg-[#313338] flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#313338] flex flex-col h-full overflow-hidden">
      <header className="h-12 border-b border-[#1e1f22] px-4 flex items-center shadow-sm bg-[#313338] flex-shrink-0">
        <h2 className="font-bold text-white flex items-center gap-2 text-[15px]">
          <Puzzle size={20} className="text-[#f23f43]" /> Bots & Plugins
        </h2>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#949ba4] text-xs font-bold uppercase tracking-wider">Installed Plugins</h3>
            <button
              onClick={() => setShowInstallModal(true)}
              className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-bold rounded-md transition-colors"
            >
              Install Plugin
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plugins.map((plugin) => (
              <div key={plugin.id} className="bg-[#2b2d31] p-4 rounded-lg border border-[#1e1f22] flex flex-col gap-3 transition-transform hover:translate-y-[-2px] hover:shadow-lg">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-white">{plugin.name}</h4>
                    <p className="text-xs text-[#949ba4]">{plugin.description || "No description"}</p>
                  </div>
                  <div className="w-10 h-10 bg-[#35373c] rounded-lg flex items-center justify-center text-xl shadow-inner">
                    {plugin.entry_point.includes("math") ? <Calculator size={20} className="text-[#5865f2]" /> :
                     plugin.entry_point.includes("summary") ? <FileText size={20} className="text-[#23a559]" /> :
                     <Zap size={20} className="text-[#f23f43]" />}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1e1f22]">
                  <span className={`text-[10px] font-bold uppercase ${plugin.is_enabled ? "text-[#23a559]" : "text-gray-500"}`}>
                    {plugin.is_enabled ? "Active" : "Disabled"}
                  </span>
                  <div className="flex items-center gap-2">
                    {plugin.config_schema && plugin.config_schema.length > 0 && (
                      <button
                        onClick={() => setConfiguringPlugin(plugin)}
                        className="px-3 py-1 text-[11px] text-[#949ba4] hover:text-white hover:bg-[#35373c] rounded transition-colors"
                      >
                        Configure
                      </button>
                    )}
                    <button
                      onClick={() => handleToggle(plugin)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all
                        ${plugin.is_enabled
                          ? "bg-red-500 hover:bg-red-600 text-white shadow-[0_4px_0_rgba(153,27,27,1)] active:translate-y-[2px] active:shadow-none"
                          : "bg-[#5865f2] hover:bg-[#4752c4] text-white shadow-[0_4px_0_rgba(67,56,202,1)] active:translate-y-[2px] active:shadow-none"}`}
                    >
                      {plugin.is_enabled ? "Disable" : "Enable"}
                    </button>
                    {!plugin.is_builtin && (
                      <button
                        onClick={() => handleUninstall(plugin)}
                        className="p-1 text-[#949ba4] hover:text-red-400 transition-colors"
                        title="Uninstall"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#1e1f22] p-8 rounded-lg border-2 border-dashed border-[#2b2d31] flex flex-col items-center justify-center text-center transition-colors hover:border-[#3f4147]">
          <div className="w-16 h-16 bg-[#2b2d31] rounded-full flex items-center justify-center mb-4 shadow-xl">
            <Construction size={32} className="text-orange-500" />
          </div>
          <h3 className="font-bold text-white text-lg mb-2">Create Your Own Bot</h3>
          <p className="text-sm text-[#949ba4] max-w-sm mb-6 leading-relaxed">
            Write custom plugins using our lightweight API to automate your study workflow or integrate external tools.
          </p>
          <button className="bg-white text-black font-bold px-8 py-2.5 rounded hover:bg-gray-200 transition-all active:scale-95 shadow-lg">
            Developer Console
          </button>
        </section>
      </main>

      {configuringPlugin && (
        <PluginConfigForm
          plugin={configuringPlugin}
          onSave={handleConfigure}
          onCancel={() => setConfiguringPlugin(null)}
        />
      )}

      {showInstallModal && (
        <InstallPluginModal
          builtinPlugins={builtinPlugins}
          onInstall={handleInstall}
          onClose={() => setShowInstallModal(false)}
        />
      )}
    </div>
  );
}
