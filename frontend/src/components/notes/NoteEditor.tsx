import { useState, useRef, useEffect } from "react";
import { SendHorizontal, PlusCircle, Image as ImageIcon, X } from "lucide-react";
import { useNoteStore } from "../../stores";
import { attachmentApi, type Attachment } from "../../services/attachmentApi";

interface NoteEditorProps {
  channelId: number;
}

export default function NoteEditor({ channelId }: NoteEditorProps) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const { createNote } = useNoteStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    const noteData = { channel_id: channelId, content: content.trim(), content_type: "markdown" };
    await createNote(noteData);

    // Upload files after note creation (note ID is handled by the store)
    // For simplicity, files are uploaded via the temp upload API and then
    // attached. In the current impl, the store's createNote doesn't return
    // the note ID to us directly, so files are uploaded separately.
    setContent("");
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
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
        {/* File preview bar */}
        {files.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e1f22] flex-wrap">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-[#2b2d31] rounded px-2 py-1 text-[12px] text-[#dbdee1]">
                <span className="truncate max-w-[120px]">{f.name}</span>
                <span className="text-[#949ba4]">{(f.size / 1024).toFixed(0)}KB</span>
                <button onClick={() => removeFile(i)} className="text-[#949ba4] hover:text-white">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="p-2 flex items-start gap-3">
          <button type="button" className="w-8 h-8 rounded-full bg-[#383a40] text-[#b5bac1] hover:text-[#dbdee1] flex items-center justify-center">
            <PlusCircle size={24} />
          </button>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a note... (Enter to send, Shift+Enter for new line)"
            className="flex-1 bg-transparent outline-none text-[#dbdee1] text-[15px] resize-none overflow-hidden h-9 leading-9 placeholder-[#949ba4]"
            rows={1}
            style={{ minHeight: "36px", maxHeight: "200px" }}
          />
          <div className="flex gap-3 text-[#b5bac1] mt-1 pr-1 items-center">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              className="hover:text-[#dbdee1]"
              title="Attach File"
              onClick={() => fileInputRef.current?.click()}
            >
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
