import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Hash, Bell, Pin, Search, HelpCircle, PlusCircle,
  SendHorizontal, Image as ImageIcon, X, Pencil, Trash2, Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useNoteStore, useChannelStore, useAuthStore } from "../../stores";
import NoteEditor from "./NoteEditor";

export default function NoteList() {
  const { channelId } = useParams<{ channelId: string }>();
  const { notes, totalNotes, currentPage, pageSize, fetchNotes } = useNoteStore();
  const { channels, setCurrentChannel } = useChannelStore();
  const { user } = useAuthStore();
  const channel = channels.find((c) => c.id === Number(channelId));
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPanel, setShowPanel] = useState<"none" | "notifications" | "pins">("none");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (channelId) {
      setCurrentChannel(Number(channelId));
      fetchNotes(Number(channelId), page);
    }
  }, [channelId, page, fetchNotes, setCurrentChannel]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [notes]);

  const totalPages = Math.ceil(totalNotes / pageSize);

  const filteredNotes = notes.filter((n) =>
    searchTerm === "" || n.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!channelId || !channel) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-[var(--text-muted)]">
          <Hash className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <h3 className="text-xl font-semibold text-white mb-2">No channel selected</h3>
          <p className="text-sm">Select a channel from the sidebar to start taking notes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[var(--bg-primary)] flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-[var(--border-color)] px-4 flex items-center justify-between shadow-sm bg-[var(--bg-primary)] shrink-0 z-10">
          <div className="flex items-center gap-2">
            <Hash className="w-6 h-6 text-[var(--text-dim)]" />
            <h2 className="font-bold text-white text-[15px]">{channel.name}</h2>
            {channel.description && (
              <span className="ml-2 text-[13px] text-[var(--text-muted)] hidden md:inline border-l border-[var(--border-light)] pl-2">
                {channel.description}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-[var(--text-secondary)]">
            <button
              onClick={() => setShowPanel(showPanel === "notifications" ? "none" : "notifications")}
              className={`hover:text-[var(--text-primary)] ${showPanel === "notifications" ? "text-white" : ""}`}
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowPanel(showPanel === "pins" ? "none" : "pins")}
              className={`hover:text-[var(--text-primary)] ${showPanel === "pins" ? "text-white" : ""}`}
              title="Pinned Messages"
            >
              <Pin className="w-5 h-5" />
            </button>
            <div className="bg-[var(--bg-deep)] px-2 py-[2px] rounded h-6 flex items-center gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search"
                className="bg-transparent outline-none w-24 text-[13px] placeholder-[var(--text-muted)] focus:w-40 transition-all text-white"
              />
              {searchTerm ? (
                <X className="w-3.5 h-3.5 cursor-pointer opacity-60 hover:opacity-100" onClick={() => setSearchTerm("")} />
              ) : (
                <Search className="w-3.5 h-3.5 opacity-60" />
              )}
            </div>
            <button className="hover:text-[var(--text-primary)]" title="Help">
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-[2px]">
          <div className="relative flex items-center justify-center my-4 py-2">
            <div className="absolute w-full h-px bg-[var(--border-light)]" />
            <span className="relative px-2 bg-[var(--bg-primary)] text-[12px] font-bold text-[var(--text-muted)]">
              Today
            </span>
          </div>

          {filteredNotes.length === 0 && searchTerm && (
            <div className="text-center py-20">
              <p className="text-[var(--text-muted)]">No results for &ldquo;{searchTerm}&rdquo; in this channel.</p>
            </div>
          )}

          {filteredNotes.map((note, idx) => {
            const prevNote = idx > 0 ? filteredNotes[idx - 1] : null;
            const isSameSender = prevNote && prevNote.user_id === note.user_id &&
              (new Date(note.created_at).getTime() - new Date(prevNote.created_at).getTime() < 300000);

            return (
              <NoteRow
                key={note.id}
                note={note}
                isSameSender={!!isSameSender}
                userName={user?.display_name || user?.username || "User"}
              />
            );
          })}
        </main>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2 border-t border-[var(--border-color)] shrink-0 text-[13px]">
            <button
              className="p-1 text-[var(--text-muted)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              ←
            </button>
            <span className="text-[var(--text-muted)]">
              {page} / {totalPages}
            </span>
            <button
              className="p-1 text-[var(--text-muted)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              →
            </button>
          </div>
        )}

        <NoteEditor channelId={Number(channelId)} />
      </div>

      {showPanel !== "none" && (
        <div className="w-80 bg-[var(--bg-secondary)] border-l border-[var(--border-color)] flex flex-col animate-slide-in-right shrink-0">
          <header className="h-12 flex items-center justify-between px-4 border-b border-[var(--border-color)]">
            <h3 className="font-bold text-white text-sm uppercase tracking-wide">
              {showPanel === "notifications" ? "Inbox" : "Pinned"}
            </h3>
            <button onClick={() => setShowPanel("none")} className="text-gray-400 hover:text-white">
              <X className="w-[18px] h-[18px]" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center opacity-60">
            <div className="w-16 h-16 bg-[var(--bg-primary)] rounded-full mb-4 flex items-center justify-center">
              {showPanel === "notifications" ? <Bell className="w-8 h-8" /> : <Pin className="w-8 h-8" />}
            </div>
            <p className="text-sm">You have no {showPanel === "notifications" ? "unread messages" : "pinned messages"} at the moment.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteRow({
  note,
  isSameSender,
  userName,
}: {
  note: { id: number; content: string; content_type: string; created_at: string; is_edited: boolean; ai_category?: string | null };
  isSameSender: boolean;
  userName: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { updateNote, deleteNote } = useNoteStore();

  const handleSave = async () => {
    await updateNote(note.id, { content: editContent });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteNote(note.id);
    setShowDeleteConfirm(false);
  };

  const timeStr = new Date(note.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className={`flex gap-4 group hover:bg-[#2e3035] -mx-4 px-4 py-[2px] ${!isSameSender ? "mt-4" : ""}`}>
      {!isSameSender ? (
        <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm mt-1 bg-[#5865f2]">
          {userName[0].toUpperCase()}
        </div>
      ) : (
        <div className="w-10 shrink-0 flex justify-center">
          <span className="hidden group-hover:block text-[10px] text-[var(--text-muted)] mt-2 select-none">
            {timeStr}
          </span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {!isSameSender && (
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-[15px] text-white hover:underline cursor-pointer">{userName}</span>
            <span className="text-[12px] text-[var(--text-muted)] font-medium">{timeStr}</span>
            {note.is_edited && <span className="text-[11px] text-[var(--text-muted)]">(edited)</span>}
          </div>
        )}

        {isEditing ? (
          <div className="mb-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded-lg border border-[var(--accent)] focus:outline-none resize-none min-h-[80px] text-[15px]"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Escape") setIsEditing(false); }}
            />
            <div className="flex gap-2 mt-1.5">
              <button className="px-3 py-1 text-[13px] bg-[var(--accent)] text-white rounded font-medium hover:bg-[var(--accent-hover)] flex items-center gap-1" onClick={handleSave}>
                <Check className="w-3.5 h-3.5" /> Save
              </button>
              <button className="px-3 py-1 text-[13px] text-[var(--text-muted)] hover:text-white flex items-center gap-1" onClick={() => setIsEditing(false)}>
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[15px] text-[var(--text-primary)] leading-snug break-words whitespace-pre-wrap prose prose-invert prose-sm max-w-none">
            {note.content_type === "markdown" ? (
              <ReactMarkdown>{note.content}</ReactMarkdown>
            ) : (
              note.content
            )}
          </div>
        )}

        {note.ai_category && !isEditing && (
          <div className="mt-2 text-[12px] bg-[var(--bg-secondary)] inline-flex items-center px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-muted)]">
            Categorized as <span className="text-[var(--success)] font-bold ml-1">#{note.ai_category}</span>
          </div>
        )}
      </div>

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 mt-1">
        <button
          className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white transition-colors"
          onClick={() => { setEditContent(note.content); setIsEditing(true); }}
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
          onClick={() => setShowDeleteConfirm(true)}
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {showDeleteConfirm && (
        <div className="absolute right-4 mt-8 p-3 bg-[var(--bg-deep)] rounded-lg shadow-xl z-20 flex items-center gap-3 text-sm border border-[var(--border-color)]">
          <span className="text-[var(--text-secondary)]">Delete?</span>
          <button className="px-3 py-1 bg-[var(--danger)] text-white text-[13px] rounded font-medium hover:bg-[var(--danger)]/80" onClick={handleDelete}>Delete</button>
          <button className="px-3 py-1 text-[var(--text-muted)] hover:text-white text-[13px]" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
