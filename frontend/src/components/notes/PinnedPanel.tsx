import { Pin, X, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Note } from "../../types";

interface PinnedPanelProps {
  notes: Note[];
  onUnpin: (noteId: number) => void;
  onClose: () => void;
  onJump?: (noteId: number) => void;
}

export default function PinnedPanel({ notes, onUnpin, onClose, onJump }: PinnedPanelProps) {
  return (
    <div className="w-80 bg-[#2b2d31] border-l border-[#1e1f22] flex flex-col animate-slide-in-right shrink-0">
      <header className="h-12 flex items-center justify-between px-4 border-b border-[#1e1f22]">
        <h3 className="font-bold text-white text-sm uppercase tracking-wide flex items-center gap-2">
          <Pin size={16} /> Pinned Messages
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={18} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center opacity-60 h-full">
            <div className="w-16 h-16 bg-[#313338] rounded-full mb-4 flex items-center justify-center">
              <Pin size={32} />
            </div>
            <p className="text-sm text-[#949ba4]">You have no pinned messages at the moment.</p>
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="bg-[#313338] rounded-lg p-3 border border-[#1e1f22] group hover:border-[#4f545c] transition-colors"
            >
              <div className="text-[13px] text-[#dbdee1] leading-snug break-words line-clamp-4">
                {note.content_type === "markdown" ? (
                  <ReactMarkdown>{note.content}</ReactMarkdown>
                ) : (
                  <span>{note.content}</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                {onJump && (
                  <button
                    onClick={() => onJump(note.id)}
                    className="text-[11px] text-[#5865f2] hover:underline"
                  >
                    Jump to message
                  </button>
                )}
                <button
                  onClick={() => onUnpin(note.id)}
                  className="ml-auto p-1.5 rounded hover:bg-[#f23f43]/10 text-[#949ba4] hover:text-[#f23f43] transition-colors"
                  title="Unpin"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
