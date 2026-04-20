import api from "./api";

export interface PluginConfigSchema {
  name: string;
  type: string;
  title: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
}

export interface Plugin {
  id: number;
  name: string;
  version: string;
  description?: string;
  author?: string;
  entry_point: string;
  config_schema?: PluginConfigSchema[];
  config?: Record<string, unknown>;
  is_enabled: boolean;
  is_builtin: boolean;
  installed_at: string;
  updated_at: string;
}

export interface CreatePluginRequest {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  entry_point: string;
  config_schema?: PluginConfigSchema[];
  config?: Record<string, unknown>;
  is_builtin?: boolean;
}

export interface UpdatePluginRequest {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  config?: Record<string, unknown>;
  is_enabled?: boolean;
}

export interface PluginToggleRequest {
  is_enabled: boolean;
}

export interface PluginResponse {
  plugin_name: string;
  plugin_id: number;
  message: string;
  type: string;
}

export const pluginApi = {
  // List all installed plugins
  listPlugins: async (): Promise<Plugin[]> => {
    const response = await api.get("/plugins");
    return response.data.data || [];
  },

  // List builtin plugins
  listBuiltinPlugins: async (): Promise<Omit<Plugin, "id" | "installed_at" | "updated_at">[]> => {
    const response = await api.get("/plugins/builtin");
    return response.data.data || [];
  },

  // Install a plugin
  installPlugin: async (data: CreatePluginRequest): Promise<Plugin> => {
    const response = await api.post("/plugins", data);
    return response.data.data;
  },

  // Update plugin configuration
  updatePlugin: async (id: number, data: UpdatePluginRequest): Promise<Plugin> => {
    const response = await api.put(`/plugins/${id}`, data);
    return response.data.data;
  },

  // Toggle plugin enabled/disabled
  togglePlugin: async (id: number, isEnabled: boolean): Promise<void> => {
    await api.post(`/plugins/${id}/toggle`, { is_enabled: isEnabled });
  },

  // Uninstall a plugin
  uninstallPlugin: async (id: number): Promise<void> => {
    await api.delete(`/plugins/${id}`);
  },

  // Test a plugin with a message
  testPlugin: async (id: number, content: string): Promise<string | null> => {
    const response = await api.post(`/plugins/${id}/test`, { content });
    return response.data.data?.response || null;
  },
};

export default pluginApi;
