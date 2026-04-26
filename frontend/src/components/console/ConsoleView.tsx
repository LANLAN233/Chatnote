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
    switch (type) {
      case "server":
        return servers.filter((s) => s.name.toLowerCase().includes(f)).map((s) => s.name);
      case "channel":
        return channels.filter((c) => c.name.toLowerCase().includes(f)).map((c) => c.name);
      case "skill":
        return SKILL_LIST.filter((s) => s.includes(f));
      case "command":
        return COMMAND_LIST.filter((c) => c.includes(f));
      case "file":
        return [];
      default:
        return [];
    }
  }, [servers, channels]);
}

export default function ConsoleView() {
  const getSuggestions = useConsoleSuggestions();
  const [aiEnabled, setAiEnabled] = useState(true);

  return (
    <ConsoleCore
      scope={{ type: "global" }}
      showRefresh
      aiEnabled={aiEnabled}
      onToggleAI={() => setAiEnabled((v) => !v)}
      headerTitle="CHATNOTE_TERMINAL_V1.0"
      footerLabel="Smart Capture"
      initMessages={[
        "ChatNote Context initialized.",
        "AI Sub-engine connected.",
        "Capturing local knowledge for #general.",
      ]}
      executeFn={async (text, aiEnabled) => {
        const { data: response } = await consoleApi.execute(text, aiEnabled);
        return response.data as { type: string; content?: string; data?: unknown; note?: unknown; plugin_responses?: Array<{ plugin_name: string; message: string }> };
      }}
      getSuggestions={getSuggestions}
    />
  );
}
