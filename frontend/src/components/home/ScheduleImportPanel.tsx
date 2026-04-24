import { useState, useRef } from "react";
import { Upload, Sparkles, Check, Trash2, Plus, Folder, Hash, Calendar, Lightbulb, ChevronDown, ChevronRight, AlertCircle, Pencil, X, Clock } from "lucide-react";
import { aiApi, serverApi, channelApi, noteApi, scheduleApi as scheduleService, attachmentApi } from "../../services";
import { useServerStore } from "../../stores";
import type { ScheduleImportResult, ScheduleImportSuggestion } from "../../types";

interface EditableNote {
  content: string;
}

interface EditableChannel {
  id: string;
  name: string;
  notes: EditableNote[];
}

interface EditableServer {
  id: string;
  name: string;
  channels: EditableChannel[];
}

interface EditableSchedule {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  day_of_week: number | null;
  repeat_rule: string | null;
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function ScheduleImportPanel() {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [servers, setServers] = useState<EditableServer[]>([]);
  const [schedules, setSchedules] = useState<EditableSchedule[]>([]);
  const [suggestions, setSuggestions] = useState<ScheduleImportSuggestion[]>([]);
  const [hasResult, setHasResult] = useState(false);
  const [error, setError] = useState("");
  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});
  const [selectedServers, setSelectedServers] = useState<Record<string, boolean>>({});
  const [selectedChannels, setSelectedChannels] = useState<Record<string, boolean>>({});
  const [selectedSchedules, setSelectedSchedules] = useState<Record<string, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState({ servers: 0, channels: 0, notes: 0, schedules: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { fetchServers } = useServerStore();

  // Editing states
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [editingServerName, setEditingServerName] = useState("");
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }
    setImageFile(file);
    setError("");
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
      setError("");
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleParse = async () => {
    if (!text.trim() && !imageFile) {
      setError("请输入文字描述或上传图片");
      return;
    }
    setIsParsing(true);
    setError("");
    try {
      let uploadUrl: string | undefined;
      if (imageFile) {
        try {
          const uploadRes = await attachmentApi.uploadTemp(imageFile);
          uploadUrl = uploadRes.url;
        } catch {
          setError("图片上传失败");
          setIsParsing(false);
          return;
        }
      }

      const res = await aiApi.importSchedule(text.trim() || undefined, uploadUrl);
      const data = res.data.data as ScheduleImportResult;

      const srvs: EditableServer[] = (data.servers || []).map((s) => ({
        id: genId(),
        name: s.name,
        channels: (s.channels || []).map((c) => ({
          id: genId(),
          name: c.name,
          notes: c.notes || [],
        })),
      }));

      const schs: EditableSchedule[] = (data.schedules || []).map((s, idx) => ({
        id: genId(),
        title: s.title || `日程 ${idx + 1}`,
        start_time: s.start_time || "08:00",
        end_time: s.end_time || "09:35",
        day_of_week: s.day_of_week ?? null,
        repeat_rule: s.repeat_rule || null,
      }));

      setServers(srvs);
      setSchedules(schs);
      setSuggestions(data.suggestions || []);
      setHasResult(true);

      const exp: Record<string, boolean> = {};
      const srvSel: Record<string, boolean> = {};
      const chSel: Record<string, boolean> = {};
      srvs.forEach((s) => {
        exp[s.id] = true;
        srvSel[s.id] = true;
        s.channels.forEach((c) => {
          chSel[`${s.id}/${c.id}`] = true;
        });
      });
      const schSel: Record<string, boolean> = {};
      schs.forEach((s) => {
        schSel[s.id] = true;
      });
      setExpandedServers(exp);
      setSelectedServers(srvSel);
      setSelectedChannels(chSel);
      setSelectedSchedules(schSel);
    } catch (e) {
      setError("AI 解析失败，请重试或检查网络");
    } finally {
      setIsParsing(false);
    }
  };

  const toggleServer = (id: string) => {
    setSelectedServers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleChannel = (serverId: string, channelId: string) => {
    const key = `${serverId}/${channelId}`;
    setSelectedChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSchedule = (id: string) => {
    setSelectedSchedules((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateServerName = (serverId: string, name: string) => {
    setServers((prev) => prev.map((s) => (s.id === serverId ? { ...s, name } : s)));
  };

  const deleteServer = (serverId: string) => {
    setServers((prev) => prev.filter((s) => s.id !== serverId));
  };

  const addServer = () => {
    const newServer: EditableServer = { id: genId(), name: "新服务器", channels: [] };
    setServers((prev) => [...prev, newServer]);
    setExpandedServers((prev) => ({ ...prev, [newServer.id]: true }));
    setSelectedServers((prev) => ({ ...prev, [newServer.id]: true }));
  };

  const updateChannelName = (serverId: string, channelId: string, name: string) => {
    setServers((prev) =>
      prev.map((s) =>
        s.id === serverId
          ? { ...s, channels: s.channels.map((c) => (c.id === channelId ? { ...c, name } : c)) }
          : s
      )
    );
  };

  const deleteChannel = (serverId: string, channelId: string) => {
    setServers((prev) =>
      prev.map((s) =>
        s.id === serverId ? { ...s, channels: s.channels.filter((c) => c.id !== channelId) } : s
      )
    );
  };

  const addChannel = (serverId: string) => {
    const newChannel: EditableChannel = { id: genId(), name: "新频道", notes: [] };
    setServers((prev) =>
      prev.map((s) =>
        s.id === serverId ? { ...s, channels: [...s.channels, newChannel] } : s
      )
    );
    setSelectedChannels((prev) => ({ ...prev, [`${serverId}/${newChannel.id}`]: true }));
  };

  const updateScheduleField = (id: string, field: keyof EditableSchedule, value: string | number | null) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const applySuggestion = (suggestion: ScheduleImportSuggestion) => {
    if (suggestion.type === "channel" && suggestion.target_server) {
      const srvIndex = servers.findIndex((s) => s.name === suggestion.target_server);
      if (srvIndex >= 0) {
        const newServers = [...servers];
        const chName = suggestion.message.replace(/建议添加\s*/, "").replace(/\s*频道/, "").replace(/^#/, "");
        newServers[srvIndex].channels.push({ id: genId(), name: chName, notes: [] });
        setServers(newServers);
      }
    }
  };

  const handleCreate = async () => {
    if (!hasResult) return;
    setIsCreating(true);
    let sCount = 0, cCount = 0, nCount = 0, schCount = 0;

    try {
      for (const server of servers) {
        if (!selectedServers[server.id]) continue;
        const srvRes = await serverApi.create({ name: server.name });
        const srvData = srvRes.data.data as { id: number } | undefined;
        const serverId = srvData?.id;
        if (!serverId) continue;
        sCount++;

        for (const channel of server.channels) {
          const chKey = `${server.id}/${channel.id}`;
          if (!selectedChannels[chKey]) continue;
          const chRes = await channelApi.create(serverId, { name: channel.name });
          const chData = chRes.data.data as { id: number } | undefined;
          const channelId = chData?.id;
          if (!channelId) continue;
          cCount++;

          for (const note of channel.notes) {
            await noteApi.create({ channel_id: channelId, content: note.content });
            nCount++;
          }
        }
      }

      for (const sch of schedules) {
        if (!selectedSchedules[sch.id]) continue;
        await scheduleService.createSchedule({
          title: sch.title,
          start_time: sch.start_time,
          end_time: sch.end_time || undefined,
          day_of_week: sch.day_of_week ?? undefined,
          repeat_rule: sch.day_of_week !== null ? '{"type":"weekly"}' : undefined,
          is_all_day: false,
          color: "#5865f2",
        });
        schCount++;
      }

      setCreatedCount({ servers: sCount, channels: cCount, notes: nCount, schedules: schCount });
      await fetchServers();
      setTimeout(() => {
        setHasResult(false);
        setServers([]);
        setSchedules([]);
        setSuggestions([]);
        setText("");
        setImageFile(null);
        setImagePreview(null);
        setCreatedCount({ servers: 0, channels: 0, notes: 0, schedules: 0 });
      }, 3000);
    } catch (e) {
      setError("创建失败，请重试");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex-1 bg-[#313338] flex flex-col h-full overflow-hidden">
      <header className="h-14 bg-[#2b2d31] border-b border-[#1e1f22] px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[#5865f2]" />
          <h2 className="font-bold text-white text-[15px]">日程表导入</h2>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {!hasResult && createdCount.servers === 0 && (
          <>
            <div className="bg-[#2b2d31] rounded-2xl border border-[#1e1f22] p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">文字描述</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="粘贴课程大纲、课表文字或日程描述... 例如：&#10;高等数学I 周一 8:00-9:35&#10;第一章 函数与极限&#10;第二章 导数与微分"
                  className="w-full bg-[#1e1f22] text-[#dbdee1] p-4 rounded-xl border border-[#3f4147] outline-none focus:border-[#5865f2] transition-all resize-none h-40 placeholder-[#949ba4] text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">或上传图片</label>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    imagePreview ? "border-[#5865f2] bg-[#5865f2]/5" : "border-[#3f4147] hover:border-[#5865f2]/50"
                  }`}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg" />
                  ) : (
                    <div className="space-y-2">
                      <Upload size={32} className="mx-auto text-[#949ba4]" />
                      <p className="text-[#949ba4] text-sm">拖拽图片到此处，或点击上传</p>
                      <p className="text-[#6b6f78] text-xs">支持 JPG, PNG 格式</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>
                {imageFile && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-[#949ba4]">{imageFile.name}</span>
                    <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="text-[#f23f43] hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-[#f23f43] text-sm bg-[#f23f43]/10 px-3 py-2 rounded-lg">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <button
                onClick={handleParse}
                disabled={isParsing || (!text.trim() && !imageFile)}
                className="w-full py-3 bg-[#5865f2] text-white rounded-xl font-bold text-sm hover:bg-[#4752c4] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isParsing ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> AI 解析中...</>
                ) : (
                  <><Sparkles size={16} /> AI 解析并生成建议</>
                )}
              </button>
            </div>

            <div className="bg-gradient-to-br from-[#5865f2]/5 to-transparent p-6 rounded-2xl border border-[#5865f2]/10">
              <h4 className="text-white text-sm font-bold mb-2">使用提示</h4>
              <ul className="text-[#949ba4] text-xs space-y-1 list-disc list-inside">
                <li>支持粘贴课程大纲、课表截图或文字描述</li>
                <li>AI 会自动识别学科、章节结构和时间安排</li>
                <li>解析后你可以勾选、编辑要导入的内容</li>
                <li>确认后会自动创建服务器、频道、笔记和日程</li>
              </ul>
            </div>
          </>
        )}

        {hasResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">解析结果预览</h3>
              <button onClick={() => setHasResult(false)} className="text-[#949ba4] text-sm hover:text-white transition-colors">重新导入</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Server/Channel Tree */}
              <div className="bg-[#2b2d31] rounded-2xl border border-[#1e1f22] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder size={18} className="text-[#5865f2]" />
                    <h4 className="text-white font-bold text-sm">将要创建的知识结构</h4>
                  </div>
                  <button
                    onClick={addServer}
                    className="p-1.5 rounded-lg hover:bg-[#35373c] text-[#949ba4] hover:text-white transition-colors"
                    title="添加服务器"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {servers.length === 0 && <p className="text-[#949ba4] text-sm">未识别到知识结构</p>}

                <div className="space-y-2">
                  {servers.map((server) => (
                    <div key={server.id} className="space-y-1">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#35373c] transition-colors group">
                        <button onClick={() => toggleServer(server.id)}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            selectedServers[server.id] ? "bg-[#5865f2] border-[#5865f2]" : "border-[#949ba4]"
                          }`}>
                            {selectedServers[server.id] && <Check size={12} className="text-white" />}
                          </div>
                        </button>
                        <button onClick={() => setExpandedServers((prev) => ({ ...prev, [server.id]: !prev[server.id] }))}>
                          {expandedServers[server.id] ? <ChevronDown size={14} className="text-[#949ba4]" /> : <ChevronRight size={14} className="text-[#949ba4]" />}
                        </button>

                        {editingServerId === server.id ? (
                          <>
                            <input
                              autoFocus
                              value={editingServerName}
                              onChange={(e) => setEditingServerName(e.target.value)}
                              onBlur={() => {
                                if (editingServerName.trim()) updateServerName(server.id, editingServerName.trim());
                                setEditingServerId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (editingServerName.trim()) updateServerName(server.id, editingServerName.trim());
                                  setEditingServerId(null);
                                }
                              }}
                              className="flex-1 bg-[#1e1f22] text-white text-sm px-2 py-1 rounded border border-[#5865f2] outline-none"
                            />
                            <button onClick={() => setEditingServerId(null)} className="text-[#949ba4] hover:text-white">
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-white text-sm font-semibold flex-1">@{server.name}</span>
                            <button
                              onClick={() => { setEditingServerId(server.id); setEditingServerName(server.name); }}
                              className="opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-white transition-opacity"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => deleteServer(server.id)}
                              className="opacity-0 group-hover:opacity-100 text-[#f23f43] hover:text-red-300 transition-opacity"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>

                      {expandedServers[server.id] && (
                        <div className="ml-6 space-y-1">
                          {server.channels.map((channel) => (
                            <div key={channel.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#35373c] transition-colors group">
                              <button onClick={() => toggleChannel(server.id, channel.id)}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                  selectedChannels[`${server.id}/${channel.id}`] ? "bg-[#5865f2] border-[#5865f2]" : "border-[#949ba4]"
                                }`}>
                                  {selectedChannels[`${server.id}/${channel.id}`] && <Check size={12} className="text-white" />}
                                </div>
                              </button>
                              <Hash size={14} className="text-[#80848e]" />

                              {editingChannelId === channel.id ? (
                                <>
                                  <input
                                    autoFocus
                                    value={editingChannelName}
                                    onChange={(e) => setEditingChannelName(e.target.value)}
                                    onBlur={() => {
                                      if (editingChannelName.trim()) updateChannelName(server.id, channel.id, editingChannelName.trim());
                                      setEditingChannelId(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        if (editingChannelName.trim()) updateChannelName(server.id, channel.id, editingChannelName.trim());
                                        setEditingChannelId(null);
                                      }
                                    }}
                                    className="flex-1 bg-[#1e1f22] text-white text-sm px-2 py-0.5 rounded border border-[#5865f2] outline-none"
                                  />
                                  <button onClick={() => setEditingChannelId(null)} className="text-[#949ba4] hover:text-white">
                                    <X size={14} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-[#dbdee1] text-sm flex-1">{channel.name}</span>
                                  {channel.notes.length > 0 && (
                                    <span className="text-[#6b6f78] text-xs">({channel.notes.length} 笔记)</span>
                                  )}
                                  <button
                                    onClick={() => { setEditingChannelId(channel.id); setEditingChannelName(channel.name); }}
                                    className="opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-white transition-opacity"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => deleteChannel(server.id, channel.id)}
                                    className="opacity-0 group-hover:opacity-100 text-[#f23f43] hover:text-red-300 transition-opacity"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                          <button
                            onClick={() => addChannel(server.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#35373c] transition-colors text-[#949ba4] hover:text-white text-sm"
                          >
                            <Plus size={14} /> 添加频道
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Schedules */}
              <div className="bg-[#2b2d31] rounded-2xl border border-[#1e1f22] p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-[#23a559]" />
                  <h4 className="text-white font-bold text-sm">将要创建的日程</h4>
                </div>

                {schedules.length === 0 && <p className="text-[#949ba4] text-sm">未识别到日程</p>}

                <div className="space-y-3">
                  {schedules.map((sch) => (
                    <div
                      key={sch.id}
                      className={`p-3 rounded-xl border transition-colors ${
                        selectedSchedules[sch.id] ? "border-[#5865f2]/50 bg-[#5865f2]/5" : "border-[#1e1f22] bg-[#1e1f22]"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <button onClick={() => toggleSchedule(sch.id)}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            selectedSchedules[sch.id] ? "bg-[#23a559] border-[#23a559]" : "border-[#949ba4]"
                          }`}>
                            {selectedSchedules[sch.id] && <Check size={12} className="text-white" />}
                          </div>
                        </button>
                        <input
                          value={sch.title}
                          onChange={(e) => updateScheduleField(sch.id, "title", e.target.value)}
                          className="flex-1 bg-transparent text-white text-sm font-semibold outline-none border-b border-transparent focus:border-[#5865f2]"
                        />
                        <button onClick={() => setSchedules((prev) => prev.filter((s) => s.id !== sch.id))} className="text-[#f23f43] hover:text-red-300">
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="ml-6 space-y-2">
                        {/* Time range */}
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-[#949ba4] shrink-0" />
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={sch.start_time}
                              onChange={(e) => updateScheduleField(sch.id, "start_time", e.target.value)}
                              className="bg-[#313338] text-[#dbdee1] text-xs px-2 py-1.5 rounded border border-[#3f4147] outline-none focus:border-[#5865f2]"
                            />
                            <span className="text-[#949ba4] text-xs">-</span>
                            <input
                              type="time"
                              value={sch.end_time}
                              onChange={(e) => updateScheduleField(sch.id, "end_time", e.target.value)}
                              className="bg-[#313338] text-[#dbdee1] text-xs px-2 py-1.5 rounded border border-[#3f4147] outline-none focus:border-[#5865f2]"
                            />
                          </div>
                        </div>

                        {/* Day of week */}
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-[#949ba4] shrink-0" />
                          <select
                            value={sch.day_of_week ?? ""}
                            onChange={(e) => updateScheduleField(sch.id, "day_of_week", e.target.value === "" ? null : parseInt(e.target.value))}
                            className="bg-[#313338] text-[#dbdee1] text-xs px-2 py-1.5 rounded border border-[#3f4147] outline-none focus:border-[#5865f2]"
                          >
                            <option value="">选择星期</option>
                            {WEEKDAYS.map((label, idx) => (
                              <option key={idx} value={idx}>{label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    const newSch: EditableSchedule = { id: genId(), title: "新课程", start_time: "08:00", end_time: "09:35", day_of_week: 0, repeat_rule: null };
                    setSchedules((prev) => [...prev, newSch]);
                    setSelectedSchedules((prev) => ({ ...prev, [newSch.id]: true }));
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg hover:bg-[#35373c] transition-colors text-[#949ba4] hover:text-white text-sm border border-dashed border-[#3f4147]"
                >
                  <Plus size={14} /> 添加日程
                </button>
              </div>
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="bg-[#2b2d31] rounded-2xl border border-[#1e1f22] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Lightbulb size={18} className="text-yellow-400" />
                  <h4 className="text-white font-bold text-sm">AI 额外建议</h4>
                </div>
                <div className="space-y-2">
                  {suggestions.map((suggestion, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-[#1e1f22]">
                      <div>
                        <p className="text-[#dbdee1] text-sm">{suggestion.message}</p>
                        {suggestion.target_server && <p className="text-[#949ba4] text-xs">@{suggestion.target_server}</p>}
                      </div>
                      <button
                        onClick={() => applySuggestion(suggestion)}
                        className="px-3 py-1.5 bg-[#5865f2]/20 text-[#5865f2] rounded-lg text-xs font-bold hover:bg-[#5865f2]/30 transition-colors flex items-center gap-1"
                      >
                        <Plus size={12} /> 采纳
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setHasResult(false)} className="px-5 py-2.5 text-[#949ba4] text-sm font-bold hover:text-white transition-colors">取消</button>
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="px-6 py-2.5 bg-[#5865f2] text-white rounded-xl font-bold text-sm hover:bg-[#4752c4] transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isCreating ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 创建中...</>
                ) : (
                  <><Check size={16} /> 确认创建</>
                )}
              </button>
            </div>
          </div>
        )}

        {createdCount.servers > 0 && (
          <div className="bg-[#23a559]/10 border border-[#23a559]/30 rounded-2xl p-8 text-center space-y-2">
            <Check size={32} className="mx-auto text-[#23a559]" />
            <h3 className="text-white font-bold text-lg">导入成功！</h3>
            <p className="text-[#949ba4] text-sm">
              创建了 {createdCount.servers} 个服务器、{createdCount.channels} 个频道、{createdCount.notes} 条笔记、{createdCount.schedules} 个日程
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
