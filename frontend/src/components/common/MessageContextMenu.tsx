import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Pencil,
  Reply,
  Copy,
  Pin,
  PinOff,
  MessageSquareDot,
  Link,
  Volume2,
  Trash2,
} from "lucide-react";

export type MenuAction =
  | "edit"
  | "reply"
  | "copy-text"
  | "pin"
  | "mark-unread"
  | "copy-link"
  | "tts"
  | "delete";

interface MessageContextMenuProps {
  x: number;
  y: number;
  isPinned: boolean;
  onAction: (action: MenuAction) => void;
  onClose: () => void;
}

export default function MessageContextMenu({
  x,
  y,
  isPinned,
  onAction,
  onClose,
}: MessageContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    // Adjust position to keep menu inside viewport
    const el = ref.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      let nx = x;
      let ny = y;
      if (nx + rect.width > window.innerWidth) nx = window.innerWidth - rect.width - 8;
      if (ny + rect.height > window.innerHeight) ny = window.innerHeight - rect.height - 8;
      if (nx < 8) nx = 8;
      if (ny < 8) ny = 8;
      setPos({ x: nx, y: ny });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const items: { action: MenuAction; label: string; icon: React.ReactNode; danger?: boolean }[] = [
    { action: "edit", label: "Edit Message", icon: <Pencil className="w-4 h-4" /> },
    { action: "reply", label: "Reply", icon: <Reply className="w-4 h-4" /> },
    { action: "copy-text", label: "Copy Text", icon: <Copy className="w-4 h-4" /> },
    { action: "pin", label: isPinned ? "Unpin Message" : "Pin Message", icon: isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" /> },
    { action: "mark-unread", label: "Mark Unread", icon: <MessageSquareDot className="w-4 h-4" /> },
    { action: "copy-link", label: "Copy Message Link", icon: <Link className="w-4 h-4" /> },
    { action: "tts", label: "Voice Message", icon: <Volume2 className="w-4 h-4" /> },
    { action: "delete", label: "Delete Message", icon: <Trash2 className="w-4 h-4" />, danger: true },
  ];

  const menu = (
    <div
      ref={ref}
      className="fixed z-[9999] min-w-[180px] rounded-lg shadow-2xl border border-[#1e1f22] bg-[#111214] py-1.5 text-[13px]"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item, idx) => (
        <button
          key={item.action}
          onClick={() => {
            onAction(item.action);
            onClose();
          }}
          className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors
            ${item.danger ? "text-[#f23f43] hover:bg-[#f23f43]/10" : "text-[#dbdee1] hover:bg-[#5865f2] hover:text-white"}
          `}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}
