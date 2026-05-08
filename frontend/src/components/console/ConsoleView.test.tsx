import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConsoleView from "./ConsoleView";

Element.prototype.scrollIntoView = vi.fn();

const mockServers = [
  { id: 1, user_id: 1, name: "Server1", icon: null, description: null, sort_order: 0, created_at: "", updated_at: "" },
  { id: 2, user_id: 1, name: "Server2", icon: null, description: null, sort_order: 0, created_at: "", updated_at: "" },
];

const mockChannelsByServer: Record<number, ReturnType<typeof mockChannel>[]> = {
  1: [
    mockChannel(101, 1, "general"),
    mockChannel(102, 1, "random"),
  ],
  2: [
    mockChannel(201, 2, "general"),
    mockChannel(202, 2, "offtopic"),
  ],
};

function mockChannel(id: number, serverId: number, name: string) {
  return { id, server_id: serverId, name, type: "text" as const, description: null, sort_order: 0, created_at: "", updated_at: "" };
}

vi.mock("../../stores", () => ({
  useServerStore: vi.fn().mockImplementation((selector: (state: { servers: typeof mockServers }) => unknown) =>
    selector({ servers: mockServers })
  ),
  useChannelStore: vi.fn().mockImplementation((selector: (state: { channels: never[] }) => unknown) =>
    selector({ channels: [] })
  ),
}));

vi.mock("../../services", () => ({
  consoleApi: {
    execute: vi.fn().mockResolvedValue({ data: { success: true, data: { type: "text", content: "response" } } }),
  },
  consoleSessionApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
    get: vi.fn().mockResolvedValue({ data: { success: true, data: { messages: [] } } }),
    create: vi.fn().mockResolvedValue({ data: { success: true, data: { id: 1, title: "Test", updated_at: new Date().toISOString() } } }),
    update: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
    archive: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
  channelApi: {
    list: vi.fn().mockImplementation((serverId: number) =>
      Promise.resolve({ data: { success: true, data: mockChannelsByServer[serverId] || [] } })
    ),
  },
  serverApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
  },
}));

describe("ConsoleView useConsoleSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns channels for # even with empty channel store", async () => {
    render(<ConsoleView />);

    // Flush useEffect-based channel fetch
    await act(async () => {});

    const input = screen.getByPlaceholderText("Note or /command or $skill...");

    // Type # to trigger channel autocomplete
    await act(async () => {
      fireEvent.change(input, { target: { value: "#" } });
    });

    // Wait for suggestions dropdown to appear with channel names
    // Use "random" (unique across servers) as the primary check
    await waitFor(() => {
      expect(screen.getByText("random")).toBeInTheDocument();
    });

    // Verify multiple channels from different servers appear
    expect(screen.getByText("offtopic")).toBeInTheDocument();
    // "general" appears twice (both servers have one) — use getAllByText
    expect(screen.getAllByText("general").length).toBe(2);
  });

  it("filters channels by server when @ServerName is in text", async () => {
    render(<ConsoleView />);

    // Flush useEffect-based channel fetch
    await act(async () => {});

    const input = screen.getByPlaceholderText("Note or /command or $skill...");

    // Type @Server1 # to trigger server-scoped channel autocomplete
    await act(async () => {
      fireEvent.change(input, { target: { value: "@Server1 #" } });
    });

    // Wait for suggestions — should only include Server1's channels
    await waitFor(() => {
      expect(screen.getByText("random")).toBeInTheDocument();
    });

    // Server1's "general" should appear
    expect(screen.getByText("general")).toBeInTheDocument();

    // Server2's channels should NOT appear
    expect(screen.queryByText("offtopic")).toBeNull();
  });
});
