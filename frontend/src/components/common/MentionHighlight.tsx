import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useServerStore, useChannelStore } from "../../stores";

interface MentionHighlightProps {
  text: string;
  className?: string;
}

export default function MentionHighlight({ text, className = "" }: MentionHighlightProps) {
  const navigate = useNavigate();
  const servers = useServerStore((s) => s.servers);
  const channels = useChannelStore((s) => s.channels);

  // Build lookup maps
  const serverByName = new Map(servers.map((s) => [s.name.toLowerCase(), s]));
  const channelByName = new Map<string, { id: number; server_id: number }>();
  channels.forEach((c) => channelByName.set(c.name.toLowerCase(), c));

  // Regex matching #ChannelName and @ServerName
  const mentionRegex = /([@#])([\w\u4e00-\u9fff\u3400-\u4dbf-]+)/g;

  const parts: Array<{ type: "text" | "channel" | "server"; content: string; navId?: number; serverId?: number }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }

    const prefix = match[1]; // @ or #
    const name = match[2];

    if (prefix === "#") {
      const ch = channelByName.get(name.toLowerCase());
      if (ch) {
        parts.push({ type: "channel", content: `#${name}`, navId: ch.id, serverId: ch.server_id });
      } else {
        parts.push({ type: "text", content: `#${name}` });
      }
    } else {
      const srv = serverByName.get(name.toLowerCase());
      if (srv) {
        parts.push({ type: "server", content: `@${name}`, navId: srv.id });
      } else {
        parts.push({ type: "text", content: `@${name}` });
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  if (parts.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === "channel") {
          return (
            <span
              key={i}
              className="inline cursor-pointer rounded px-0.5 font-medium transition-colors"
              style={{
                color: "#fff",
                backgroundColor: "rgba(88, 101, 242, 0.30)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#5865f2";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(88, 101, 242, 0.30)";
              }}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/server/${part.serverId}/channel/${part.navId}`);
              }}
              title={`Jump to #${part.content.slice(1)}`}
            >
              {part.content}
            </span>
          );
        }
        if (part.type === "server") {
          return (
            <span
              key={i}
              className="inline cursor-pointer rounded px-0.5 font-medium transition-colors"
              style={{
                color: "#fff",
                backgroundColor: "rgba(124, 58, 237, 0.30)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#7c3aed";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(124, 58, 237, 0.30)";
              }}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/server/${part.navId}`);
              }}
              title={`Jump to @${part.content.slice(1)}`}
            >
              {part.content}
            </span>
          );
        }
        return <Fragment key={i}>{part.content}</Fragment>;
      })}
    </span>
  );
}
