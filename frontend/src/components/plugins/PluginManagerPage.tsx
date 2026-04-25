import { useEffect, useState } from "react";
import {
  Puzzle,
  RefreshCw,
  Settings,
  Trash2,
  Code2,
  FolderOpen,
  Copy,
  Check,
} from "lucide-react";
import pluginApi, { type Plugin, type PluginConfigSchema, type PluginDirectories } from "../../services/pluginApi";
import PluginDevConsole from "./PluginDevConsole";

/* ------------------------------------------------------------------ */
/*  Toggle Switch                                                      */
/* ------------------------------------------------------------------ */
function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5865f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2b2d31] ${
        checked ? "bg-[#5865f2]" : "bg-[#3f4147]"
      }`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Plugin Config Form                                                 */
/* ------------------------------------------------------------------ */
interface PluginConfigFormProps {
  plugin: Plugin;
  onSave: (config: Record<string, unknown>) => void;
  onCancel: () => void;
}

function PluginConfigForm({ plugin, onSave, onCancel }: PluginConfigFormProps) {
  const [config, setConfig] = useState<Record<string, unknown>>(plugin.config || {});

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
              onChange={(e) => handleChange(schema.name, parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#3f4147] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2]"
            />
            {schema.description && <p className="mt-1 text-xs text-[#949ba4]">{schema.description}</p>}
          </div>
        );
      default:
        if (schema.enum) {
          return (
            <div>
              <label className="block text-sm font-medium text-[#dbdee1] mb-1">{schema.title}</label>
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
              {schema.description && <p className="mt-1 text-xs text-[#949ba4]">{schema.description}</p>}
            </div>
          );
        }
        return (
          <div>
            <label className="block text-sm font-medium text-[#dbdee1] mb-1">{schema.title}</label>
            <input
              type="text"
              value={String(value || "")}
              onChange={(e) => handleChange(schema.name, e.target.value)}
              className="w-full px-3 py-2 bg-[#1e1f22] border border-[#3f4147] rounded-md text-white text-sm focus:outline-none focus:border-[#5865f2]"
            />
            {schema.description && <p className="mt-1 text-xs text-[#949ba4]">{schema.description}</p>}
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#313338] w-full max-w-md rounded-xl shadow-2xl border border-[#1e1f22] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-[#1e1f22] flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Settings size={20} className="text-[#5865f2]" /> Configure {plugin.name}
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
            <p className="text-[#949ba4] text-sm">This plugin has no configurable options.</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#1e1f22] flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">
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

/* ------------------------------------------------------------------ */
/*  Copy Button                                                        */
/* ------------------------------------------------------------------ */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[10px] text-[#949ba4] hover:text-white transition-colors"
      title="Copy path"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Plugin List Section                                                */
/* ------------------------------------------------------------------ */
interface PluginListSectionProps {
  title: string;
  plugins: Plugin[];
  onToggle: (plugin: Plugin) => void;
  onConfigure: (plugin: Plugin) => void;
  onDelete: (plugin: Plugin) => void;
}

function PluginListSection({ title, plugins, onToggle, onConfigure, onDelete }: PluginListSectionProps) {
  if (plugins.length === 0) return null;

  return (
    <section className="mb-6">
      <h3 className="text-[#949ba4] text-xs font-bold uppercase tracking-wider mb-3 px-1">
        {title}
      </h3>
      <div className="space-y-2">
        {plugins.map((plugin) => (
          <div
            key={plugin.id}
            className="flex items-center gap-4 p-3 bg-[#2b2d31] rounded-lg border border-[#1e1f22] hover:border-[#3f4147] transition-colors"
          >
            <ToggleSwitch checked={plugin.is_enabled} onChange={() => onToggle(plugin)} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm">{plugin.name}</span>
                <span className="text-xs text-[#949ba4]">v{plugin.version}</span>
                {plugin.is_builtin && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#35373c] text-[#949ba4] rounded">Built-in</span>
                )}
              </div>
              <p className="text-xs text-[#949ba4] truncate">
                {plugin.description || "No description"}
                {plugin.author && ` · by ${plugin.author}`}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-[#949ba4] font-mono truncate max-w-[300px]" title={plugin.source_path}>
                  {plugin.source_path}
                </span>
                <CopyButton text={plugin.source_path} />
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {plugin.config_schema && plugin.config_schema.length > 0 && (
                <button
                  onClick={() => onConfigure(plugin)}
                  className="p-2 text-[#949ba4] hover:text-white hover:bg-[#35373c] rounded transition-colors"
                  title="Configure"
                >
                  <Settings size={16} />
                </button>
              )}
              {!plugin.is_builtin && (
                <button
                  onClick={() => onDelete(plugin)}
                  className="p-2 text-[#949ba4] hover:text-red-400 hover:bg-[#35373c] rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */
export default function PluginManagerPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [directories, setDirectories] = useState<PluginDirectories | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configuringPlugin, setConfiguringPlugin] = useState<Plugin | null>(null);
  const [showDevConsole, setShowDevConsole] = useState(false);

  const fetchPlugins = async () => {
    try {
      setLoading(true);
      const [data, dirs] = await Promise.all([
        pluginApi.listPlugins(),
        pluginApi.listDirectories(),
      ]);
      setPlugins(data);
      setDirectories(dirs);
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
        prev.map((p) => (p.id === plugin.id ? { ...p, is_enabled: !p.is_enabled } : p))
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
        prev.map((p) => (p.id === configuringPlugin.id ? { ...p, config } : p))
      );
      setConfiguringPlugin(null);
    } catch (err) {
      console.error("Failed to update plugin config:", err);
    }
  };

  const handleDelete = async (plugin: Plugin) => {
    if (plugin.is_builtin) return;
    const msg =
      `Delete "${plugin.name}"?\n\n` +
      `This will permanently remove the plugin folder and all its files:\n` +
      `${plugin.source_path}\n\n` +
      `This action cannot be undone.`;
    if (!confirm(msg)) return;

    try {
      await pluginApi.unloadPlugin(plugin.id);
      setPlugins((prev) => prev.filter((p) => p.id !== plugin.id));
    } catch (err) {
      console.error("Failed to delete plugin:", err);
    }
  };

  const builtinPlugins = plugins.filter((p) => p.is_builtin);
  const communityPlugins = plugins.filter((p) => !p.is_builtin);

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
      {/* Header */}
      <header className="h-12 border-b border-[#1e1f22] px-4 flex items-center justify-between shadow-sm bg-[#313338] flex-shrink-0">
        <h2 className="font-bold text-white flex items-center gap-2 text-[15px]">
          <Puzzle size={20} className="text-[#f23f43]" /> Bots & Plugins
        </h2>
        <button
          onClick={fetchPlugins}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#949ba4] hover:text-white hover:bg-[#35373c] rounded transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {/* Plugin Directories Info */}
        {directories && (
          <section className="mb-6 bg-[#2b2d31] rounded-lg border border-[#1e1f22] p-4">
            <div className="flex items-center gap-2 mb-2">
              <FolderOpen size={16} className="text-[#5865f2]" />
              <h3 className="text-sm font-bold text-white">Plugin Directories</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] text-[#949ba4] uppercase tracking-wider">Built-in</p>
                  <p className="text-xs text-[#dbdee1] font-mono truncate" title={directories.builtin}>
                    {directories.builtin}
                  </p>
                </div>
                <CopyButton text={directories.builtin} />
              </div>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] text-[#949ba4] uppercase tracking-wider">Community</p>
                  <p className="text-xs text-[#dbdee1] font-mono truncate" title={directories.community}>
                    {directories.community}
                  </p>
                </div>
                <CopyButton text={directories.community} />
              </div>
            </div>
          </section>
        )}

        <PluginListSection
          title="Built-in Plugins"
          plugins={builtinPlugins}
          onToggle={handleToggle}
          onConfigure={setConfiguringPlugin}
          onDelete={handleDelete}
        />

        <PluginListSection
          title="Community Plugins"
          plugins={communityPlugins}
          onToggle={handleToggle}
          onConfigure={setConfiguringPlugin}
          onDelete={handleDelete}
        />

        {plugins.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#949ba4] text-sm">No plugins found.</p>
            <p className="text-[#949ba4] text-xs mt-1">
              Place plugin folders in the community directory or use the Developer Console.
            </p>
          </div>
        )}

        {/* Developer Console */}
        <section className="mt-8 bg-[#2b2d31] p-6 rounded-lg border border-[#1e1f22]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-[#35373c] rounded-lg flex items-center justify-center shrink-0">
              <Code2 size={20} className="text-[#5865f2]" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white text-sm mb-1">Developer Console</h3>
              <p className="text-xs text-[#949ba4] mb-4 leading-relaxed">
                Write, test, and deploy custom plugins using our lightweight API. Built-in plugin
                templates are available as references.
              </p>
              <button
                onClick={() => setShowDevConsole(true)}
                className="px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-bold rounded-md transition-colors"
              >
                Open Developer Console
              </button>
            </div>
          </div>
        </section>
      </main>

      {configuringPlugin && (
        <PluginConfigForm
          plugin={configuringPlugin}
          onSave={handleConfigure}
          onCancel={() => setConfiguringPlugin(null)}
        />
      )}

      {showDevConsole && (
        <PluginDevConsole onClose={() => setShowDevConsole(false)} onDeployed={fetchPlugins} />
      )}
    </div>
  );
}
