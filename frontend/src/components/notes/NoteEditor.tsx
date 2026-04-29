import { useState, useRef, useEffect, useCallback } from "react";
import { SendHorizontal, PlusCircle, Image as ImageIcon, X, Zap } from "lucide-react";
import { useNoteStore, useServerStore, useChannelStore } from "../../stores";
import { attachmentApi } from "../../services/attachmentApi";
import { channelApi } from "../../services";
import { useMentionAutocomplete } from "../../hooks/useMentionAutocomplete";
import MentionAutocompleteDropdown from "../common/MentionAutocompleteDropdown";
import type { Channel } from "../../types";

interface NoteEditorProps {
  channelId: number;
  aiEnabled?: boolean;
  onToggleAI?: () => void;
}

export default function NoteEditor({ channelId, aiEnabled = true, onToggleAI }: NoteEditorProps) {
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { createNote } = useNoteStore();
  const { servers } = useServerStore();
  const { channels } = useChannelStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  const getSuggestions = useCallback(
    async (filter: string, type: string, text: string): Promise<string[]> => {
      const f = filter.toLowerCase();
      if (type === "server") {
        const items = servers
          .filter((s) => s.name.toLowerCase().includes(f))
          .map((s) => s.name);
        return items.sort((a, b) => {
          const aStarts = a.toLowerCase().startsWith(f);
          const bStarts = b.toLowerCase().startsWith(f);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return a.localeCompare(b);
        });
      }
      if (type === "channel") {
        const serverMatch = text.match(/@([^\s#]+)(?=\s+#|$)/);
        const targetServerName = serverMatch ? serverMatch[1] : null;
        const targetServer = targetServerName
          ? servers.find((s) => s.name.toLowerCase() === targetServerName.toLowerCase())
          : null;
        let items: string[] = [];
        if (targetServer) {
          try {
            const { data } = await channelApi.list(targetServer.id);
            const serverChannels = (data.data as Channel[]) || [];
            items = serverChannels
              .filter((c) => c.name.toLowerCase().includes(f))
              .map((c) => c.name);
          } catch {
            items = [];
          }
        } else {
          // No @Server prefix — suggest channels from current server
          items = channels
            .filter((c) => c.name.toLowerCase().includes(f))
            .map((c) => c.name);
        }
        return items.sort((a, b) => {
          const aStarts = a.toLowerCase().startsWith(f);
          const bStarts = b.toLowerCase().startsWith(f);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return a.localeCompare(b);
        });
      }
      return [];
    },
    [servers, channels]
  );

  const {
    suggestions,
    selectedIndex,
    show,
    type: suggestionType,
    filter,
    handleInputChange,
    handleKeyDown,
    applySuggestion,
  } = useMentionAutocomplete({ value: content, onChange: setContent, getSuggestions });

  const handleSubmit = async () => {
    if (!content.trim() && files.length === 0) return;

    const note = await createNote({
      channel_id: channelId,
      content: content.trim() || " ",
      content_type: "markdown",
      auto_classify: aiEnabled,
    });

    // Upload attachments after note is created
    if (note && files.length > 0) {
      for (const file of files) {
        try {
          await attachmentApi.upload(note.id, file);
        } catch (err) {
          console.error("Failed to upload attachment:", err);
        }
      }
    }

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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const consumed = handleKeyDown(e);
    if (!consumed && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if leaving the footer container itself, not a child
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles]);
    }
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [content]);

  const hasContent = content.trim().length > 0;

  return (
    <footer
      ref={footerRef}
      className="px-4 pb-6 flex-shrink-0"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`bg-[#383a40] rounded-lg flex flex-col transition-colors ${isDragging ? "ring-2 ring-[#5865f2] bg-[#404249]" : ""}`}>
        {/* Drag overlay */}
        {isDragging && (
          <div className="px-3 py-2 border-b border-[#5865f2] text-[#5865f2] text-[13px] font-medium text-center">
            Drop files here to attach
          </div>
        )}

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
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart)}
              onKeyDown={onKeyDown}
              placeholder={aiEnabled ? "Send a note (AI ON – @Server #Channel to cross-post)..." : "Send a note... (Enter to send, Shift+Enter for new line)"}
              className="w-full bg-transparent outline-none text-[#dbdee1] text-[15px] resize-none overflow-hidden h-9 leading-9 placeholder-[#949ba4]"
              rows={1}
              style={{ minHeight: "36px", maxHeight: "200px" }}
            />
            {show && (
              <MentionAutocompleteDropdown
                suggestions={suggestions}
                selectedIndex={selectedIndex}
                type={suggestionType}
                filter={filter}
                onSelect={applySuggestion}
              />
            )}
          </div>
          <div className="flex gap-3 text-[#b5bac1] mt-1 pr-1 items-center">
            {onToggleAI && (
              <label className="flex items-center gap-1 cursor-pointer select-none" title={aiEnabled ? "AI ON" : "AI OFF"}>
                <Zap size={14} className={aiEnabled ? "text-[#5865f2]" : "text-[#949ba4]"} />
                <div className="relative">
                  <input type="checkbox" checked={aiEnabled} onChange={onToggleAI} className="sr-only" />
                  <div className={`block w-7 h-3.5 rounded-full transition-colors ${aiEnabled ? "bg-[#5865f2]" : "bg-[#4f545c]"}`} />
                  <div className={`absolute left-0.5 top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${aiEnabled ? "translate-x-3.5" : "translate-x-0"}`} />
                </div>
              </label>
            )}
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
