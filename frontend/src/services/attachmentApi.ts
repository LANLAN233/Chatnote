import api from "./api";
import { ApiResponse } from "./api";

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
  upload: async (noteId: number, file: File): Promise<Attachment> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<ApiResponse>(`/attachments/upload/${noteId}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data.data;
  },

  getByNoteId: async (noteId: number): Promise<Attachment[]> => {
    const response = await api.get<ApiResponse>(`/attachments/note/${noteId}`);
    return response.data.data || [];
  },

  delete: async (attachmentId: number): Promise<void> => {
    await api.delete<ApiResponse>(`/attachments/${attachmentId}`);
  },
};

export default attachmentApi;
