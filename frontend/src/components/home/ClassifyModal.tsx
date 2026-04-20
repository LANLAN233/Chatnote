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
      onConfirm({
        ...result,
        suggested_server: editServer,
        suggested_channel: editChannel,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[var(--bg-secondary)] rounded-lg p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-lg font-bold text-white">AI Classification</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 text-[var(--accent)] animate-spin" />
            <span className="ml-3 text-[var(--text-muted)]">Analyzing...</span>
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="bg-[var(--bg-deep)] p-3 rounded-lg">
              <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase mb-1">Your Note</div>
              <div className="text-[13px] text-[var(--text-primary)] line-clamp-3">{content}</div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1.5">
                Server
              </label>
              <input
                type="text"
                value={editServer}
                onChange={(e) => setEditServer(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--bg-active)] focus:border-[var(--accent)] text-[14px]"
              />
              {result.is_new_server && (
                <span className="text-[11px] text-[var(--warning)] mt-1 block">New server will be created</span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1.5">
                Channel
              </label>
              <input
                type="text"
                value={editChannel}
                onChange={(e) => setEditChannel(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] text-white rounded border border-[var(--bg-active)] focus:border-[var(--accent)] text-[14px]"
              />
              {result.is_new_channel && (
                <span className="text-[11px] text-[var(--warning)] mt-1 block">New channel will be created</span>
              )}
            </div>

            {result.tags.length > 0 && (
              <div>
                <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1.5">Tags</div>
                <div className="flex flex-wrap gap-1.5">
                  {result.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="bg-[var(--accent)]/20 text-[var(--accent)] text-[11px] px-2 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.summary && (
              <div>
                <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">Summary</div>
                <div className="text-[13px] text-[var(--text-muted)]">{result.summary}</div>
              </div>
            )}

            <div className="flex items-center gap-2 text-[12px]">
              <div className="flex-1 bg-[var(--bg-deep)] rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.round(result.confidence * 100)}%`,
                    backgroundColor:
                      result.confidence >= 0.8
                        ? "var(--success)"
                        : result.confidence >= 0.5
                          ? "var(--warning)"
                          : "var(--danger)",
                  }}
                />
              </div>
              <span className="text-[var(--text-muted)]">
                {Math.round(result.confidence * 100)}% confidence
              </span>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-[var(--text-secondary)] hover:text-white transition-colors text-[14px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-5 py-2 bg-[var(--accent)] text-white rounded font-medium hover:bg-[var(--accent-hover)] transition-colors text-[14px] flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Confirm
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
