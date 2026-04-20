import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { useNoteStore } from "../../stores";

interface NoteEditorProps {
  channelId: number;
}

export default function NoteEditor({ channelId }: NoteEditorProps) {
  const [content, setContent] = useState("");
  const { createNote } = useNoteStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await createNote({ channel_id: channelId, content: content.trim(), content_type: "markdown" });
    setContent("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  };

  useEffect(() => {
    autoResize();
  }, [content]);

  const hasContent = content.trim().length > 0;

  return (
    <div className="px-4 pb-6 pt-2 shrink-0">
      <div className="flex items-end gap-3 bg-[var(--bg-tertiary)] rounded-lg px-4 py-3">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a note... (Enter to send, Shift+Enter for new line)"
            className="w-full bg-transparent text-[var(--text-primary)] text-[15px] resize-none overflow-hidden leading-relaxed placeholder:text-[var(--text-muted)]"
            rows={1}
            style={{ minHeight: "24px", maxHeight: "200px" }}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!hasContent}
          className={`p-2 rounded-lg transition-colors shrink-0 ${
            hasContent
              ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
              : "text-[var(--text-muted)]"
          }`}
          title="Send"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}