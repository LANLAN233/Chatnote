import { useState, useCallback, useEffect } from "react";
import { consoleApi, channelApi } from "../services";
import { useServerStore } from "../stores";
import type { Channel } from "../types";

export const SKILL_LIST = ["summarize", "translate", "explain", "ask", "todo", "schedule", "math"];
export const COMMAND_LIST = ["help", "clear", "search", "todo", "today", "stats", "plugins", "calc"];

export function useConsoleSuggestions() {
  const servers = useServerStore((s) => s.servers);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);

  useEffect(() => {
    if (servers.length === 0) return;
    Promise.all(
      servers.map((s) =>
        channelApi.list(s.id).then(({ data }) => (data.success && data.data ? (data.data as Channel[]) : []))
      )
    ).then((results) => {
      setAllChannels(results.flat());
    }).catch(() => {});
  }, [servers]);

  return useCallback((filter: string, type: string, text: string): string[] => {
    const f = filter.toLowerCase();
    let items: string[] = [];
    switch (type) {
      case "server":
        items = servers.filter((s) => s.name.toLowerCase().includes(f)).map((s) => s.name);
        break;
      case "channel": {
        const serverMatch = text.match(/@([^\s#]+)(?=\s+#|$)/);
        const targetServerName = serverMatch ? serverMatch[1] : null;
        const targetServer = targetServerName
          ? servers.find((s) => s.name.toLowerCase() === targetServerName.toLowerCase())
          : null;
        let channels: Channel[];
        if (targetServer) {
          channels = allChannels.filter((c) => c.server_id === targetServer.id);
        } else {
          channels = allChannels;
        }
        items = channels.filter((c) => c.name.toLowerCase().includes(f)).map((c) => c.name);
        break;
      }
      case "skill":
        items = SKILL_LIST.filter((s) => s.includes(f));
        break;
      case "command":
        items = COMMAND_LIST.filter((c) => c.includes(f));
        break;
      case "file":
        items = [];
        break;
      default:
        items = [];
    }
    return items;
  }, [servers, allChannels]);
}

export function useConsoleExecute() {
  return async (text: string, aiEnabled: boolean, sessionId?: number) => {
    const { data: response } = await consoleApi.execute(text, aiEnabled, sessionId);
    return response.data as { type: string; content?: string; data?: unknown; note?: unknown; plugin_responses?: Array<{ plugin_name: string; message: string }> };
  };
}
