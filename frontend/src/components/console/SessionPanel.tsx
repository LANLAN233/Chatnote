import { Plus, MessageSquare, Check, X, Edit3, Trash2, Save, ArrowLeft } from "lucide-react";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { ConsoleSession } from "../../types";

interface SessionPanelProps {
  sessions: ConsoleSession[];
  currentSessionId: number | null;
  editingSessionId: number | null;
  editingTitle: string;
  sidebarCollapsed: boolean;
  isDrawerOpen?: boolean;
  onCloseDrawer?: () => void;
  onSelectSession: (id: number) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: number) => void;
  onArchiveSession: (id: number) => void;
  onStartEditTitle: (session: ConsoleSession) => void;
  onSaveTitle: (id: number) => void;
  onCancelEdit: () => void;
  onEditTitleChange: (value: string) => void;
}

export default function SessionPanel({
  sessions,
  currentSessionId,
  editingSessionId,
  editingTitle,
  sidebarCollapsed,
  isDrawerOpen,
  onCloseDrawer,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onArchiveSession,
  onStartEditTitle,
  onSaveTitle,
  onCancelEdit,
  onEditTitleChange,
}: SessionPanelProps) {
  const isMobile = useIsMobile();

  const handleSelectSession = (id: number) => {
    onSelectSession(id);
    if (isMobile && onCloseDrawer) {
      onCloseDrawer();
    }
  };

  const sessionList = (
    <>
      <div className="p-3 border-b border-[#1e1f22]">
        <button
          onClick={onCreateSession}
          className="w-full flex items-center justify-center gap-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
        >
          <Plus size={16} /> New Session
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => {
          const isActive = session.id === currentSessionId;
          const isEditing = editingSessionId === session.id;
          return (
            <div
              key={session.id}
              onClick={() => handleSelectSession(session.id)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? "bg-[#5865f2]/20 text-white"
                  : "text-[#949ba4] hover:bg-[#35373c] hover:text-gray-300"
              }`}
            >
              <MessageSquare size={14} className="shrink-0" />
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={editingTitle}
                      onChange={(e) => onEditTitleChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSaveTitle(session.id);
                        if (e.key === "Escape") onCancelEdit();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-[#1e1f22] text-white text-xs px-1 py-0.5 rounded outline-none border border-[#5865f2]"
                      autoFocus
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSaveTitle(session.id);
                      }}
                      className="text-green-400 hover:text-green-300"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelEdit();
                      }}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate">
                      {session.title}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchiveSession(session.id);
                        }}
                        className="text-[#949ba4] hover:text-[#23a559]"
                        title="Archive to channel"
                      >
                        <Save size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartEditTitle(session);
                        }}
                        className="text-[#949ba4] hover:text-white"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(session.id);
                        }}
                        className="text-[#949ba4] hover:text-red-400"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )}
                <span className="text-[10px] text-gray-500">
                  {new Date(session.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          );
        })}
        {sessions.length === 0 && (
          <div className="text-center text-gray-600 text-xs py-4">
            No sessions yet.
            <br />
            Click "New Session" to start.
          </div>
        )}
      </div>
    </>
  );

  // Mobile drawer mode
  if (isMobile) {
    if (!isDrawerOpen) return null;

    return (
      <>
        <div
          className="fixed inset-0 bg-black/30 z-30 transition-opacity duration-300"
          onClick={onCloseDrawer}
        />
        <div className="fixed left-0 top-0 h-full w-[280px] bg-[#2b2d31] border-r border-[#1e1f22] flex flex-col z-40 transform transition-transform duration-300 ease-in-out translate-x-0">
          <div className="h-12 px-4 flex items-center justify-between border-b border-[#1e1f22] flex-shrink-0">
            <h2 className="text-white font-bold text-sm">Sessions</h2>
            <button
              onClick={onCloseDrawer}
              className="text-[#949ba4] hover:text-white transition-colors"
              title="Close"
            >
              <ArrowLeft size={20} />
            </button>
          </div>
          {sessionList}
        </div>
      </>
    );
  }

  // Desktop sidebar mode
  if (sidebarCollapsed) return null;

  return (
    <aside className="w-64 bg-[#2b2d31] border-r border-[#1e1f22] flex flex-col flex-shrink-0">
      {sessionList}
    </aside>
  );
}
