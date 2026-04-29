import type { SuggestionType } from "../../hooks/useMentionAutocomplete";

interface MentionAutocompleteDropdownProps {
  suggestions: string[];
  selectedIndex: number;
  type: SuggestionType;
  filter: string;
  onSelect: (name: string) => void;
}

export default function MentionAutocompleteDropdown({
  suggestions,
  selectedIndex,
  type,
  filter,
  onSelect,
}: MentionAutocompleteDropdownProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 bottom-full mb-1 bg-[#2b2d31] border border-[#3f4147] rounded-lg shadow-xl max-h-48 overflow-y-auto z-50">
      {suggestions.map((s, i) => {
        const lowerS = s.toLowerCase();
        const lowerF = filter.toLowerCase();
        const idx = lowerS.indexOf(lowerF);
        const prefix = idx >= 0 ? s.slice(0, idx) : s;
        const match = idx >= 0 ? s.slice(idx, idx + filter.length) : "";
        const suffix = idx >= 0 ? s.slice(idx + filter.length) : "";
        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
              i === selectedIndex
                ? "bg-[#5865f2]/20 text-white"
                : "text-[#949ba4] hover:bg-[#3f4147]"
            }`}
          >
            {type === "skill" && <span className="text-[#5865f2] mr-1">$</span>}
            {type === "command" && <span className="text-[#5865f2] mr-1">/</span>}
            {type === "file" && <span className="text-[#5865f2] mr-1">@file:</span>}
            {type === "server" && <span className="text-[#f0c040] mr-1">@</span>}
            {type === "channel" && <span className="text-[#5865f2] mr-1">#</span>}
            {prefix}
            {match && <span className="text-[#5865f2] font-bold">{match}</span>}
            {suffix}
          </button>
        );
      })}
    </div>
  );
}
