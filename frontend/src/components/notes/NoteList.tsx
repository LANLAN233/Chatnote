import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useNoteStore, useChannelStore } from "../../stores";
import NoteEditor from "./NoteEditor";

export default function NoteList() {
  const { channelId } = useParams<{ channelId: string }>();
  const { notes, totalNotes, currentPage, pageSize, fetchNotes } = useNoteStore();
  const { channels, setCurrentChannel } = useChannelStore();
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
      <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
        Select a channel to view notes
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-semibold text-white">#{channel.name}</h2>
          {channel.description && <p className="text-xs text-[var(--text-secondary)]">{channel.description}</p>}
        </div>
        <span className="text-xs text-[var(--text-secondary)]">{totalNotes} notes</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {notes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
            No notes yet. Start writing!
          </div>
        ) : (
          notes.map((note) => <NoteItem key={note.id} note={note} />)
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2 border-t border-[var(--border-color)] shrink-0">
          <button
            className="px-3 py-1 text-sm rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-white disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-[var(--text-secondary)]">
            {page} / {totalPages}
          </span>
          <button
            className="px-3 py-1 text-sm rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-white disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      <NoteEditor channelId={Number(channelId)} />
    </div>
  );
}

function NoteItem({ note }: { note: { id: number; content: string; content_type: string; created_at: string; is_edited: boolean } }) {
  const [isEditing, setIsEditing] = useState(false);
  const { updateNote, deleteNote } = useNoteStore();
  const [editContent, setEditContent] = useState(note.content);

  const handleSave = async () => {
    await updateNote(note.id, { content: editContent });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteNote(note.id);
  };

  const timeStr = new Date(note.created_at).toLocaleString();

  return (
    <div className="group py-3 border-b border-[var(--border-color)]/50">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--bg-accent)] flex items-center justify-center text-white font-semibold text-sm shrink-0">
          U
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-white text-sm">User</span>
            <span className="text-xs text-[var(--text-secondary)]">{timeStr}</span>
            {note.is_edited && <span className="text-xs text-[var(--text-secondary)]">(edited)</span>}
            <div className="hidden group-hover:flex gap-1 ml-auto">
              <button
                className="text-xs text-[var(--text-secondary)] hover:text-white px-1"
                onClick={() => { setEditContent(note.content); setIsEditing(true); }}
              >
                Edit
              </button>
              <button className="text-xs text-[var(--danger)] hover:text-white px-1" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
          {isEditing ? (
            <div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--border-color)] focus:outline-none focus:border-[var(--text-accent)] resize-none min-h-[80px]"
                autoFocus
              />
              <div className="flex gap-2 mt-1">
                <button className="px-3 py-1 text-sm bg-[var(--text-accent)] text-white rounded hover:bg-[var(--text-accent)]/80" onClick={handleSave}>
                  Save
                </button>
                <button className="px-3 py-1 text-sm text-[var(--text-secondary)] hover:text-white" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--text-primary)] prose prose-invert prose-sm max-w-none">
              {note.content_type === "markdown" ? (
                <ReactMarkdown>{note.content}</ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap">{note.content}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}