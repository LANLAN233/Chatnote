import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Upload,
  Download,
  Trash2,
  Image,
  FileText,
  Table2,
  Code,
  File,
  Filter,
  Search,
} from "lucide-react";
import { serverFileApi } from "../../services";
import type { ServerFile } from "../../types";

interface ServerFilesModalProps {
  serverId: number;
  serverName: string;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "All Files",
  image: "Images",
  spreadsheet: "Spreadsheets",
  code: "Code",
  document: "Documents",
  other: "Other",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileIcon(category: string) {
  switch (category) {
    case "image":
      return <Image size={20} className="text-[#23a559]" />;
    case "code":
      return <Code size={20} className="text-[#5865f2]" />;
    case "spreadsheet":
      return <Table2 size={20} className="text-[#22c55e]" />;
    case "document":
      return <FileText size={20} className="text-[#5865f2]" />;
    default:
      return <File size={20} className="text-[#949ba4]" />;
  }
}

export default function ServerFilesModal({ serverId, serverName, onClose }: ServerFilesModalProps) {
  const [files, setFiles] = useState<ServerFile[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const cat = category === "all" ? undefined : category;
      const { data } = await serverFileApi.list(serverId, cat);
      setFiles(data.data?.files || []);
    } catch (err) {
      console.error("Failed to fetch files:", err);
    } finally {
      setIsLoading(false);
    }
  }, [serverId, category]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async (uploadFiles: FileList | null) => {
    if (!uploadFiles || uploadFiles.length === 0) return;
    setIsUploading(true);
    for (let i = 0; i < uploadFiles.length; i++) {
      try {
        await serverFileApi.upload(serverId, uploadFiles[i]);
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    setIsUploading(false);
    await fetchFiles();
  };

  const handleDelete = async (fileId: number) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      await serverFileApi.delete(serverId, fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleDownload = (file: ServerFile) => {
    window.open(file.url, "_blank");
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  const filteredFiles = files.filter((f) =>
    f.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-[#2b2d31] rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-[#1e1f22]"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1f22]">
          <div>
            <h2 className="text-lg font-bold text-white">Resources</h2>
            <p className="text-[12px] text-[#949ba4]">{serverName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#949ba4] hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Drag overlay */}
        {isDragging && (
          <div className="mx-4 mt-4 border-2 border-dashed border-[#5865f2] bg-[#5865f2]/10 rounded-lg p-6 text-center">
            <Upload size={32} className="mx-auto text-[#5865f2] mb-2" />
            <p className="text-[#5865f2] font-medium">Drop files here to upload</p>
          </div>
        )}

        {/* Toolbar */}
        <div className="px-6 py-3 flex items-center gap-3 border-b border-[#1e1f22]">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#949ba4]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full bg-[#1e1f22] text-[#dbdee1] text-[13px] rounded pl-8 pr-3 py-1.5 outline-none placeholder-[#949ba4]"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-[#949ba4]" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[#1e1f22] text-[#dbdee1] text-[13px] rounded px-2 py-1.5 outline-none border border-[#1e1f22]"
            >
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 bg-[#5865f2] hover:bg-[#4752c4] text-white text-[13px] font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            <Upload size={14} />
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {isLoading ? (
            <div className="text-center py-12 text-[#949ba4] text-[13px]">Loading...</div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-12 text-[#949ba4] text-[13px]">
              {searchQuery ? "No matching files" : "No files yet. Upload or drag files here."}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 bg-[#232428] hover:bg-[#2b2d31] border border-[#1e1f22] rounded-lg px-3 py-2.5 group transition-colors"
                >
                  <div className="shrink-0">{getFileIcon(file.file_category)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#dbdee1] truncate">{file.filename}</p>
                    <p className="text-[11px] text-[#949ba4]">
                      {formatSize(file.file_size)} · {file.file_category}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleDownload(file)}
                      className="p-1.5 text-[#949ba4] hover:text-white hover:bg-[#3f4147] rounded transition-colors"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-1.5 text-[#949ba4] hover:text-[#f23f43] hover:bg-[#f23f43]/10 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1e1f22] text-[11px] text-[#949ba4]">
          {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
