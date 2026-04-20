import api from "./api";

export const exportApi = {
  exportMarkdown: async (): Promise<Blob> => {
    const response = await api.get("/export/markdown", {
      responseType: "blob",
    });
    return response.data;
  },

  exportJson: async (): Promise<Blob> => {
    const response = await api.get("/export/json", {
      responseType: "blob",
    });
    return response.data;
  },

  downloadBlob: (blob: Blob, filename: string): void => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default exportApi;
