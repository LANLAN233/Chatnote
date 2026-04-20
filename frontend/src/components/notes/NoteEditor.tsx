import { useState } from "react";
import { useNoteStore } from "../../stores";

interface NoteEditorProps {
  channelId: number;
}

export default function NoteEditor({ channelId }: NoteEditorProps) {
  const [content, setContent] = useState("");
  const { createNote } = useNoteStore();

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await createNote({ channel_id: channelId, content: content.trim(), content_type: "markdown" });
    setContent("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-4 py-3 border-t border-[var(--border-color)] shrink-0">
      <div className="flex gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a note... (Ctrl+Enter to send)"
          className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--border-color)] focus:outline-none focus:border-[var(--text-accent)] resize-none min-h-[44px] max-h-[200px]"
          rows={1}
        />
        <button
          onClick={handleSubmit}
          disabled={!content.trim()}
          className="px-4 py-2 bg-[var(--text-accent)] text-white rounded font-medium hover:bg-[var(--text-accent)]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}