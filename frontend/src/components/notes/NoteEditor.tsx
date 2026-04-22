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
    <footer className="px-4 pb-6 flex-shrink-0">
      <div className="bg-[#383a40] rounded-lg flex flex-col">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="p-2 flex items-start gap-3">
          <button type="button" className="w-8 h-8 rounded-full bg-[#383a40] text-[#b5bac1] hover:text-[#dbdee1] flex items-center justify-center">
            <PlusCircle size={24} />
          </button>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Send a note... (Enter to send, Shift+Enter for new line)`}
            className="flex-1 bg-transparent outline-none text-[#dbdee1] text-[15px] resize-none overflow-hidden h-9 leading-9 placeholder-[#949ba4]"
            rows={1}
            style={{ minHeight: "36px", maxHeight: "200px" }}
          />
          <div className="flex gap-3 text-[#b5bac1] mt-1 pr-1 items-center">
            <button type="button" className="hover:text-[#dbdee1]" title="Upload File" onClick={() => alert("File upload placeholder - Feature coming soon.")}>
              <ImageIcon size={20} />
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              className={`hover:text-[#dbdee1] transition-colors ml-1 ${hasContent ? "text-[#5865f2]" : "text-[#b5bac1]"}`}
              title="Send Message"
            >
              <SendHorizontal size={24} />
            </button>
          </div>
        </form>
      </div>
    </footer>
  );
}
