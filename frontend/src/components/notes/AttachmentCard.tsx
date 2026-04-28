import { FileText, Image, Table2, Code, File } from "lucide-react";
import type { Attachment } from "../../types";

interface AttachmentCardProps {
  attachments: Attachment[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getCategory(mimeType: string | null): "image" | "code" | "spreadsheet" | "document" | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return "spreadsheet";
  const ext = mimeType.split(".").pop() || "";
  if (["py", "ts", "tsx", "js", "jsx", "json", "css", "html", "xml", "yaml", "yml", "sql", "sh"].includes(ext)) return "code";
  if (mimeType.startsWith("text/") || mimeType === "application/pdf") return "document";
  return "other";
}

function getFileIcon(category: string) {
  switch (category) {
    case "image": return <Image size={18} className="text-[#23a559]" />;
    case "code": return <Code size={18} className="text-[#5865f2]" />;
    case "spreadsheet": return <Table2 size={18} className="text-[#22c55e]" />;
    case "document": return <FileText size={18} className="text-[#5865f2]" />;
    default: return <File size={18} className="text-[#949ba4]" />;
  }
}

export default function AttachmentCard({ attachments }: AttachmentCardProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((att) => {
        const cat = getCategory(att.file_type);
        const downloadUrl = `/api/attachments/note/${att.note_id}`;

        return (
          <div
            key={att.id}
            className="bg-[#2b2d31] border border-[#1e1f22] rounded-lg overflow-hidden max-w-md hover:border-[#3f4147] transition-colors"
          >
            {/* Preview area */}
            {cat === "image" && (
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="block">
                <div className="max-h-48 overflow-hidden bg-[#1e1f22] flex items-center justify-center">
                  <img
                    src={downloadUrl}
                    alt={att.filename}
                    className="max-h-48 object-contain"
                    loading="lazy"
                  />
                </div>
              </a>
            )}
            {cat === "code" && (
              <div className="bg-[#1a1b1e] p-3 max-h-[140px] overflow-hidden text-[12px] font-mono text-[#949ba4] leading-relaxed">
                <div className="text-[10px] text-[#5865f2] mb-1 uppercase tracking-wider">{att.filename.split(".").pop() || "code"}</div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-[#4f545c] w-6 text-right select-none shrink-0">{i + 1}</span>
                    <span className="text-[#7c8a9b]">··</span>
                  </div>
                ))}
              </div>
            )}
            {cat === "document" && (
              <div className="bg-[#1a1b1e] p-3 max-h-[140px] overflow-hidden text-[12px] text-[#949ba4] leading-relaxed">
                <span className="text-[10px] text-[#5865f2] uppercase tracking-wider">Preview</span>
                <p className="mt-1 text-[#7c8a9b]">File preview not available for this type</p>
              </div>
            )}
            {cat === "spreadsheet" && (
              <div className="bg-[#1a1b1e] p-3 max-h-[140px] overflow-hidden text-[12px]">
                <div className="text-[10px] text-[#22c55e] mb-1 uppercase tracking-wider">Spreadsheet</div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#3f4147] text-[#5865f2]">
                      <th className="p-1 pr-3">A</th>
                      <th className="p-1 pr-3">B</th>
                      <th className="p-1 pr-3">C</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 3 }).map((_, ri) => (
                      <tr key={ri} className="border-b border-[#1e1f22] text-[#949ba4]">
                        <td className="p-1 pr-3">—</td>
                        <td className="p-1 pr-3">—</td>
                        <td className="p-1 pr-3">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {cat === "other" && (
              <div className="bg-[#1a1b1e] p-3 max-h-[140px] overflow-hidden flex items-center justify-center">
                <div className="text-center text-[#949ba4]">
                  <File size={32} className="mx-auto mb-2 opacity-30" />
                  <span className="text-[11px]">Preview not available</span>
                </div>
              </div>
            )}

            {/* File info bar (name at bottom) */}
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 hover:bg-[#35373c] transition-colors group/file"
            >
              {getFileIcon(cat)}
              <span className="text-[13px] text-[#dbdee1] group-hover/file:text-white truncate flex-1">
                {att.filename}
              </span>
              <span className="text-[11px] text-[#949ba4] shrink-0">{formatSize(att.file_size)}</span>
            </a>
          </div>
        );
      })}
    </div>
  );
}
