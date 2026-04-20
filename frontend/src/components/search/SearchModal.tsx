import { useState } from "react";
import { Search, X, Hash } from "lucide-react";
import { noteApi } from "../../services";
import type { Note } from "../../types";

interface SearchModalProps {
  onClose: () => void;
  onNoteClick?: (note: Note) => void;
}

export default function SearchModal({ onClose, onNoteClick }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Note[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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
      const { data } = await noteApi.search(q);
      setResults((data.data as Note[]) || []);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[var(--bg-primary)] w-full max-w-lg rounded-xl shadow-2xl border border-[var(--border-color)] overflow-hidden animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)]">
          <Search className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search all notes..."
            className="flex-1 bg-transparent text-white text-[15px] placeholder:text-[var(--text-muted)] outline-none"
            autoFocus
          />
          {query && (
            <button onClick={() => handleSearch("")} className="text-[var(--text-muted)] hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="px-2 py-0.5 bg-[var(--bg-deep)] text-[var(--text-muted)] text-xs rounded border border-[var(--border-light)]">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {isSearching && (
            <div className="flex gap-4 px-4 py-4 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-[var(--border-light)] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[var(--border-light)] rounded w-1/3" />
                <div className="h-4 bg-[var(--border-light)] rounded w-2/3" />
              </div>
            </div>
          )}
          {!isSearching && hasSearched && results.length === 0 && (
            <div className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
          {!isSearching &&
            results.map((note) => (
              <div
                key={note.id}
                className="px-4 py-3 hover:bg-[var(--bg-hover)] cursor-pointer border-b border-[var(--border-color)] last:border-0 transition-colors"
                onClick={() => onNoteClick?.(note)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Hash className="w-3.5 h-3.5 text-[var(--text-dim)]" />
                  <span className="text-[12px] text-[var(--text-muted)]">Channel #{note.channel_id}</span>
                  <span className="text-[12px] text-[var(--text-muted)] ml-auto">
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-[14px] text-[var(--text-primary)] line-clamp-2 pl-5 leading-relaxed">
                  {note.content}
                </p>
              </div>
            ))}
          {!hasSearched && !isSearching && (
            <div className="px-4 py-8 text-center text-[var(--text-muted)] text-sm">
              Type to search across all your notes
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--border-color)] text-[11px] text-[var(--text-muted)]">
          Press Esc to close
        </div>
      </div>
    </div>
  );
}
