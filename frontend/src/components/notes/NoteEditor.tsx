import { useState, useRef, useEffect } from "react";
import { SendHorizontal, PlusCircle, Image as ImageIcon } from "lucide-react";
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

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [content]);

  const hasContent = content.trim().length > 0;

  return (
    <div className="px-4 pb-6 shrink-0">
      <div className="bg-[var(--bg-tertiary)] rounded-lg flex flex-col">
        <div className="p-2 flex items-start gap-3">
          <button type="button" className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center shrink-0">
            <PlusCircle className="w-6 h-6" />
          </button>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a note... (Enter to send, Shift+Enter for new line)"
            className="flex-1 bg-transparent outline-none text-[var(--text-primary)] text-[15px] resize-none overflow-hidden leading-9 placeholder-[var(--text-muted)]"
            rows={1}
            style={{ minHeight: "36px", maxHeight: "200px" }}
          />
          <div className="flex gap-3 text-[var(--text-secondary)] mt-1 pr-1 items-center shrink-0">
            <button type="button" className="hover:text-[var(--text-primary)]" title="Upload File">
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleSubmit}
              className={`hover:text-[var(--text-primary)] transition-colors ml-1 ${hasContent ? "text-[#5865f2]" : "text-[var(--text-secondary)]"}`}
              title="Send Message"
            >
              <SendHorizontal className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
