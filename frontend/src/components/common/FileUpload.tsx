import { useRef, useState } from "react";
import { Paperclip, X, File, Download } from "lucide-react";
import { useFileUpload } from "../../hooks/useFileUpload";
import { attachmentApi, Attachment } from "../../services/attachmentApi";

interface FileUploadProps {
  noteId: number | null;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  readOnly?: boolean;
}

export function FileUpload({ noteId, attachments, onAttachmentsChange, readOnly = false }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { isUploading, uploadFiles } = useFileUpload(noteId, {
    onUploadSuccess: (attachment) => {
      onAttachmentsChange([...attachments, attachment]);
    },
    onUploadError: (error) => {
      console.error("Upload error:", error);
      alert("文件上传失败: " + error);
    },
  });

  const handleClick = () => {
    if (!readOnly) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newAttachments = await uploadFiles(files);
      if (newAttachments.length > 0) {
        onAttachmentsChange([...attachments, ...newAttachments]);
      }
      e.target.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!readOnly) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (readOnly) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const newAttachments = await uploadFiles(files);
      if (newAttachments.length > 0) {
        onAttachmentsChange([...attachments, ...newAttachments]);
      }
    }
  };

  const handleDelete = async (attachmentId: number) => {
    try {
      await attachmentApi.delete(attachmentId);
      onAttachmentsChange(attachments.filter((a) => a.id !== attachmentId));
    } catch (error) {
      console.error("Delete error:", error);
      alert("删除附件失败");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (fileType: string | null) => {
    if (!fileType) return <File className="w-4 h-4" />;
    if (fileType.startsWith("image/")) return <span className="text-lg">🖼️</span>;
    if (fileType.startsWith("video/")) return <span className="text-lg">🎬</span>;
    if (fileType.startsWith("audio/")) return <span className="text-lg">🎵</span>;
    if (fileType.includes("pdf")) return <span className="text-lg">📄</span>;
    if (fileType.includes("word") || fileType.includes("document")) return <span className="text-lg">📝</span>;
    if (fileType.includes("excel") || fileType.includes("sheet")) return <span className="text-lg">📊</span>;
    return <File className="w-4 h-4" />;
  };

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-4 text-center cursor-pointer
            transition-colors duration-200
            ${isDragging ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"}
            ${isUploading ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <Paperclip className="w-6 h-6 mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isUploading ? "上传中..." : "点击或拖拽文件到此处上传"}
          </p>
          <p className="text-xs text-gray-400 mt-1">支持多种文件类型</p>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg group"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(attachment.file_type)}
                <span className="text-sm truncate" title={attachment.filename}>
                  {attachment.filename}
                </span>
                <span className="text-xs text-gray-400">
                  ({formatFileSize(attachment.file_size)})
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => window.open(`/uploads/${attachment.file_path}`, "_blank")}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  title="下载"
                >
                  <Download className="w-4 h-4" />
                </button>
                {!readOnly && (
                  <button
                    onClick={() => handleDelete(attachment.id)}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded"
                    title="删除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FileUpload;
