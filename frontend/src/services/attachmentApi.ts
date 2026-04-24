import api from "./api";
import type { ApiResponse } from "../types";

export interface Attachment {
  id: number;
  note_id: number;
  filename: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
  created_at: string;
}

export const attachmentApi = {
  uploadTemp: async (file: File): Promise<{ url: string; filename: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<ApiResponse<{ url: string; filename: string }>>("/attachments/temp-upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data.data as { url: string; filename: string };
  },
  upload: async (noteId: number, file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<ApiResponse<Attachment>>(`/attachments/upload/${noteId}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data.data as Attachment;
  },

  getByNoteId: async (noteId: number): Promise<Attachment[]> => {
    const response = await api.get<ApiResponse<Attachment[]>>(`/attachments/note/${noteId}`);
    return (response.data.data as Attachment[]) || [];
  },

  delete: async (attachmentId: number): Promise<void> => {
    await api.delete<ApiResponse<void>>(`/attachments/${attachmentId}`);
  },
};

export default attachmentApi;
