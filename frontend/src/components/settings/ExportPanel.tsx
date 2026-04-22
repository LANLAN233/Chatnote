import { useState } from "react";
import { Download, FileJson, FileText, Loader2 } from "lucide-react";
import exportApi from "../../services/exportApi";

export function ExportPanel() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<"markdown" | "json" | null>(null);

  const handleExport = async (type: "markdown" | "json") => {
    setIsExporting(true);
    setExportType(type);

    try {
      const blob = type === "markdown"
        ? await exportApi.exportMarkdown()
        : await exportApi.exportJson();

      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      const filename = `chatnote_export_${type}_${timestamp}.${type === "markdown" ? "zip" : "json"}`;

      exportApi.downloadBlob(blob, filename);
    } catch (error) {
      console.error("Export error:", error);
      alert("导出失败，请重试");
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#949ba4]">
        将您的笔记和日程数据导出为本地文件备份
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => handleExport("markdown")}
          disabled={isExporting}
          className={`
            flex items-center gap-3 p-4 rounded-lg border border-[#1e1f22] bg-[#2b2d31]
            transition-colors duration-200
            ${isExporting && exportType === "markdown"
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-[#35373c]"
            }
          `}
        >
          {isExporting && exportType === "markdown" ? (
            <Loader2 className="w-8 h-8 text-[#5865f2] animate-spin" />
          ) : (
            <FileText className="w-8 h-8 text-[#5865f2]" />
          )}
          <div className="text-left">
            <p className="font-medium text-white">导出为 Markdown</p>
            <p className="text-xs text-[#949ba4]">
              {isExporting && exportType === "markdown" ? "导出中..." : "将笔记导出为 Markdown 文件"}
            </p>
          </div>
        </button>

        <button
          onClick={() => handleExport("json")}
          disabled={isExporting}
          className={`
            flex items-center gap-3 p-4 rounded-lg border border-[#1e1f22] bg-[#2b2d31]
            transition-colors duration-200
            ${isExporting && exportType === "json"
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-[#35373c]"
            }
          `}
        >
          {isExporting && exportType === "json" ? (
            <Loader2 className="w-8 h-8 text-[#23a559] animate-spin" />
          ) : (
            <FileJson className="w-8 h-8 text-[#23a559]" />
          )}
          <div className="text-left">
            <p className="font-medium text-white">导出为 JSON</p>
            <p className="text-xs text-[#949ba4]">
              {isExporting && exportType === "json" ? "导出中..." : "完整数据备份（JSON 格式）"}
            </p>
          </div>
        </button>
      </div>

      <div className="mt-4 p-3 bg-yellow-400/10 border border-yellow-400/20 rounded-lg">
        <p className="text-sm text-yellow-400">
          💡 提示：建议定期导出数据作为备份。Markdown 格式便于在其他工具中查看，JSON 格式包含完整数据可用于恢复。
        </p>
      </div>
    </div>
  );
}

export default ExportPanel;
