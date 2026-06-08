import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { X, Pencil, Check, SendHorizontal, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useThreadStore } from "../../stores";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { Note } from "../../types";

export default function ThreadPanel() {
  const {
    currentThreadId,
    thread,
    isLoading,
    fetchThread,
    updateThreadTitle,
    postMessage,
    clearCurrentThreadId,
    setCurrentThreadId,
  } = useThreadStore();

  const isMobile = useIsMobile();

  const [searchParams, setSearchParams] = useSearchParams();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync URL param → store on mount and URL changes
  useEffect(() => {
    const threadParam = searchParams.get("thread");
    if (threadParam) {
      const id = Number(threadParam);
      if (!isNaN(id) && id !== currentThreadId) {
        setCurrentThreadId(id);
      }
    }
  }, [searchParams, currentThreadId, setCurrentThreadId]);

  // Fetch thread data when currentThreadId changes
  useEffect(() => {
    if (currentThreadId) {
      fetchThread(currentThreadId);
    }
  }, [currentThreadId, fetchThread]);

  // Sync store → URL param
  useEffect(() => {
    const threadParam = searchParams.get("thread");
    if (currentThreadId) {
      if (threadParam !== String(currentThreadId)) {
        setSearchParams({ thread: String(currentThreadId) }, { replace: true });
      }
    }
  }, [currentThreadId, searchParams, setSearchParams]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [thread?.messages]);

  const handleClose = useCallback(() => {
    clearCurrentThreadId();
    // Remove thread param from URL
    searchParams.delete("thread");
    setSearchParams(searchParams, { replace: true });
  }, [clearCurrentThreadId, searchParams, setSearchParams]);

  const handleTitleClick = useCallback(() => {
    if (thread) {
      setTitleDraft(thread.title);
      setIsEditingTitle(true);
    }
  }, [thread]);

  const handleTitleSave = useCallback(async () => {
    if (thread && titleDraft.trim() && titleDraft.trim() !== thread.title) {
      await updateThreadTitle(thread.id, titleDraft.trim());
    }
    setIsEditingTitle(false);
  }, [thread, titleDraft, updateThreadTitle]);

  const handleTitleCancel = useCallback(() => {
    setIsEditingTitle(false);
    setTitleDraft("");
  }, []);

  const handleSend = useCallback(async () => {
    if (!currentThreadId || !newMessage.trim()) return;
    setIsSending(true);
    try {
      await postMessage(currentThreadId, newMessage.trim());
      setNewMessage("");
    } finally {
      setIsSending(false);
    }
  }, [currentThreadId, newMessage, postMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTitleSave();
      } else if (e.key === "Escape") {
        handleTitleCancel();
      }
    },
    [handleTitleSave, handleTitleCancel]
  );

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const isOpen = currentThreadId !== null;

  return (
    <>
      {/* Backdrop overlay when panel is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 transition-opacity duration-300"
          onClick={handleClose}
          data-testid="thread-backdrop"
        />
      )}

      {/* Panel */}
      <div
        className={`${
          isMobile
            ? "fixed inset-0 w-full h-full"
            : "fixed right-0 top-0 h-full w-80"
        } bg-[#2b2d31] border-l border-[#1e1f22] flex flex-col z-40 transform transition-transform duration-300 ease-in-out ${
          isOpen
            ? isMobile
              ? "translate-y-0"
              : "translate-x-0"
            : isMobile
              ? "translate-y-full"
              : "translate-x-full"
        }`}
        data-testid="thread-panel"
      >
        {/* Header */}
        <header className="h-12 flex items-center justify-between px-4 border-b border-[#1e1f22] shrink-0">
          <div className="flex-1 min-w-0 mr-2">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={handleTitleCancel}
                className="w-full bg-[#1e1f22] text-white text-sm font-bold px-2 py-0.5 rounded outline-none border border-[#5865f2]"
                data-testid="thread-title-input"
              />
            ) : (
              <div className="flex items-center gap-2">
                <h3
                  className="font-bold text-white text-sm truncate cursor-pointer hover:text-[#dbdee1] transition-colors"
                  onClick={handleTitleClick}
                  title="Click to edit title"
                  data-testid="thread-title"
                >
                  {thread?.title || "Thread"}
                </h3>
                <button
                  onClick={handleTitleClick}
                  className="text-gray-400 hover:text-white shrink-0"
                  title="Edit title"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}
          </div>
          {isEditingTitle && (
            <button
              onClick={handleTitleSave}
              className="text-[#23a559] hover:text-[#2dc770] mr-1"
              title="Save title"
            >
              <Check size={16} />
            </button>
          )}
          <button
            onClick={handleClose}
            className={`text-gray-400 hover:text-white ${
              isMobile ? "w-11 h-11 flex items-center justify-center" : ""
            }`}
            title="Close panel"
            data-testid="thread-close"
          >
            <X size={isMobile ? 24 : 18} />
          </button>
        </header>

        {/* Message list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center h-32">
              <div className="text-sm text-[#949ba4]">Loading...</div>
            </div>
          )}

          {!isLoading && (!thread || thread.messages.length === 0) && (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
              <div className="w-16 h-16 bg-[#313338] rounded-full mb-4 flex items-center justify-center">
                <MessageSquare size={32} />
              </div>
              <p className="text-sm text-[#949ba4]">No messages in this thread yet.</p>
            </div>
          )}

          {!isLoading &&
            thread?.messages.map((message) => (
              <ThreadMessage key={message.id} message={message} />
            ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input box */}
        <div className="p-3 border-t border-[#1e1f22] shrink-0">
          <div className="bg-[#383a40] rounded-lg flex items-end gap-2 p-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Reply in thread..."
              className="flex-1 bg-transparent outline-none text-[#dbdee1] text-[14px] resize-none h-9 leading-9 placeholder-[#949ba4] min-h-[36px] max-h-[120px]"
              rows={1}
              data-testid="thread-message-input"
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || isSending}
              className={`shrink-0 p-1.5 rounded transition-colors ${
                newMessage.trim() && !isSending
                  ? "text-[#5865f2] hover:text-white hover:bg-[#5865f2]"
                  : "text-[#4f545c] cursor-not-allowed"
              }`}
              title="Send message"
              data-testid="thread-send-btn"
            >
              <SendHorizontal size={20} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Inline thread message renderer — follows NoteRow pattern from NoteList */
function ThreadMessage({ message }: { message: Note }) {
  const timeStr = new Date(message.created_at + "Z").toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div className="flex gap-3 group hover:bg-[#2e3035] -mx-4 px-4 py-1 rounded transition-colors">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs mt-0.5 bg-gradient-to-br from-[#5865f2] to-[#4752c4]">
        {message.user_id ? String(message.user_id)[0] : "?"}
      </div>

      <div className="flex-1 min-w-0">
        {/* Sender info */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-[13px] text-white">
            User #{message.user_id}
          </span>
          <span className="text-[11px] text-[#949ba4] font-medium">
            {timeStr}
          </span>
          {message.is_edited && (
            <span className="text-[10px] text-[#949ba4]">(edited)</span>
          )}
        </div>

        {/* Content */}
        <div className="text-[14px] text-[#dbdee1] leading-snug break-words whitespace-pre-wrap">
          {message.content_type === "markdown" ? (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          ) : (
            <span>{message.content}</span>
          )}
        </div>
      </div>
    </div>
  );
}
