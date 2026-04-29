import { useState, useCallback, useRef } from "react";

export type SuggestionType = "server" | "channel" | "skill" | "file" | "command";

export interface UseMentionAutocompleteOptions {
  value: string;
  onChange: (value: string) => void;
  getSuggestions?: (filter: string, type: SuggestionType, text: string) => Promise<string[]> | string[];
}

function detectSuggestion(text: string, cursorPos: number) {
  const beforeCursor = text.slice(0, cursorPos);
  const patterns: { regex: RegExp; type: SuggestionType }[] = [
    { regex: /@(\S*)$/, type: "server" },
    { regex: /#(\S*)$/, type: "channel" },
    { regex: /\$(\S*)$/, type: "skill" },
    { regex: /@file:(\S*)$/, type: "file" },
    { regex: /\/(\S*)$/, type: "command" },
  ];
  for (const { regex, type } of patterns) {
    const match = beforeCursor.match(regex);
    if (match) {
      return { type, filter: match[1] };
    }
  }
  return null;
}

export function useMentionAutocomplete({
  value,
  onChange,
  getSuggestions,
}: UseMentionAutocompleteOptions) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [show, setShow] = useState(false);
  const [type, setType] = useState<SuggestionType>("command");
  const [filter, setFilter] = useState("");
  const cursorPosRef = useRef<number>(value.length);

  const handleInputChange = useCallback(
    async (newValue: string, cursorPos: number) => {
      cursorPosRef.current = cursorPos;
      onChange(newValue);
      if (!getSuggestions) return;

      const detected = detectSuggestion(newValue, cursorPos);
      if (detected) {
        const items = await getSuggestions(detected.filter, detected.type, newValue);
        if (items.length > 0) {
          setSuggestions(items);
          setSelectedIndex(0);
          setShow(true);
          setType(detected.type);
          setFilter(detected.filter);
          return;
        }
      }
      setShow(false);
      setSuggestions([]);
      setSelectedIndex(-1);
    },
    [getSuggestions, onChange]
  );

  const applySuggestion = useCallback(
    (name: string) => {
      const cursorPos = cursorPosRef.current;
      const beforeCursor = value.slice(0, cursorPos);
      const patterns: Record<string, RegExp> = {
        server: /@(\S*)$/,
        channel: /#(\S*)$/,
        skill: /\$(\S*)$/,
        file: /@file:(\S*)$/,
        command: /\/(\S*)$/,
      };
      const regex = patterns[type];
      if (!regex) return;

      const newBefore = beforeCursor.replace(
        regex,
        type === "command"
          ? `/${name} `
          : `${
              type === "file"
                ? "@file:"
                : type === "skill"
                ? "$"
                : type === "channel"
                ? "#"
                : "@"
            }${name} `
      );
      const afterCursor = value.slice(cursorPos);
      const newValue = newBefore + afterCursor;
      onChange(newValue);
      setShow(false);
      setSuggestions([]);
      setSelectedIndex(-1);
    },
    [value, type, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (show) {
        if (e.key === "Tab") {
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            applySuggestion(suggestions[selectedIndex]);
          }
          return true;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + suggestions.length) % suggestions.length
          );
          return true;
        }
        if (e.key === "Escape") {
          setShow(false);
          return true;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (show && selectedIndex >= 0) {
          applySuggestion(suggestions[selectedIndex]);
          return true;
        }
        // Not consumed — caller should handle submit
        return false;
      }

      return false;
    },
    [show, selectedIndex, suggestions, applySuggestion]
  );

  return {
    suggestions,
    selectedIndex,
    show,
    type,
    filter,
    handleInputChange,
    handleKeyDown,
    applySuggestion,
    setShow,
  };
}
