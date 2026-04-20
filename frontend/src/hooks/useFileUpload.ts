import { useCallback, useState } from "react";

import type { Attachment } from "../services/attachmentApi";

interface UseFileUploadOptions {
  onUploadSuccess?: (attachment: Attachment) => void;
  onUploadError?: (error: string) => void;
}

export function useFileUpload(noteId: number | null, options: UseFileUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!noteId) {
        options.onUploadError?.("No note selected");
        return null;
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const token = localStorage.getItem("token");
        const response = await fetch(`/api/attachments/upload/${noteId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const result = await response.json();
        options.onUploadSuccess?.(result.data);
        return result.data;
      } catch (error) {
        options.onUploadError?.(error instanceof Error ? error.message : "Upload failed");
        return null;
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [noteId, options]
  );

  const uploadFiles = useCallback(
    async (files: FileList) => {
      const results = [];
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
        const result = await uploadFile(files[i]);
        if (result) {
          results.push(result);
        }
      }
      return results;
    },
    [uploadFile]
  );

  return {
    isUploading,
    uploadProgress,
    uploadFile,
    uploadFiles,
  };
}
