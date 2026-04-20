import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Hash, ChevronLeft, ChevronRight, Pencil, Trash2, X, Check } from "lucide-react";
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

  useEffect(() => {
    if (channelId) {
      setCurrentChannel(Number(channelId));
      fetchNotes(Number(channelId), page);
    }
  }, [channelId, page, fetchNotes, setCurrentChannel]);

  const totalPages = Math.ceil(totalNotes / pageSize);

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
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-12 px-4 flex items-center border-b border-[var(--border-color)] shadow-[0_1px_0_var(--shadow-color)] shrink-0">
        <Hash className="w-5 h-5 text-[var(--text-muted)] mr-2" />
        <h2 className="font-semibold text-white">{channel.name}</h2>
        {channel.description && (
          <span className="ml-3 text-[13px] text-[var(--text-muted)] hidden md:inline">{channel.description}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-[var(--text-muted)]">
              <Hash className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold text-white mb-1">No notes yet</h3>
              <p className="text-sm">Start writing in the box below!</p>
            </div>
          </div>
        ) : (
          <div className="py-4">
            {notes.map((note, idx) => {
              const showHeader = idx === 0 || notes[idx - 1].user_id !== note.user_id;
              const timeStr = new Date(note.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const dateStr = new Date(note.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              const showDateDivider =
                idx === 0 ||
                new Date(notes[idx - 1].created_at).toDateString() !== new Date(note.created_at).toDateString();

              return (
                <div key={note.id}>
                  {showDateDivider && (
                    <div className="flex items-center mx-4 my-4">
                      <div className="flex-1 h-px bg-[var(--bg-active)]" />
                      <span className="px-2 text-[11px] font-semibold text-[var(--text-muted)]">{dateStr}</span>
                      <div className="flex-1 h-px bg-[var(--bg-active)]" />
                    </div>
                  )}
                  <NoteRow
                    note={note}
                    showHeader={showHeader}
                    timeStr={timeStr}
                    userName={user?.display_name || user?.username || "User"}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2 border-t border-[var(--border-color)] shrink-0 text-[13px]">
          <button
            className="p-1 text-[var(--text-muted)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[var(--text-muted)]">
            {page} / {totalPages}
          </span>
          <button
            className="p-1 text-[var(--text-muted)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <NoteEditor channelId={Number(channelId)} />
    </div>
  );
}

function NoteRow({
  note,
  showHeader,
  timeStr,
  userName,
}: {
  note: { id: number; content: string; content_type: string; created_at: string; is_edited: boolean };
  showHeader: boolean;
  timeStr: string;
  userName: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const { updateNote, deleteNote } = useNoteStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSave = async () => {
    await updateNote(note.id, { content: editContent });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteNote(note.id);
    setShowDeleteConfirm(false);
  };

  if (showHeader) {
    return (
      <div className="group px-4 py-[2px] hover:bg-[#2e3035] transition-colors">
        <div className="flex items-start gap-4 pt-4">
          <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-semibold text-sm shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-medium text-white text-[15px]">{userName}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{timeStr}</span>
              {note.is_edited && <span className="text-[11px] text-[var(--text-muted)]">(edited)</span>}
            </div>
            <NoteContent
              note={note}
              isEditing={isEditing}
              editContent={editContent}
              setEditContent={setEditContent}
              setIsEditing={setIsEditing}
              handleSave={handleSave}
            />
          </div>
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <ActionButton icon={<Pencil className="w-3.5 h-3.5" />} title="Edit" onClick={() => { setEditContent(note.content); setIsEditing(true); }} />
            <ActionButton icon={<Trash2 className="w-3.5 h-3.5" />} title="Delete" onClick={() => setShowDeleteConfirm(true)} danger />
          </div>
        </div>
        {showDeleteConfirm && (
          <div className="ml-14 mt-2 p-3 bg-[var(--bg-deep)] rounded-lg inline-flex items-center gap-3 text-sm">
            <span className="text-[var(--text-secondary)]">Delete this note?</span>
            <button className="px-3 py-1 bg-[var(--danger)] text-white text-[13px] rounded font-medium hover:bg-[var(--danger)]/80" onClick={handleDelete}>
              Delete
            </button>
            <button className="px-3 py-1 text-[var(--text-muted)] hover:text-white text-[13px]" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group px-4 pl-[72px] py-[2px] hover:bg-[#2e3035] transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <NoteContent
            note={note}
            isEditing={isEditing}
            editContent={editContent}
            setEditContent={setEditContent}
            setIsEditing={setIsEditing}
            handleSave={handleSave}
          />
        </div>
        <span className="hidden group-hover:block text-[11px] text-[var(--text-muted)] shrink-0 pt-0.5">{timeStr}</span>
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <ActionButton icon={<Pencil className="w-3.5 h-3.5" />} title="Edit" onClick={() => { setEditContent(note.content); setIsEditing(true); }} />
          <ActionButton icon={<Trash2 className="w-3.5 h-3.5" />} title="Delete" onClick={() => setShowDeleteConfirm(true)} danger />
        </div>
      </div>
      {showDeleteConfirm && (
        <div className="mt-2 p-3 bg-[var(--bg-deep)] rounded-lg inline-flex items-center gap-3 text-sm">
          <span className="text-[var(--text-secondary)]">Delete this note?</span>
          <button className="px-3 py-1 bg-[var(--danger)] text-white text-[13px] rounded font-medium hover:bg-[var(--danger)]/80" onClick={handleDelete}>
            Delete
          </button>
          <button className="px-3 py-1 text-[var(--text-muted)] hover:text-white text-[13px]" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function NoteContent({
  note,
  isEditing,
  editContent,
  setEditContent,
  setIsEditing,
  handleSave,
}: {
  note: { content: string; content_type: string };
  isEditing: boolean;
  editContent: string;
  setEditContent: (v: string) => void;
  setIsEditing: (v: boolean) => void;
  handleSave: () => void;
}) {
  if (isEditing) {
    return (
      <div className="mb-1">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded-lg border border-[var(--accent)] focus:outline-none resize-none min-h-[80px] text-[15px]"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") setIsEditing(false);
          }}
        />
        <div className="flex gap-2 mt-1.5">
          <button
            className="px-3 py-1 text-[13px] bg-[var(--accent)] text-white rounded font-medium hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1"
            onClick={handleSave}
          >
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button
            className="px-3 py-1 text-[13px] text-[var(--text-muted)] hover:text-white transition-colors flex items-center gap-1"
            onClick={() => setIsEditing(false)}
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-[15px] text-[var(--text-primary)] prose prose-invert prose-sm max-w-none leading-relaxed">
      {note.content_type === "markdown" ? (
        <ReactMarkdown>{note.content}</ReactMarkdown>
      ) : (
        <p className="whitespace-pre-wrap">{note.content}</p>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  title,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`p-1 rounded hover:bg-[var(--bg-hover)] transition-colors ${
        danger ? "text-[var(--text-muted)] hover:text-[var(--danger)]" : "text-[var(--text-muted)] hover:text-white"
      }`}
      onClick={onClick}
      title={title}
    >
      {icon}
    </button>
  );
}