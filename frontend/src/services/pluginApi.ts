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

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  min_app_version?: string;
}

export interface Plugin {
  id: number;
  plugin_id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  config_schema?: PluginConfigSchema[];
  config?: Record<string, unknown>;
  is_enabled: boolean;
  is_builtin: boolean;
  source_path: string;
  installed_at: string;
  updated_at: string;
}

export interface PluginDirectories {
  builtin: string;
  community: string;
  all: string[];
}

export interface UpdatePluginRequest {
  config?: Record<string, unknown>;
  is_enabled?: boolean;
}

export interface PluginToggleRequest {
  is_enabled: boolean;
}

export interface PluginDeployRequest {
  id: string;
  manifest: PluginManifest;
  code: string;
}

export interface PluginDeployResponse {
  id: number;
  plugin_id: string;
  is_enabled: boolean;
  source_path: string;
}

export const pluginApi = {
  // List all plugins (triggers scan)
  listPlugins: async (): Promise<Plugin[]> => {
    const response = await api.get("/plugins");
    return response.data.data || [];
  },

  // Get plugin directories
  listDirectories: async (): Promise<PluginDirectories> => {
    const response = await api.get("/plugins/directories");
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

  // Unload a plugin (delete from DB/runtime, not filesystem)
  unloadPlugin: async (id: number): Promise<void> => {
    await api.delete(`/plugins/${id}`);
  },

  // Test a plugin with a message
  testPlugin: async (id: number, content: string): Promise<string | null> => {
    const response = await api.post(`/plugins/${id}/test`, { content });
    return response.data.data?.response || null;
  },

  // Deploy a plugin from developer console
  deployPlugin: async (data: PluginDeployRequest): Promise<PluginDeployResponse> => {
    const response = await api.post("/plugins/deploy", data);
    return response.data.data;
  },
};

export default pluginApi;
