import { Globe } from "lucide-react";

interface UrlPreviewCardProps {
  title: string;
  url: string;
  summary?: string;
  favicon?: string;
}

const MAX_SUMMARY_LENGTH = 200;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

export default function UrlPreviewCard({
  title,
  url,
  summary,
  favicon,
}: UrlPreviewCardProps) {
  const displayTitle = title || url;
  const displaySummary = summary ? truncate(summary, MAX_SUMMARY_LENGTH) : undefined;

  return (
    <div
      data-testid="url-preview-card"
      className="bg-[#1e1f22] border border-[#2b2d31] rounded-lg p-3 space-y-2"
    >
      {/* Title row: favicon + clickable link */}
      <div className="flex items-center gap-2 min-w-0">
        {favicon ? (
          <img
            src={favicon}
            alt=""
            className="w-4 h-4 shrink-0 rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Globe size={16} className="text-[#949ba4] shrink-0" />
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#58a6ff] hover:text-[#79c0ff] underline truncate text-sm font-medium transition-colors"
          data-testid="url-preview-link"
        >
          {displayTitle}
        </a>
      </div>

      {/* Summary */}
      {displaySummary && (
        <p
          data-testid="url-preview-summary"
          className="text-[#949ba4] text-xs leading-relaxed break-words"
        >
          {displaySummary}
        </p>
      )}

      {/* URL display */}
      <p className="text-[10px] text-[#4f545c] truncate">{url}</p>
    </div>
  );
}
