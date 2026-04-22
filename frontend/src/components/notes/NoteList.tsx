import { useEffect, useState, useRef, useCallback } from "react";
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
  const { notes, totalNotes, pageSize, fetchNotes } = useNoteStore();
  const { channels, setCurrentChannel } = useChannelStore();
  const { user } = useAuthStore();
  const channel = channels.find((c) => c.id === Number(channelId));
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPanel, setShowPanel] = useState<"none" | "notifications" | "pins">("none");
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);
  const prevNotesLength = useRef(notes.length);

  useEffect(() => {
    if (channelId) {
      setCurrentChannel(Number(channelId));
      fetchNotes(Number(channelId), page);
    }
  }, [channelId, page, fetchNotes, setCurrentChannel]);

  // Smart scroll: only auto-scroll on initial load or when new notes are added (not on page change)
  useEffect(() => {
    if (scrollRef.current) {
      const isNewNote = notes.length > prevNotesLength.current;
      const isInitialLoad = prevNotesLength.current === 0 && notes.length > 0;
      if (isInitialLoad || (isNewNote && !userScrolled.current)) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      prevNotesLength.current = notes.length;
    }
  }, [notes]);

  // Track user scroll
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      userScrolled.current = !isNearBottom;
    }
  }, []);

  const totalPages = Math.ceil(totalNotes / pageSize);

  const filteredNotes = notes.filter((n) =>
    searchTerm === "" || n.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!channelId || !channel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#313338]">
        <div className="text-center text-[#949ba4]">
          <Hash className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <h3 className="text-xl font-semibold text-white mb-2">No channel selected</h3>
          <p className="text-sm">Select a channel from the sidebar to start taking notes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#313338] flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-[#1e1f22] px-4 flex items-center justify-between shadow-sm bg-[#313338] flex-shrink-0 z-10">
          <div className="flex items-center gap-2">
            <Hash size={24} className="text-[#80848e]" />
            <h2 className="font-bold text-white text-[15px]">{channel.name.toLowerCase()}</h2>
            {channel.description && (
              <span className="ml-2 text-[13px] text-[#949ba4] hidden md:inline border-l border-[#1e1f22] pl-2">
                {channel.description}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-[#b5bac1]">
            <button
              onClick={() => setShowPanel(showPanel === "notifications" ? "none" : "notifications")}
              className={`hover:text-[#dbdee1] ${showPanel === "notifications" ? "text-white" : ""}`}
              title="Notifications"
            >
              <Bell size={20} />
            </button>
            <button
              onClick={() => setShowPanel(showPanel === "pins" ? "none" : "pins")}
              className={`hover:text-[#dbdee1] ${showPanel === "pins" ? "text-white" : ""}`}
              title="Pinned Messages"
            >
              <Pin size={20} />
            </button>

            <div className="bg-[#1e1f22] px-2 py-[2px] rounded h-6 flex items-center gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search"
                className="bg-transparent outline-none w-24 text-[13px] placeholder-[#949ba4] focus:w-40 transition-all text-white"
              />
              {searchTerm ? <X size={14} className="cursor-pointer opacity-60 hover:opacity-100" onClick={() => setSearchTerm("")} /> : <Search size={14} className="opacity-60" />}
            </div>

            <button className="hover:text-[#dbdee1]" title="Help" onClick={() => alert("ChatNote Help:\n- Use @Server #Channel tags to categorize notes.\n- Use Control Panel to see raw system logs.\n- Use Plugins to extend bot behavior.")}>
              <HelpCircle size={20} />
            </button>
          </div>
        </header>

        <main ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-[2px]">
          <div className="relative flex items-center justify-center my-4 py-2">
            <div className="absolute w-full h-[1px] bg-[#3f4147]" />
            <span className="relative px-2 bg-[#313338] text-[12px] font-bold text-[#949ba4]">Today</span>
          </div>

          {filteredNotes.length === 0 && searchTerm && (
            <div className="text-center py-20">
              <p className="text-[#949ba4]">No results for &ldquo;{searchTerm}&rdquo; in this channel.</p>
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
                searchQuery={searchTerm}
              />
            );
          })}
        </main>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2 border-t border-[#1e1f22] shrink-0 text-[13px]">
            <button
              className="p-1 text-[#949ba4] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded hover:bg-[#35373c]"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              ←
            </button>
            <span className="text-[#949ba4] text-xs">
              {page} / {totalPages}
            </span>
            <button
              className="p-1 text-[#949ba4] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded hover:bg-[#35373c]"
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
        <div className="w-80 bg-[#2b2d31] border-l border-[#1e1f22] flex flex-col animate-slide-in-right shrink-0">
          <header className="h-12 flex items-center justify-between px-4 border-b border-[#1e1f22]">
            <h3 className="font-bold text-white text-sm uppercase tracking-wide">
              {showPanel === "notifications" ? "Inbox" : "Pinned"}
            </h3>
            <button onClick={() => setShowPanel("none")} className="text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center opacity-60">
            <div className="w-16 h-16 bg-[#313338] rounded-full mb-4 flex items-center justify-center">
              {showPanel === "notifications" ? <Bell size={32} /> : <Pin size={32} />}
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
  searchQuery,
}: {
  note: { id: number; content: string; content_type: string; created_at: string; is_edited: boolean; ai_category?: string | null };
  isSameSender: boolean;
  userName: string;
  searchQuery: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { updateNote, deleteNote } = useNoteStore();
  const deleteRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    await updateNote(note.id, { content: editContent });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteNote(note.id);
    setShowDeleteConfirm(false);
  };

  const timeStr = new Date(note.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  // Highlight search matches
  const highlightText = (text: string) => {
    if (!searchQuery) return text;
    const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery.toLowerCase() ?
        <mark key={i} className="bg-[#5865f2]/20 text-[#5865f2] rounded px-0.5">{part}</mark> :
        part
    );
  };

  return (
    <div className={`flex gap-4 group hover:bg-[#2e3035] -mx-4 px-4 py-[2px] ${!isSameSender ? "mt-4" : ""}`}>
      {!isSameSender ? (
        <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm mt-1 bg-gradient-to-br from-[#5865f2] to-[#4752c4]">
          {userName[0].toUpperCase()}
        </div>
      ) : (
        <div className="w-10 flex-shrink-0 flex justify-center">
          <span className="hidden group-hover:block text-[10px] text-[#949ba4] mt-2 select-none">
            {timeStr}
          </span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {!isSameSender && (
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-[15px] text-white hover:underline cursor-pointer">
              {userName}
            </span>
            <span className="text-[12px] text-[#949ba4] font-medium">
              {timeStr}
            </span>
            {note.is_edited && <span className="text-[10px] text-[#949ba4]">(edited)</span>}
          </div>
        )}

        {isEditing ? (
          <div className="mb-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-xl border border-[#5865f2] focus:outline-none resize-none min-h-[80px] text-[14px]"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Escape") setIsEditing(false); }}
            />
            <div className="flex gap-2 mt-1.5">
              <button className="px-3 py-1.5 text-[13px] bg-[#5865f2] text-white rounded-lg font-medium hover:bg-[#4752c4] flex items-center gap-1 transition-colors" onClick={handleSave}>
                <Check className="w-3.5 h-3.5" /> Save
              </button>
              <button className="px-3 py-1.5 text-[13px] text-[#949ba4] hover:text-white flex items-center gap-1 transition-colors" onClick={() => setIsEditing(false)}>
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[15px] text-[#dbdee1] leading-snug break-words whitespace-pre-wrap">
            {note.content_type === "markdown" ? (
              <ReactMarkdown>{note.content}</ReactMarkdown>
            ) : (
              <span>{highlightText(note.content)}</span>
            )}
          </div>
        )}

        {note.ai_category && !isEditing && (
          <div className="mt-2 text-[12px] bg-[#2b2d31] inline-flex items-center px-2 py-1 rounded border border-[#1e1f22] text-[#949ba4]">
            Categorized as <span className="text-[#23a559] font-bold ml-1">#{note.ai_category}</span>
          </div>
        )}
      </div>

      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 mt-1">
        <button
          className="p-1.5 rounded hover:bg-[#35373c] text-[#949ba4] hover:text-white transition-colors"
          onClick={() => { setEditContent(note.content); setIsEditing(true); }}
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          className="p-1.5 rounded hover:bg-[#35373c] text-[#949ba4] hover:text-[#f23f43] transition-colors"
          onClick={() => setShowDeleteConfirm(true)}
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {showDeleteConfirm && (
        <div
          ref={deleteRef}
          className="absolute right-6 p-3 bg-[#1e1f22] rounded-xl shadow-2xl z-20 flex items-center gap-3 text-sm border border-[#1e1f22] animate-zoom-in"
        >
          <span className="text-[#dbdee1]">Delete?</span>
          <button className="px-3 py-1.5 bg-[#f23f43] text-white text-[13px] rounded-lg font-medium hover:opacity-90 transition-opacity" onClick={handleDelete}>Delete</button>
          <button className="px-3 py-1.5 text-[#949ba4] hover:text-white text-[13px] transition-colors" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
