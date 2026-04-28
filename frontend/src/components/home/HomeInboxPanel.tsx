import { useState, useEffect, useCallback } from "react";
import {
  Inbox,
  Trash2,
  Sparkles,
  Archive,
  Hash,
  Clock,
  Loader2,
  CheckSquare,
  Square,
  FolderPlus,
  ChevronDown,
  X,
  Pencil,
} from "lucide-react";
import { inboxApi, serverApi, channelApi } from "../../services";
import { useServerStore, useChannelStore } from "../../stores";
import type { InboxItem as InboxItemType, Server, Channel } from "../../types";

export default function HomeInboxPanel() {
  const [items, setItems] = useState<InboxItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoadingId, setAiLoadingId] = useState<number | null>(null);
  const [archiveLoadingId, setArchiveLoadingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAiLoading, setBulkAiLoading] = useState(false);
  const [bulkArchiveLoading, setBulkArchiveLoading] = useState(false);

  // Archive dialog state
  const [archiveItemId, setArchiveItemId] = useState<number | null>(null);
  const [archiveMode, setArchiveMode] = useState<"existing" | "new">("existing");
  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [newServerName, setNewServerName] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editLoadingId, setEditLoadingId] = useState<number | null>(null);

  const { fetchServers } = useServerStore();
  const allServers = useServerStore((s) => s.servers);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await inboxApi.list("pending");
      if (data.data) setItems(data.data as InboxItemType[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    setServers(allServers);
  }, [allServers]);

  const loadChannels = async (serverId: number) => {
    try {
      const { data } = await channelApi.list(serverId);
      if (data.data) setChannels(data.data as Channel[]);
    } catch {
      setChannels([]);
    }
  };

  const openArchiveDialog = (itemId: number) => {
    setArchiveItemId(itemId);
    setArchiveMode("existing");
    setSelectedServerId(null);
    setSelectedChannelId(null);
    setNewServerName("");
    setNewChannelName("");
    setChannels([]);
    setArchiveDialogOpen(true);
    fetchServers();
  };

  const closeArchiveDialog = () => {
    setArchiveDialogOpen(false);
    setArchiveItemId(null);
  };

  const handleArchive = async () => {
    if (!archiveItemId) return;
    setArchiveLoadingId(archiveItemId);
    try {
      const req: { server_id?: number; channel_id?: number; create_server_name?: string; create_channel_name?: string } = {};
      if (archiveMode === "existing") {
        if (!selectedServerId || !selectedChannelId) {
          alert("请选择伺服器和频道");
          return;
        }
        req.server_id = selectedServerId;
        req.channel_id = selectedChannelId;
      } else {
        if (!newServerName.trim()) {
          alert("请输入伺服器名称");
          return;
        }
        req.create_server_name = newServerName.trim();
        if (newChannelName.trim()) {
          req.create_channel_name = newChannelName.trim();
        }
      }
      await inboxApi.archive(archiveItemId, req);
      setItems((prev) => prev.filter((i) => i.id !== archiveItemId));
      closeArchiveDialog();
    } catch {
      // silent
    } finally {
      setArchiveLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this item?")) return;
    try {
      await inboxApi.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      // silent
    }
  };

  const handleAiSuggest = async (item: InboxItemType) => {
    setAiLoadingId(item.id);
    try {
      const { data } = await inboxApi.aiSuggest(item.id);
      if (data.data) {
        const updated = data.data as InboxItemType;
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      }
    } catch {
      // silent
    } finally {
      setAiLoadingId(null);
    }
  };

  const startEdit = (item: InboxItemType) => {
    setEditingId(item.id);
    setEditContent(item.content);
  };

  const handleEditSave = async (id: number) => {
    if (!editContent.trim()) return;
    setEditLoadingId(id);
    try {
      const { data } = await inboxApi.update(id, { content: editContent.trim() });
      if (data.data) {
        const updated = data.data as InboxItemType;
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      }
      setEditingId(null);
      setEditContent("");
    } catch {
      // silent
    } finally {
      setEditLoadingId(null);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditContent("");
  };

  // Bulk operations
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} items?`)) return;
    for (const id of selectedIds) {
      try {
        await inboxApi.delete(id);
      } catch {}
    }
    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
  };

  const handleBulkAiSuggest = async () => {
    setBulkAiLoading(true);
    for (const id of selectedIds) {
      try {
        const { data } = await inboxApi.aiSuggest(id);
        if (data.data) {
          const updated = data.data as InboxItemType;
          setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        }
      } catch {}
    }
    setBulkAiLoading(false);
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    // For bulk archive, we need a target. Open dialog for first selected or use a simple approach.
    // Simplification: bulk archive uses the first item's AI suggestion if available,
    // otherwise prompt user to select a target server/channel.
    const firstId = Array.from(selectedIds)[0];
    openArchiveDialog(firstId);
    setBulkArchiveLoading(true);
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="flex-1 bg-[#313338] flex flex-col h-full overflow-hidden relative">
      {/* Header */}
      <header className="h-12 bg-[#2b2d31] border-b border-[#1e1f22] px-4 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <Inbox size={18} className="text-[#5865F2]" />
          <h2 className="font-bold text-white text-[14px]">待分类笔记</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={selectAll}
            className="text-[#949ba4] hover:text-white text-xs font-bold flex items-center gap-1 transition-colors"
          >
            {selectedIds.size === items.length && items.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
            全选
          </button>
          <span className="text-[#949ba4] text-xs font-bold">
            {items.length} pending
          </span>
        </div>
      </header>

      {/* Bulk Toolbar */}
      {hasSelection && (
        <div className="bg-[#232428] border-b border-[#1e1f22] px-4 py-2 flex items-center gap-3 flex-shrink-0">
          <span className="text-white text-xs font-bold">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkAiSuggest}
            disabled={bulkAiLoading}
            className="flex items-center gap-1 text-xs font-bold text-[#5865f2] hover:text-[#4752c4] px-2 py-1 rounded hover:bg-[#5865f2]/10 transition-colors"
          >
            {bulkAiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            批量 AI 分类
          </button>
          <button
            onClick={() => {
              const firstId = Array.from(selectedIds)[0];
              openArchiveDialog(firstId);
            }}
            className="flex items-center gap-1 text-xs font-bold text-[#23a559] hover:text-[#1a7f44] px-2 py-1 rounded hover:bg-[#23a559]/10 transition-colors"
          >
            <Archive size={12} /> 批量归档
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1 text-xs font-bold text-[#f23f43] hover:text-[#c53236] px-2 py-1 rounded hover:bg-[#f23f43]/10 transition-colors"
          >
            <Trash2 size={12} /> 批量删除
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12 text-[#949ba4]">
            <Loader2 size={24} className="animate-spin mr-2" /> Loading...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-[#949ba4]">
            <Inbox size={48} className="mb-4 opacity-20" />
            <p className="text-sm italic">Inbox is empty. Capture thoughts from the overview page!</p>
          </div>
        )}

        {items.map((item) => {
          const isSelected = selectedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`bg-[#2b2d31] rounded-xl border p-5 transition-colors ${
                isSelected ? "border-[#5865f2]/50" : "border-[#1e1f22] hover:border-[#5865f2]/30"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleSelect(item.id)}
                  className="mt-0.5 text-[#949ba4] hover:text-white transition-colors"
                >
                  {isSelected ? <CheckSquare size={16} className="text-[#5865f2]" /> : <Square size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  {editingId === item.id ? (
                    <div className="mb-3">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={4}
                        className="w-full bg-[#1e1f22] text-[#dbdee1] text-sm p-3 rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] transition-all resize-none placeholder-[#949ba4]"
                      />
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <button
                          onClick={handleEditCancel}
                          className="text-xs font-bold text-[#949ba4] hover:text-white px-3 py-1.5 rounded transition-colors"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => handleEditSave(item.id)}
                          disabled={!editContent.trim() || editLoadingId === item.id}
                          className="flex items-center gap-1 text-xs font-bold text-white bg-[#5865f2] hover:bg-[#4752c4] px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                        >
                          {editLoadingId === item.id ? <Loader2 size={12} className="animate-spin" /> : null}
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[#dbdee1] text-sm leading-relaxed mb-3 whitespace-pre-wrap">
                      {item.content}
                    </p>
                  )}

                  {/* AI Suggestion */}
                  {(item.ai_suggested_server || item.ai_summary) && (
                    <div className="bg-[#1e1f22] rounded-lg p-3 mb-3 space-y-1">
                      <div className="flex items-center gap-2 text-[#5865f2] text-xs font-bold">
                        <Sparkles size={12} /> AI Suggestion
                      </div>
                      {item.ai_suggested_server && (
                        <div className="flex items-center gap-2 text-xs text-[#949ba4]">
                          <Hash size={12} />
                          <span className="text-[#dbdee1] font-medium">
                            @{item.ai_suggested_server}
                            {item.ai_suggested_channel ? ` #${item.ai_suggested_channel}` : ""}
                          </span>
                          {item.ai_confidence !== null && (
                            <span className="text-[10px] bg-[#5865f2]/20 text-[#5865f2] px-1.5 py-0.5 rounded">
                              {(item.ai_confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}
                      {item.ai_summary && (
                        <p className="text-[#949ba4] text-xs">{item.ai_summary}</p>
                      )}
                      {item.ai_tags && (
                        <div className="flex flex-wrap gap-1">
                          {(() => {
                            try {
                              const tags = JSON.parse(item.ai_tags);
                              return tags.map((t: string) => (
                                <span key={t} className="text-[10px] bg-[#3f4147] text-[#b5bac1] px-2 py-0.5 rounded-full">
                                  {t}
                                </span>
                              ));
                            } catch {
                              return null;
                            }
                          })()}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] text-[#949ba4]">
                      <Clock size={10} />
                      {formatDate(item.created_at)}
                    </div>
                    <div className="flex items-center gap-2">
                      {editingId !== item.id && (
                        <button
                          onClick={() => startEdit(item)}
                          className="flex items-center gap-1 text-xs font-bold text-[#949ba4] hover:text-white transition-colors px-2 py-1 rounded hover:bg-[#3f4147]"
                        >
                          <Pencil size={12} /> 编辑
                        </button>
                      )}
                      {!item.ai_suggested_server && editingId !== item.id && (
                        <button
                          onClick={() => handleAiSuggest(item)}
                          disabled={aiLoadingId === item.id}
                          className="flex items-center gap-1 text-xs font-bold text-[#5865f2] hover:text-[#4752c4] transition-colors px-2 py-1 rounded hover:bg-[#5865f2]/10"
                        >
                          {aiLoadingId === item.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          AI 建议
                        </button>
                      )}
                      <button
                        onClick={() => openArchiveDialog(item.id)}
                        disabled={archiveLoadingId === item.id || editingId === item.id}
                        className="flex items-center gap-1 text-xs font-bold text-[#23a559] hover:text-[#1a7f44] transition-colors px-2 py-1 rounded hover:bg-[#23a559]/10 disabled:opacity-50"
                      >
                        {archiveLoadingId === item.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Archive size={12} />
                        )}
                        归档
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={editingId === item.id}
                        className="text-[#949ba4] hover:text-[#f23f43] transition-colors p-1.5 rounded hover:bg-[#f23f43]/10 disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </main>

      {/* Archive Dialog */}
      {archiveDialogOpen && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2b2d31] rounded-2xl border border-[#1e1f22] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1f22]">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Archive size={16} className="text-[#23a559]" /> 归档笔记
              </h3>
              <button onClick={closeArchiveDialog} className="text-[#949ba4] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex bg-[#1e1f22] rounded-lg p-0.5">
                <button
                  onClick={() => setArchiveMode("existing")}
                  className={`flex-1 text-xs font-bold py-2 rounded-md transition-all ${
                    archiveMode === "existing" ? "bg-[#5865f2] text-white" : "text-[#949ba4] hover:text-white"
                  }`}
                >
                  归档到现有
                </button>
                <button
                  onClick={() => setArchiveMode("new")}
                  className={`flex-1 text-xs font-bold py-2 rounded-md transition-all ${
                    archiveMode === "new" ? "bg-[#5865f2] text-white" : "text-[#949ba4] hover:text-white"
                  }`}
                >
                  <FolderPlus size={12} className="inline mr-1" /> 新建伺服器
                </button>
              </div>

              {archiveMode === "existing" ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-[#949ba4] mb-1 font-bold">伺服器</label>
                    <select
                      value={selectedServerId ?? ""}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        setSelectedServerId(id || null);
                        setSelectedChannelId(null);
                        if (id) loadChannels(id);
                      }}
                      className="w-full bg-[#1e1f22] text-white text-sm px-3 py-2 rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2]"
                    >
                      <option value="">选择伺服器...</option>
                      {servers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#949ba4] mb-1 font-bold">频道</label>
                    <select
                      value={selectedChannelId ?? ""}
                      onChange={(e) => setSelectedChannelId(Number(e.target.value) || null)}
                      disabled={!selectedServerId}
                      className="w-full bg-[#1e1f22] text-white text-sm px-3 py-2 rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2] disabled:opacity-50"
                    >
                      <option value="">选择频道...</option>
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-[#949ba4] mb-1 font-bold">新伺服器名称</label>
                    <input
                      type="text"
                      value={newServerName}
                      onChange={(e) => setNewServerName(e.target.value)}
                      placeholder="例如：高等数学"
                      className="w-full bg-[#1e1f22] text-white text-sm px-3 py-2 rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#949ba4] mb-1 font-bold">新频道名称（可选）</label>
                    <input
                      type="text"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="例如：第三章 极限（留空则自动创建 General）"
                      className="w-full bg-[#1e1f22] text-white text-sm px-3 py-2 rounded-lg border border-[#3f4147] outline-none focus:border-[#5865f2]"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeArchiveDialog}
                  className="flex-1 py-2.5 bg-[#3f4147] text-white rounded-lg font-bold text-xs hover:bg-[#4f545c] transition-all"
                >
                  取消
                </button>
                <button
                  onClick={handleArchive}
                  disabled={archiveLoadingId !== null}
                  className="flex-1 py-2.5 bg-[#23a559] text-white rounded-lg font-bold text-xs hover:bg-[#1a7f44] transition-all disabled:opacity-50"
                >
                  {archiveLoadingId !== null ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                  确认归档
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
