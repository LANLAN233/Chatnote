import { useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { serverConsoleApi } from "../../services";
import { useServerStore, useChannelStore } from "../../stores";
import ConsoleCore from "../common/ConsoleCore";

const SKILL_LIST = ["summarize", "translate", "explain", "ask", "todo", "schedule", "math"];
const COMMAND_LIST = ["help", "clear", "search", "todo", "today", "stats", "plugins", "calc"];

function useConsoleSuggestions(serverId?: number) {
  const servers = useServerStore((s) => s.servers);
  const channels = useChannelStore((s) => s.channels);

  return useCallback((filter: string, type: string): string[] => {
    const f = filter.toLowerCase();
    switch (type) {
      case "server":
        return servers.filter((s) => s.name.toLowerCase().includes(f)).map((s) => s.name);
      case "channel": {
        const scoped = serverId
          ? channels.filter((c) => c.server_id === serverId)
          : channels;
        return scoped.filter((c) => c.name.toLowerCase().includes(f)).map((c) => c.name);
      }
      case "skill":
        return SKILL_LIST.filter((s) => s.includes(f));
      case "command":
        return COMMAND_LIST.filter((c) => c.includes(f));
      case "file":
        return [];
      default:
        return [];
    }
  }, [servers, channels, serverId]);
}

export default function ServerConsoleView() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const sid = serverId ? parseInt(serverId, 10) : 0;
  const getSuggestions = useConsoleSuggestions(sid);
  const [aiEnabled, setAiEnabled] = useState(false);

  return (
    <ConsoleCore
      scope={{ type: "server", serverId: sid, serverName: `#${sid}` }}
      onBack={() => navigate(`/server/${serverId}`)}
      aiEnabled={aiEnabled}
      onToggleAI={() => setAiEnabled((v) => !v)}
      headerTitle={`SERVER_CONSOLE #${serverId}`}
      footerLabel="Smart Capture (Server Scoped)"
      initMessages={[
        "Server Context initialized.",
        "AI Sub-engine connected.",
        "Scoped to current server.",
      ]}
      executeFn={async (text, aiEnabled) => {
        const { data: response } = await serverConsoleApi.execute(sid, text, aiEnabled);
        return response.data as { type: string; content?: string; data?: unknown; note?: unknown; plugin_responses?: Array<{ plugin_name: string; message: string }> };
      }}
      getSuggestions={getSuggestions}
    />
  );
}
