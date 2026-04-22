import { useState, useEffect, useCallback } from "react";
import { X, Sparkles, Check, RefreshCw } from "lucide-react";
import { aiApi } from "../../services";
import type { ClassificationResult } from "../../types";

interface ClassifyModalProps {
  content: string;
  onConfirm: (result: ClassificationResult) => void;
  onClose: () => void;
}

export default function ClassifyModal({ content, onConfirm, onClose }: ClassifyModalProps) {
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editServer, setEditServer] = useState("");
  const [editChannel, setEditChannel] = useState("");

  const classify = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await aiApi.classify(content);
      if (data.data) {
        const r = data.data as ClassificationResult;
        setResult(r);
        setEditServer(r.suggested_server);
        setEditChannel(r.suggested_channel);
      }
    } catch {
      setResult({
        suggested_server: "General",
        suggested_channel: "Notes",
        confidence: 0.3,
        tags: [],
        summary: content.slice(0, 50),
        is_new_server: true,
        is_new_channel: true,
      });
      setEditServer("General");
      setEditChannel("Notes");
    } finally {
      setIsLoading(false);
    }
  }, [content]);

  useEffect(() => {
    classify();
  }, [classify]);

  const handleConfirm = () => {
    if (result) {
      onConfirm({ ...result, suggested_server: editServer, suggested_channel: editChannel });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#313338] w-full max-w-md rounded-xl shadow-2xl border border-[#1e1f22] overflow-hidden animate-zoom-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#1e1f22] flex justify-between items-center">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#5865f2]" /> AI Classification
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-[#5865f2] animate-spin" />
            <span className="ml-3 text-[#949ba4]">Analyzing...</span>
          </div>
        ) : result ? (
          <div className="p-4 space-y-4">
            <div className="bg-[#1e1f22] p-3 rounded-lg border border-[#1e1f22]">
              <div className="text-[11px] font-bold text-[#949ba4] uppercase mb-1">Your Note</div>
              <div className="text-[13px] text-[#dbdee1] line-clamp-3">{content}</div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#949ba4] uppercase mb-1.5">Server</label>
              <input
                type="text"
                value={editServer}
                onChange={(e) => setEditServer(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#1e1f22] focus:border-[#5865f2] text-[14px] outline-none transition-colors"
              />
              {result.is_new_server && (
                <span className="text-[11px] text-[#f23f43] mt-1 block">New server will be created</span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#949ba4] uppercase mb-1.5">Channel</label>
              <input
                type="text"
                value={editChannel}
                onChange={(e) => setEditChannel(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#1e1f22] focus:border-[#5865f2] text-[14px] outline-none transition-colors"
              />
              {result.is_new_channel && (
                <span className="text-[11px] text-[#f23f43] mt-1 block">New channel will be created</span>
              )}
            </div>

            {result.tags.length > 0 && (
              <div>
                <div className="text-[11px] font-bold text-[#949ba4] uppercase mb-1.5">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {result.tags.map((tag, i) => (
                    <span key={i} className="bg-[#5865f2]/20 text-[#5865f2] text-[11px] px-2 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {result.summary && (
              <div>
                <div className="text-[11px] font-bold text-[#949ba4] uppercase mb-1">Summary</div>
                <div className="text-[13px] text-[#949ba4]">{result.summary}</div>
              </div>
            )}

            <div className="flex items-center gap-2 text-[12px]">
              <div className="flex-1 bg-[#1e1f22] rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.round(result.confidence * 100)}%`,
                    backgroundColor: result.confidence >= 0.8 ? "#23a559" : result.confidence >= 0.5 ? "#f59e0b" : "#f23f43",
                  }}
                />
              </div>
              <span className="text-[#949ba4]">{Math.round(result.confidence * 100)}%</span>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:underline">Cancel</button>
              <button
                onClick={handleConfirm}
                className="px-6 py-2 rounded-lg font-bold text-white bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> Confirm
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
