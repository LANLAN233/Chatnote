import { createPortal } from "react-dom";
import { Copy, FileInput, FolderOpen, Save } from "lucide-react";
import type { ConsoleMessage, Server, Channel } from "../../types";
import ConsoleImportModal from "./ConsoleImportModal";
import QuerySourcesModal from "./QuerySourcesModal";

interface ConsoleModalsProps {
  // Selection toolbar
  showSelectionToolbar: boolean;
  toolbarPosition: { x: number; y: number };
  selectedText: string;
  onCopySelection: () => void;
  onImportSelection: () => void;
  selectionToolbarRef: React.RefObject<HTMLDivElement | null>;

  // Import modal
  importContent: string;
  importServers: Server[];
  importChannels: Channel[];
  onImportClose: () => void;
  onImportServerSelect: (serverId: number) => Promise<void>;

  // Archive dialog
  showArchiveDialog: boolean;
  archiveServers: Server[];
  archiveChannels: Channel[];
  selectedArchiveServer: number | null;
  selectedArchiveChannel: number | null;
  archiveLoading: boolean;
  onArchiveServerSelect: (serverId: number) => void;
  onArchiveChannelSelect: (channelId: number) => void;
  onArchive: () => void;
  onArchiveClose: () => void;

  // Query sources modal
  querySourcesMessage: ConsoleMessage | null;
  onQuerySourcesClose: () => void;
  onNavigateToSource?: (serverName: string, channelName: string) => void;
}

export default function ConsoleModals({
  showSelectionToolbar,
  toolbarPosition,
  selectedText,
  onCopySelection,
  onImportSelection,
  selectionToolbarRef,
  importContent,
  importServers,
  importChannels,
  onImportClose,
  onImportServerSelect,
  showArchiveDialog,
  archiveServers,
  archiveChannels,
  selectedArchiveServer,
  selectedArchiveChannel,
  archiveLoading,
  onArchiveServerSelect,
  onArchiveChannelSelect,
  onArchive,
  onArchiveClose,
  querySourcesMessage,
  onQuerySourcesClose,
  onNavigateToSource,
}: ConsoleModalsProps) {
  return (
    <>
      {/* Floating Selection Toolbar */}
      {showSelectionToolbar && createPortal(
        <div
          ref={selectionToolbarRef}
          data-testid="selection-toolbar"
          className="fixed z-[9999] flex items-center gap-1 bg-[#111214] border border-[#3f4147] rounded-lg shadow-2xl py-1.5 px-2"
          style={{
            left: toolbarPosition.x,
            top: toolbarPosition.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <button
            onClick={onCopySelection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-[#dbdee1] hover:bg-[#5865f2] hover:text-white rounded transition-colors"
          >
            <Copy className="w-4 h-4" />
            <span>复制</span>
          </button>
          <button
            onClick={onImportSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-[#dbdee1] hover:bg-[#5865f2] hover:text-white rounded transition-colors"
          >
            <FileInput className="w-4 h-4" />
            <span>导入到...</span>
          </button>
        </div>,
        document.body
      )}

      {/* Import Modal */}
      {importContent && (
        <ConsoleImportModal
          content={importContent}
          servers={importServers}
          channels={importChannels}
          onClose={onImportClose}
          onServerSelect={onImportServerSelect}
        />
      )}

      {/* Query Sources Modal */}
      {querySourcesMessage?.metadata?.sources && (
        <QuerySourcesModal
          sources={querySourcesMessage.metadata.sources}
          serverName={querySourcesMessage.metadata.server_name}
          channelName={querySourcesMessage.metadata.channel_name}
          onClose={onQuerySourcesClose}
          onNavigate={onNavigateToSource}
        />
      )}

      {/* Archive Dialog */}
      {showArchiveDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#313338] rounded-xl border border-[#1e1f22] shadow-2xl w-[420px] max-w-[90vw] p-6 space-y-5">
            <div className="flex items-center gap-3">
              <FolderOpen size={20} className="text-[#5865f2]" />
              <h3 className="text-white font-bold text-lg">Archive Session</h3>
            </div>
            <p className="text-[#949ba4] text-sm">
              Save this console session as a note in a channel.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#949ba4] uppercase tracking-wider mb-1.5">
                  Server
                </label>
                <select
                  value={selectedArchiveServer || ""}
                  onChange={(e) => onArchiveServerSelect(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm"
                >
                  <option value="">Select a server...</option>
                  {archiveServers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#949ba4] uppercase tracking-wider mb-1.5">
                  Channel
                </label>
                <select
                  value={selectedArchiveChannel || ""}
                  onChange={(e) => onArchiveChannelSelect(Number(e.target.value))}
                  disabled={!selectedArchiveServer || archiveChannels.length === 0}
                  className="w-full px-3 py-2 bg-[#1e1f22] text-white rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-colors text-sm disabled:opacity-40"
                >
                  <option value="">Select a channel...</option>
                  {archiveChannels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={onArchiveClose}
                className="px-4 py-2 text-[#949ba4] hover:text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onArchive}
                disabled={!selectedArchiveChannel || archiveLoading}
                className="px-5 py-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-60 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
              >
                {archiveLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
