import { useState } from "react";
import ConsoleCore from "../common/ConsoleCore";
import { useConsoleSuggestions, useConsoleExecute } from "../../hooks/useConsoleLogic";

export default function ConsoleView() {
  const getSuggestions = useConsoleSuggestions();
  const executeFn = useConsoleExecute();
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
      executeFn={executeFn}
      getSuggestions={getSuggestions}
    />
  );
}
