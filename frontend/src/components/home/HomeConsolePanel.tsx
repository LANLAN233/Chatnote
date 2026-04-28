import { useState, useCallback } from "react";
import { consoleApi } from "../../services";
import { useServerStore, useChannelStore } from "../../stores";
import ConsoleCore from "../common/ConsoleCore";

const SKILL_LIST = ["summarize", "translate", "explain", "ask", "todo", "schedule", "math"];
const COMMAND_LIST = ["help", "clear", "search", "todo", "today", "stats", "plugins", "calc"];

function useConsoleSuggestions() {
  const servers = useServerStore((s) => s.servers);
  const channels = useChannelStore((s) => s.channels);

  return useCallback((filter: string, type: string): string[] => {
    const f = filter.toLowerCase();
    let items: string[] = [];
    switch (type) {
      case "server":
        items = servers.filter((s) => s.name.toLowerCase().includes(f)).map((s) => s.name);
        break;
      case "channel":
        items = channels.filter((c) => c.name.toLowerCase().includes(f)).map((c) => c.name);
        break;
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
    // Sort: startsWith matches first, then includes matches
    return items.sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(f);
      const bStarts = b.toLowerCase().startsWith(f);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.localeCompare(b);
    });
  }, [servers, channels]);
}

export default function HomeConsolePanel() {
  const getSuggestions = useConsoleSuggestions();
  const [aiEnabled, setAiEnabled] = useState(true);

  return (
    <ConsoleCore
      scope={{ type: "global" }}
      compact
      aiEnabled={aiEnabled}
      onToggleAI={() => setAiEnabled((v) => !v)}
      headerTitle="CHATNOTE_TERMINAL_V1.0"
      footerLabel="Smart Capture"
      initMessages={[
        "ChatNote Context initialized.",
        "AI Sub-engine connected.",
        "Capturing local knowledge for #general.",
      ]}
      executeFn={async (text, aiEnabled, sessionId) => {
        const { data: response } = await consoleApi.execute(text, aiEnabled, sessionId);
        return response.data as { type: string; content?: string; data?: unknown; note?: unknown; plugin_responses?: Array<{ plugin_name: string; message: string }> };
      }}
      getSuggestions={getSuggestions}
    />
  );
}
