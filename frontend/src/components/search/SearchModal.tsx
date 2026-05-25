import { useState } from "react";
import { Search, X, Hash } from "lucide-react";
import { noteApi } from "../../services";
import type { NoteSearchResult, Note } from "../../types";

interface SearchModalProps {
  onClose: () => void;
  onNoteClick?: (note: Note) => void;
}

const MODE_LABELS: Record<string, string> = {
  hybrid: "混合",
  vector: "语义",
  fulltext: "关键词",
};

function getSourceColor(source: string): string {
  switch (source) {
    case "vector":
      return "#3b82f6";
    case "fulltext":
      return "#8b5cf6";
    case "hybrid":
      return "#10b981";
    default:
      return "#949ba4";
  }
}

function getSourceLabel(source: string): string {
  switch (source) {
    case "vector":
      return "语义匹配";
    case "fulltext":
      return "关键词匹配";
    case "hybrid":
      return "混合匹配";
    default:
      return source;
  }
}

function mapResultToNote(result: NoteSearchResult): Note {
  return {
    id: result.note_id,
    channel_id: result.channel_id ?? 0,
    user_id: result.user_id ?? 0,
    content: result.content,
    content_type: "text",
    raw_input: null,
    ai_category: null,
    ai_summary: result.ai_summary ?? null,
    ai_confidence: null,
    ai_tags: result.ai_tags ?? null,
    is_pinned: false,
    reply_to_id: null,
    user_tags: null,
    is_edited: false,
    created_at: result.created_at ?? new Date().toISOString(),
    updated_at: result.created_at ?? new Date().toISOString(),
  } as Note;
}

export default function SearchModal({ onClose, onNoteClick }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchMode, setSearchMode] = useState<"hybrid" | "vector" | "fulltext">("hybrid");

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.length < 1) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const { data } = await noteApi.search(q, searchMode);
      setResults((data.data as NoteSearchResult[]) || []);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#313338] w-full max-w-lg rounded-xl shadow-2xl border border-[#1e1f22] overflow-hidden animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1f22]">
          <Search className="w-5 h-5 text-[#949ba4] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search all notes..."
            className="flex-1 bg-transparent text-white text-[15px] placeholder:text-[#949ba4] outline-none"
            autoFocus
          />
          {query && (
            <button onClick={() => handleSearch("")} className="text-[#949ba4] hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="px-2 py-0.5 bg-[#1e1f22] text-[#949ba4] text-xs rounded border border-[#3f4147]">ESC</kbd>
        </div>

        {/* Search mode selector */}
        <div className="flex gap-0 px-4 border-b border-[#1e1f22]">
          {(["hybrid", "vector", "fulltext"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setSearchMode(mode);
                if (query.length >= 1) {
                  handleSearch(query);
                }
              }}
              className={`relative px-3 py-2 text-[13px] font-medium transition-colors ${
                searchMode === mode ? "text-white" : "text-[#949ba4] hover:text-[#dbdee1]"
              }`}
            >
              {MODE_LABELS[mode]}
              {searchMode === mode && (
                <span
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{ backgroundColor: getSourceColor(mode) }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {isSearching && (
            <div className="flex gap-4 px-4 py-4 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-[#3f4147] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[#3f4147] rounded w-1/3" />
                <div className="h-4 bg-[#3f4147] rounded w-2/3" />
              </div>
            </div>
          )}
          {!isSearching && hasSearched && results.length === 0 && (
            <div className="px-4 py-8 text-center text-[#949ba4] text-sm">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {!isSearching &&
            results.map((result) => (
              <div
                key={result.note_id}
                className="px-4 py-3 hover:bg-[#35373c] cursor-pointer border-b border-[#1e1f22] last:border-0 transition-colors"
                onClick={() => onNoteClick?.(mapResultToNote(result))}
              >
                {/* Result header with similarity and source */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1 bg-[#1e1f22] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round(result.score * 100)}%`,
                            backgroundColor: getSourceColor(result.source),
                          }}
                        />
                      </div>
                      <span
                        className="text-[11px] font-bold whitespace-nowrap"
                        style={{ color: getSourceColor(result.source) }}
                      >
                        {Math.round(result.score * 100)}% 匹配
                      </span>
                    </div>
                  </div>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded border"
                    style={{
                      color: getSourceColor(result.source),
                      borderColor: `${getSourceColor(result.source)}40`,
                      backgroundColor: `${getSourceColor(result.source)}15`,
                    }}
                  >
                    {getSourceLabel(result.source)}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <Hash className="w-3.5 h-3.5 text-[#80848e]" />
                  <span className="text-[12px] text-[#949ba4]">Channel #{result.channel_id ?? "-"}</span>
                  {result.created_at && (
                    <span className="text-[12px] text-[#949ba4] ml-auto">
                      {new Date(result.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-[14px] text-[#dbdee1] line-clamp-2 pl-5 leading-relaxed">
                  {result.content}
                </p>
              </div>
            ))}
          {!hasSearched && !isSearching && (
            <div className="px-4 py-8 text-center text-[#949ba4] text-sm">
              Type to search across all your notes
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-[#1e1f22] text-[11px] text-[#949ba4]">
          Press Esc to close
        </div>
      </div>
    </div>
  );
}
