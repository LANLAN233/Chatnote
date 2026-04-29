import { useRef } from "react";
import { SendHorizontal, Loader2 } from "lucide-react";
import { useMentionAutocomplete, type SuggestionType } from "../../hooks/useMentionAutocomplete";
import MentionAutocompleteDropdown from "./MentionAutocompleteDropdown";

interface SmartInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  getSuggestions?: (filter: string, type: SuggestionType, text: string) => Promise<string[]> | string[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  rows?: number;
  className?: string;
}

export default function SmartInput({
  value,
  onChange,
  onSubmit,
  getSuggestions,
  placeholder = "Type something...",
  disabled = false,
  loading = false,
  rows = 4,
  className = "",
}: SmartInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const {
    suggestions,
    selectedIndex,
    show,
    type,
    filter,
    handleInputChange,
    handleKeyDown,
    applySuggestion,
  } = useMentionAutocomplete({ value, onChange, getSuggestions });

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const consumed = handleKeyDown(e);
    if (!consumed && e.key === "Enter" && !e.shiftKey) {
      onSubmit();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className="w-full bg-[#1e1f22] text-[#dbdee1] p-4 rounded-xl border border-[#3f4147] outline-none focus:border-[#5865f2] transition-all resize-none placeholder-[#949ba4]"
      />
      <div className="absolute bottom-3 right-3 flex items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={!value.trim() || disabled || loading}
          className={`p-2.5 rounded-xl transition-all ${
            value.trim() && !disabled && !loading
              ? "bg-[#5865f2] text-white hover:scale-105"
              : "bg-[#4f545c] text-gray-500 cursor-not-allowed"
          }`}
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <SendHorizontal size={20} />}
        </button>
      </div>

      {show && (
        <MentionAutocompleteDropdown
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          type={type}
          filter={filter}
          onSelect={applySuggestion}
        />
      )}
    </div>
  );
}
