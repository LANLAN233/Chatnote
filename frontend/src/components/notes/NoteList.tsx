import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Hash, Bell, Pin, Search, HelpCircle, PlusCircle,
  SendHorizontal, Image as ImageIcon, X, Pencil, Trash2, Check,
  CornerDownLeft, Reply, MessageSquare, MoreVertical,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useNoteStore, useChannelStore, useAuthStore, useThreadStore } from "../../stores";
import { noteApi } from "../../services";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { Attachment, NoteReplyPreview } from "../../types";
import NoteEditor from "./NoteEditor";
import MentionHighlight from "../common/MentionHighlight";
import AttachmentCard from "./AttachmentCard";
import MessageContextMenu from "../common/MessageContextMenu";
import PinnedPanel from "./PinnedPanel";

/** 同一段消息的最大时间间隔：3 分钟（毫秒） */
const GROUP_TIME_WINDOW = 3 * 60 * 1000;

const TAG_COLORS: Record<string, string> = {
  "重点": "bg-[#5865f2] text-white",
  "待复习": "bg-[#f59e0b] text-white",
  "错题": "bg-[#f23f43] text-white",
};

function getTagColor(tag: string) {
  return TAG_COLORS[tag] || "bg-[#2b2d31] text-[#dbdee1] border border-[#4f545c]";
}

function DateDivider({ date }: { date: string }) {
  const d = new Date(date + 'Z');
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();

  let label: string;
  if (isToday) {
    label = 'Today';
  } else if (isYesterday) {
    label = 'Yesterday';
  } else {
    label = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  return (
    <div className="relative flex items-center justify-center my-4 py-2">
      <div className="absolute w-full h-[1px] bg-[#3f4147]" />
      <span className="relative px-2 bg-[#313338] text-[12px] font-bold text-[#949ba4]">{label}</span>
    </div>
  );
}

export default function NoteList() {
  const { channelId } = useParams<{ channelId: string }>();
  const { notes, fetchNotes } = useNoteStore();
  const { channels, setCurrentChannel } = useChannelStore();
  const { user } = useAuthStore();
  const { channelThreads, fetchChannelThreads } = useThreadStore();
  const channel = channels.find((c) => c.id === Number(channelId));
  const [searchTerm, setSearchTerm] = useState("");
  const [showPanel, setShowPanel] = useState<"none" | "notifications" | "pins" | "threads">("none");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [pinnedNotes, setPinnedNotes] = useState<typeof notes>([]);
  const [replyTo, setReplyTo] = useState<NoteReplyPreview | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);
  const prevNewestNoteId = useRef<number | null>(null);

  useEffect(() => {
    if (channelId) {
      setCurrentChannel(Number(channelId));
      fetchNotes(Number(channelId));
    }
  }, [channelId, fetchNotes, setCurrentChannel]);

  // Load pinned notes when panel opens or channel changes
  const loadPinned = useCallback(async () => {
    if (!channelId) return;
    try {
      const { data } = await noteApi.listPinned(Number(channelId));
      setPinnedNotes((data.data as typeof notes) || []);
    } catch {
      setPinnedNotes([]);
    }
  }, [channelId]);

  useEffect(() => {
    if (showPanel === "pins") {
      loadPinned();
    }
  }, [showPanel, loadPinned]);

  useEffect(() => {
    if (showPanel === "threads" && channelId) {
      fetchChannelThreads(Number(channelId));
    }
  }, [showPanel, channelId, fetchChannelThreads]);

  // Auto-scroll: scroll to bottom on initial load or when a new note arrives
  useEffect(() => {
    if (scrollRef.current) {
      const newestNote = notes[0] || null;
      const isInitialLoad = prevNewestNoteId.current === null && notes.length > 0;
      const hasNewNote = newestNote !== null && newestNote.id !== prevNewestNoteId.current;

      if (isInitialLoad || (hasNewNote && !userScrolled.current)) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }

      if (newestNote) {
        prevNewestNoteId.current = newestNote.id;
      }
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

  // Close mobile menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [mobileMenuOpen]);

  const filteredNotes = notes.filter((n) =>
    searchTerm === "" || n.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Reverse notes so oldest is at top, newest at bottom
  const sortedNotes = [...filteredNotes].reverse();

  const handleUnpin = async (noteId: number) => {
    try {
      await noteApi.togglePin(noteId);
      await loadPinned();
      if (channelId) await fetchNotes(Number(channelId));
    } catch (err) {
      console.error("Failed to unpin:", err);
    }
  };

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
          <div className="flex items-center gap-2 md:gap-4 text-[#b5bac1] flex-1 md:flex-none justify-end">
            {/* Desktop buttons */}
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => setShowPanel(showPanel === "threads" ? "none" : "threads")}
                className={`hover:text-[#dbdee1] ${showPanel === "threads" ? "text-white" : ""}`}
                title="Threads"
              >
                <MessageSquare size={20} />
              </button>
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
            </div>

            {/* Search - mobile: flex-1, desktop: w-24 */}
            <div className="bg-[#1e1f22] px-2 py-[2px] rounded h-6 flex items-center gap-2 flex-1 md:flex-none">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search"
                className="bg-transparent outline-none flex-1 md:w-24 text-[13px] placeholder-[#949ba4] md:focus:w-40 transition-all text-white min-w-0"
              />
              {searchTerm ? <X size={14} className="cursor-pointer opacity-60 hover:opacity-100 shrink-0" onClick={() => setSearchTerm("")} /> : <Search size={14} className="opacity-60 shrink-0" />}
            </div>

            {/* Desktop help button */}
            <button className="hidden md:block hover:text-[#dbdee1]" title="Help" onClick={() => alert("ChatNote Help:\n- Use @Server #Channel tags to categorize notes.\n- Use Control Panel to see raw system logs.\n- Use Plugins to extend bot behavior.")}>
              <HelpCircle size={20} />
            </button>

            {/* Mobile menu */}
            <div className="relative md:hidden" ref={mobileMenuRef}>
              <button
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="hover:text-[#dbdee1]"
                title="Menu"
              >
                <MoreVertical size={20} />
              </button>
              {mobileMenuOpen && (
                <div className="absolute right-0 top-10 w-48 bg-[#2b2d31] border border-[#1e1f22] rounded-lg shadow-xl py-1 z-50">
                  <button
                    onClick={() => { setShowPanel(showPanel === "threads" ? "none" : "threads"); setMobileMenuOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[#35373c] flex items-center gap-2 ${showPanel === "threads" ? "text-white" : "text-[#b5bac1]"}`}
                  >
                    <MessageSquare size={16} /> Threads
                  </button>
                  <button
                    onClick={() => { setShowPanel(showPanel === "notifications" ? "none" : "notifications"); setMobileMenuOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[#35373c] flex items-center gap-2 ${showPanel === "notifications" ? "text-white" : "text-[#b5bac1]"}`}
                  >
                    <Bell size={16} /> Notifications
                  </button>
                  <button
                    onClick={() => { setShowPanel(showPanel === "pins" ? "none" : "pins"); setMobileMenuOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[#35373c] flex items-center gap-2 ${showPanel === "pins" ? "text-white" : "text-[#b5bac1]"}`}
                  >
                    <Pin size={16} /> Pins
                  </button>
                  <div className="border-t border-[#1e1f22] my-1" />
                  <button
                    onClick={() => { alert("ChatNote Help:\n- Use @Server #Channel tags to categorize notes.\n- Use Control Panel to see raw system logs.\n- Use Plugins to extend bot behavior."); setMobileMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-[#35373c] flex items-center gap-2 text-[#b5bac1]"
                  >
                    <HelpCircle size={16} /> Help
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-[2px]">
          {sortedNotes.length === 0 && searchTerm && (
            <div className="text-center py-20">
              <p className="text-[#949ba4]">No results for &ldquo;{searchTerm}&rdquo; in this channel.</p>
            </div>
          )}

          {sortedNotes.map((note, idx) => {
            const prevNote = idx > 0 ? sortedNotes[idx - 1] : null;
            const timeDiff = prevNote
              ? new Date(note.created_at + 'Z').getTime() - new Date(prevNote.created_at + 'Z').getTime()
              : Infinity;
            const isSameSender = prevNote && prevNote.user_id === note.user_id && timeDiff <= GROUP_TIME_WINDOW;

            // Date divider: show when crossing a day boundary
            const showDateDivider = !prevNote ||
              new Date(note.created_at + 'Z').toLocaleDateString() !== new Date(prevNote.created_at + 'Z').toLocaleDateString();

            return (
              <div key={note.id}>
                {showDateDivider && <DateDivider date={note.created_at} />}
                <NoteRow
                  note={note}
                  isSameSender={!!isSameSender}
                  userName={user?.display_name || user?.username || "User"}
                  searchQuery={searchTerm}
                  onReply={(preview) => setReplyTo(preview)}
                  onPinToggle={async () => {
                    await noteApi.togglePin(note.id);
                    if (channelId) await fetchNotes(Number(channelId));
                    if (showPanel === "pins") await loadPinned();
                  }}
                />
              </div>
            );
          })}
        </main>

        <NoteEditor
          channelId={Number(channelId)}
          aiEnabled={aiEnabled}
          onToggleAI={() => setAiEnabled((v) => !v)}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      {showPanel !== "none" && (
        <>
          {showPanel === "pins" ? (
            <PinnedPanel
              notes={pinnedNotes}
              onUnpin={handleUnpin}
              onClose={() => setShowPanel("none")}
              onJump={(noteId) => {
                const el = document.getElementById(`note-${noteId}`);
                if (el && scrollRef.current) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }}
            />
          ) : showPanel === "threads" ? (
            <div className="w-80 bg-[#2b2d31] border-l border-[#1e1f22] flex flex-col animate-slide-in-right shrink-0">
              <header className="h-12 flex items-center justify-between px-4 border-b border-[#1e1f22]">
                <h3 className="font-bold text-white text-sm uppercase tracking-wide flex items-center gap-2">
                  <MessageSquare size={16} /> Threads
                </h3>
                <button onClick={() => setShowPanel("none")} className="text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto p-2">
                {channelThreads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center opacity-60 py-8">
                    <div className="w-16 h-16 bg-[#313338] rounded-full mb-4 flex items-center justify-center">
                      <MessageSquare size={32} />
                    </div>
                    <p className="text-sm">No threads in this channel yet.</p>
                  </div>
                ) : (
                  channelThreads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        useThreadStore.getState().setCurrentThreadId(t.id);
                        setShowPanel("none");
                      }}
                      className="w-full text-left p-3 rounded hover:bg-[#35373c] transition-colors group"
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquare size={16} className="mt-[2px] shrink-0 text-[#80848e]" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#dbdee1] truncate group-hover:text-white">
                            {t.title}
                          </p>
                          <p className="text-xs text-[#949ba4] mt-[2px]">
                            {t.messages ? (t.messages.length - 1) : 0} {(t.messages ? (t.messages.length - 1) : 0) === 1 ? "reply" : "replies"}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="w-80 bg-[#2b2d31] border-l border-[#1e1f22] flex flex-col animate-slide-in-right shrink-0">
              <header className="h-12 flex items-center justify-between px-4 border-b border-[#1e1f22]">
                <h3 className="font-bold text-white text-sm uppercase tracking-wide flex items-center gap-2">
                  <Bell size={16} /> Inbox
                </h3>
                <button onClick={() => setShowPanel("none")} className="text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center opacity-60">
                <div className="w-16 h-16 bg-[#313338] rounded-full mb-4 flex items-center justify-center">
                  <Bell size={32} />
                </div>
                <p className="text-sm">You have no unread messages at the moment.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NoteRow({
  note,
  isSameSender,
  userName,
  searchQuery,
  onReply,
  onPinToggle,
}: {
  note: { id: number; content: string; content_type: string; created_at: string; is_edited: boolean; is_pinned?: boolean; reply_to_id?: number | null; thread_id?: number | null; reply_preview?: { content: string } | null; user_tags?: string | null; ai_category?: string | null; attachments?: Attachment[] };
  isSameSender: boolean;
  userName: string;
  searchQuery: string;
  onReply: (preview: NoteReplyPreview) => void;
  onPinToggle: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [userTags, setUserTags] = useState<string[]>(() => {
    try {
      return note.user_tags ? JSON.parse(note.user_tags) : [];
    } catch {
      return [];
    }
  });
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const { updateNote, deleteNote } = useNoteStore();
  const { fetchThreadCount, threadCounts, setCurrentThreadId, createThread } = useThreadStore();
  const deleteRef = useRef<HTMLDivElement>(null);

  // Fetch thread message count when note has a thread
  const threadCount = note.thread_id ? threadCounts[note.thread_id] : undefined;
  useEffect(() => {
    if (note.thread_id) {
      fetchThreadCount(note.thread_id);
    }
  }, [note.thread_id, fetchThreadCount]);

  const handleSave = async () => {
    await updateNote(note.id, { content: editContent });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteNote(note.id);
    setShowDeleteConfirm(false);
  };

  const handleAddTag = async () => {
    if (!tagInput.trim()) return;
    const newTags = [...userTags, tagInput.trim()];
    setUserTags(newTags);
    setTagInput("");
    setShowTagInput(false);
    await noteApi.updateTags(note.id, newTags);
  };

  const handleRemoveTag = async (tag: string) => {
    const newTags = userTags.filter((t) => t !== tag);
    setUserTags(newTags);
    await noteApi.updateTags(note.id, newTags);
  };

  const handleContextMenuAction = (action: import("../common/MessageContextMenu").MenuAction) => {
    if (action === "edit") {
      setEditContent(note.content);
      setIsEditing(true);
    } else if (action === "reply") {
      onReply({ id: note.id, content: note.content.slice(0, 80), user_id: 0, created_at: note.created_at });
    } else if (action === "copy-text") {
      navigator.clipboard.writeText(note.content);
    } else if (action === "pin") {
      onPinToggle();
    } else if (action === "mark-unread") {
      // Visual only, refresh clears
    } else if (action === "copy-link") {
      navigator.clipboard.writeText(`${window.location.origin}/channels/${note.id}`);
    } else if (action === "tts") {
      // TTS placeholder
      const toast = document.createElement("div");
      toast.className = "fixed bottom-4 right-4 bg-[#2b2d31] text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50";
      toast.textContent = "TTS 功能即将上线";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    } else if (action === "create-thread") {
      createThread(note.id);
    } else if (action === "delete") {
      setShowDeleteConfirm(true);
    }
  };

  const timeStr = new Date(note.created_at + 'Z').toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

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
    <div
      id={`note-${note.id}`}
      className={`relative flex gap-4 group hover:bg-[#2e3035] -mx-4 px-4 py-[2px] ${!isSameSender ? "mt-4" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
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

        {/* Reply preview */}
        {note.reply_preview && (
          <div className="mb-1 flex items-start gap-2 text-[12px] text-[#949ba4] bg-[#2b2d31] rounded px-2 py-1 border-l-2 border-[#949ba4]">
            <CornerDownLeft size={12} className="mt-0.5 shrink-0" />
            <span className="truncate">{note.reply_preview.content}</span>
          </div>
        )}

        {isEditing ? (
          <div className="mb-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-xl border border-[#5865f2] focus:outline-none resize-none min-h-[200px] text-[15px] leading-snug"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsEditing(false);
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[11px] text-[#949ba4]">
                escape to cancel · enter to save
              </span>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 text-[13px] text-[#949ba4] hover:text-white flex items-center gap-1 transition-colors" onClick={() => setIsEditing(false)}>
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <button className="px-3 py-1.5 text-[13px] bg-[#5865f2] text-white rounded-lg font-medium hover:bg-[#4752c4] flex items-center gap-1 transition-colors" onClick={handleSave}>
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[15px] text-[#dbdee1] leading-snug break-words whitespace-pre-wrap select-text">
            {note.content_type === "markdown" ? (
              <ReactMarkdown>{note.content}</ReactMarkdown>
            ) : (
              <MentionHighlight text={note.content} />
            )}
          </div>
        )}

        {note.ai_category && !isEditing && (
          <div className="mt-2 text-[12px] bg-[#2b2d31] inline-flex items-center px-2 py-1 rounded border border-[#1e1f22] text-[#949ba4]">
            Categorized as <span className="text-[#23a559] font-bold ml-1">#{note.ai_category}</span>
          </div>
        )}

        {/* User tags */}
        {!isEditing && userTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {userTags.map((tag) => (
              <span
                key={tag}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${getTagColor(tag)}`}
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:opacity-70"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <button
              onClick={() => setShowTagInput(true)}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] text-[#949ba4] border border-dashed border-[#4f545c] hover:border-[#949ba4] hover:text-[#dbdee1]"
            >
              + Tag
            </button>
          </div>
        )}
        {showTagInput && (
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTag();
                if (e.key === "Escape") { setShowTagInput(false); setTagInput(""); }
              }}
              placeholder="New tag..."
              className="bg-[#1e1f22] text-white text-[12px] px-2 py-1 rounded outline-none border border-[#4f545c] focus:border-[#5865f2]"
            />
            <button onClick={handleAddTag} className="text-[#5865f2] text-[12px] hover:underline">Add</button>
            <button onClick={() => { setShowTagInput(false); setTagInput(""); }} className="text-[#949ba4] text-[12px] hover:underline">Cancel</button>
          </div>
        )}
        {!isEditing && userTags.length === 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowTagInput(true)}
              className="text-[11px] text-[#949ba4] hover:text-[#dbdee1] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              + Add tag
            </button>
          </div>
        )}

        {/* Thread count / link */}
        {!isEditing && note.thread_id && (
          <div className="mt-2">
            <button
              onClick={() => setCurrentThreadId(note.thread_id!)}
              className="text-xs text-[#6d6f78] hover:text-[#dbdee1] cursor-pointer transition-colors"
              data-testid="thread-count-btn"
            >
              {threadCount !== undefined
                ? `${threadCount} 则讯息`
                : "讨论串"}
            </button>
          </div>
        )}

        {note.attachments && note.attachments.length > 0 && !isEditing && (
          <AttachmentCard attachments={note.attachments} />
        )}
      </div>

      {/* Discord-style top-right floating action bar */}
      {!isEditing && (
        <div className="hidden group-hover:flex absolute -top-3 right-4 items-center gap-0.5 bg-[#2b2d31] rounded-lg shadow-lg border border-[#1e1f22] p-0.5 z-10">
          <button
            className="p-1.5 rounded hover:bg-[#35373c] text-[#949ba4] hover:text-white transition-colors"
            onClick={() => { setEditContent(note.content); setIsEditing(true); }}
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1.5 rounded hover:bg-[#35373c] text-[#949ba4] hover:text-white transition-colors"
            onClick={() => onReply({ id: note.id, content: note.content.slice(0, 80), user_id: 0, created_at: note.created_at })}
            title="Reply"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button
            className={`p-1.5 rounded hover:bg-[#35373c] text-[#949ba4] hover:text-white transition-colors ${note.is_pinned ? "text-[#5865f2]" : ""}`}
            onClick={onPinToggle}
            title={note.is_pinned ? "Unpin" : "Pin"}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1.5 rounded hover:bg-[#35373c] text-[#949ba4] hover:text-[#f23f43] transition-colors"
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <div
          ref={deleteRef}
          className="absolute top-6 right-4 p-3 bg-[#1e1f22] rounded-xl shadow-2xl z-20 flex items-center gap-3 text-sm border border-[#1e1f22] animate-zoom-in"
        >
          <span className="text-[#dbdee1]">Delete?</span>
          <button className="px-3 py-1.5 bg-[#f23f43] text-white text-[13px] rounded-lg font-medium hover:opacity-90 transition-opacity" onClick={handleDelete}>Delete</button>
          <button className="px-3 py-1.5 text-[#949ba4] hover:text-white text-[13px] transition-colors" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
        </div>
      )}

      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isPinned={!!note.is_pinned}
          showCreateThread={!note.thread_id}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
