import { useEffect, useState } from "react";
import pluginApi, { Plugin, PluginConfigSchema } from "../../services/pluginApi";

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
              className="w-4 h-4 rounded border-gray-600 text-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-300">{schema.title}</span>
          </label>
        );

      case "number":
      case "integer":
        return (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
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
              className="w-full px-3 py-2 bg-[#383a40] border border-[#1e1f22] rounded-md text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            {schema.description && (
              <p className="mt-1 text-xs text-gray-500">{schema.description}</p>
            )}
          </div>
        );

      case "string":
      default:
        if (schema.enum) {
          return (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {schema.title}
              </label>
              <select
                value={String(value || "")}
                onChange={(e) => handleChange(schema.name, e.target.value)}
                className="w-full px-3 py-2 bg-[#383a40] border border-[#1e1f22] rounded-md text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {schema.enum.map((opt) => (
                  <option key={String(opt)} value={String(opt)}>
                    {String(opt)}
                  </option>
                ))}
              </select>
              {schema.description && (
                <p className="mt-1 text-xs text-gray-500">
                  {schema.description}
                </p>
              )}
            </div>
          );
        }

        return (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {schema.title}
            </label>
            <input
              type="text"
              value={String(value || "")}
              onChange={(e) => handleChange(schema.name, e.target.value)}
              className="w-full px-3 py-2 bg-[#383a40] border border-[#1e1f22] rounded-md text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            {schema.description && (
              <p className="mt-1 text-xs text-gray-500">{schema.description}</p>
            )}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#313338] rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-[#1e1f22]">
          <h3 className="text-lg font-semibold text-white">
            Configure {plugin.name}
          </h3>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {plugin.config_schema?.map((schema) => (
            <div key={schema.name}>{renderField(schema)}</div>
          ))}
          {!plugin.config_schema?.length && (
            <p className="text-gray-400 text-sm">
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
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm rounded-md transition-colors"
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#313338] rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#1e1f22]">
          <h3 className="text-lg font-semibold text-white">Install Plugin</h3>
          <p className="text-sm text-gray-400 mt-1">
            Choose a builtin plugin to install
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-4">
            {builtinPlugins.map((plugin) => (
              <div
                key={plugin.entry_point}
                className="flex items-start gap-4 p-4 bg-[#383a40] rounded-lg hover:bg-[#404249] transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-white">{plugin.name}</h4>
                    <span className="text-xs text-gray-500">
                      v{plugin.version}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {plugin.description}
                  </p>
                  {plugin.author && (
                    <p className="text-xs text-gray-500 mt-2">
                      by {plugin.author}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onInstall(plugin)}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm rounded-md transition-colors"
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
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading plugins...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Plugin Manager</h1>
            <p className="text-gray-400 mt-1">
              Manage and configure your plugins
            </p>
          </div>
          <button
            onClick={() => setShowInstallModal(true)}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md transition-colors"
          >
            Install Plugin
          </button>
        </div>

        <div className="space-y-4">
          {plugins.length === 0 ? (
            <div className="text-center py-12 bg-[#313338] rounded-lg">
              <p className="text-gray-400">No plugins installed</p>
              <button
                onClick={() => setShowInstallModal(true)}
                className="mt-4 text-indigo-400 hover:text-indigo-300"
              >
                Install your first plugin
              </button>
            </div>
          ) : (
            plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="bg-[#313338] rounded-lg p-6 border border-[#1e1f22]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">
                        {plugin.name}
                      </h3>
                      <span className="text-xs text-gray-500">
                        v{plugin.version}
                      </span>
                      {plugin.is_builtin && (
                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs rounded-full">
                          Builtin
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          plugin.is_enabled
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {plugin.is_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm mt-2">
                      {plugin.description || "No description"}
                    </p>
                    {plugin.author && (
                      <p className="text-xs text-gray-500 mt-2">
                        by {plugin.author}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {plugin.config_schema &&
                      plugin.config_schema.length > 0 && (
                        <button
                          onClick={() => setConfiguringPlugin(plugin)}
                          className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-[#383a40] rounded transition-colors"
                        >
                          Configure
                        </button>
                      )}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={plugin.is_enabled}
                        onChange={() => handleToggle(plugin)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                    {!plugin.is_builtin && (
                      <button
                        onClick={() => handleUninstall(plugin)}
                        className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                        title="Uninstall"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-8 p-4 bg-[#383a40] rounded-lg">
          <h3 className="font-medium text-white mb-2">About Plugins</h3>
          <p className="text-sm text-gray-400">
            Plugins extend the functionality of ChatNote. Builtin plugins are
            pre-installed and cannot be removed. You can configure each plugin
            by clicking the Configure button and toggle them on/off using the
            switch.
          </p>
          <div className="mt-4 space-y-2">
            <p className="text-sm text-gray-300">
              <strong className="text-indigo-400">Math Solver</strong> -
              Automatically detects and calculates math expressions
            </p>
            <p className="text-sm text-gray-300">
              <strong className="text-indigo-400">Summary Bot</strong> -
              Generates summaries for long notes
            </p>
            <p className="text-sm text-gray-300">
              <strong className="text-indigo-400">Class Watcher</strong> -
              Tracks class attendance and sends reminders
            </p>
          </div>
        </div>
      </div>

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
