import { useEffect } from "react";
import { useServerStore } from "../../stores";

export default function HomePage() {
  const { servers, currentServerId } = useServerStore();
  const currentServer = servers.find((s) => s.id === currentServerId);

  useEffect(() => {}, [currentServerId]);

  if (!currentServerId || !currentServer) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to ChatNote</h2>
          <p>Select a server from the sidebar to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">{currentServer.name}</h2>
        <p>{currentServer.description || "Select a channel to start taking notes"}</p>
      </div>
    </div>
  );
}