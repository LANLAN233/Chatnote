import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConsoleImportModal from "./ConsoleImportModal";
import { consoleApi, aiApi } from "../../services";

vi.mock("../../services", () => ({
  consoleApi: {
    importToChannel: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
  aiApi: {
    classify: vi.fn(),
  },
}));

const servers = [
  { id: 1, user_id: 1, name: "高等数学", icon: null, description: null, sort_order: 0, created_at: "", updated_at: "" },
  { id: 2, user_id: 1, name: "Physics", icon: null, description: null, sort_order: 0, created_at: "", updated_at: "" },
];

const channels = [
  { id: 10, server_id: 1, name: "极限", type: "text", description: null, sort_order: 0, created_at: "", updated_at: "" },
  { id: 11, server_id: 1, name: "积分", type: "text", description: null, sort_order: 0, created_at: "", updated_at: "" },
  { id: 20, server_id: 2, name: "Mechanics", type: "text", description: null, sort_order: 0, created_at: "", updated_at: "" },
];

describe("ConsoleImportModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Let React Testing Library clean up the portal.
  });

  it("renders through a portal with the selected text prefilled", () => {
    render(
      <ConsoleImportModal
        content="selected console text"
        servers={servers}
        channels={channels}
        onClose={() => {}}
      />
    );

    expect(document.body.textContent).toContain("导入到频道");
    expect(screen.getByLabelText("Content")).toHaveValue("selected console text");
  });

  it("filters channels when the server changes", () => {
    render(
      <ConsoleImportModal
        content="text"
        servers={servers}
        channels={channels}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText("Server"), { target: { value: "2" } });

    expect(screen.getByText("Mechanics")).toBeTruthy();
    expect(screen.queryByText("极限")).toBeNull();
  });

  it("supports @Server #Channel natural language targeting", () => {
    render(
      <ConsoleImportModal
        content="text"
        servers={servers}
        channels={channels}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText("Natural language target"), {
      target: { value: "@高等数学 #极限" },
    });

    expect(screen.getByLabelText("Server")).toHaveValue("1");
    expect(screen.getByLabelText("Channel")).toHaveValue("10");
  });

  it("calls onServerSelect when server is changed", async () => {
    const onServerSelect = vi.fn().mockResolvedValue(undefined);
    render(
      <ConsoleImportModal
        content="text"
        servers={servers}
        channels={channels}
        onClose={() => {}}
        onServerSelect={onServerSelect}
      />
    );

    fireEvent.change(screen.getByLabelText("Server"), { target: { value: "2" } });

    expect(onServerSelect).toHaveBeenCalledWith(2);
  });

  it("saves editable content and closes after success", async () => {
    const onClose = vi.fn();
    render(
      <ConsoleImportModal
        content="original text"
        servers={servers}
        channels={channels}
        onClose={onClose}
      />
    );

    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "edited text" } });
    fireEvent.change(screen.getByLabelText("Server"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(consoleApi.importToChannel).toHaveBeenCalledWith({
        content: "edited text",
        server_id: 1,
        channel_id: 11,
        target_text: "",
      });
      expect(onClose).toHaveBeenCalled();
      expect(document.body.textContent).toContain("已导入到频道");
    });
  });

  it("triggers AI classify and auto-fills server/channel", async () => {
    const mockClassify = aiApi.classify as ReturnType<typeof vi.fn>;
    mockClassify.mockResolvedValue({
      data: {
        success: true,
        data: {
          suggested_server: "高等数学",
          suggested_channel: "积分",
          confidence: 0.9,
          tags: [],
          summary: "",
          is_new_server: false,
          is_new_channel: false,
        },
      },
    });

    const onServerSelect = vi.fn().mockResolvedValue(undefined);
    render(
      <ConsoleImportModal
        content="微积分求导问题"
        servers={servers}
        channels={channels}
        onClose={() => {}}
        onServerSelect={onServerSelect}
      />
    );

    // Verify parse button is rendered
    const parseBtn = screen.getByRole("button", { name: /解析/ });
    expect(parseBtn).toBeTruthy();

    // Click the parse button
    fireEvent.click(parseBtn);

    await waitFor(() => {
      expect(mockClassify).toHaveBeenCalledWith("微积分求导问题");
      expect(onServerSelect).toHaveBeenCalledWith(1);
    });

    // Server dropdown should be auto-filled to 高等数学 (id=1)
    expect(screen.getByLabelText("Server")).toHaveValue("1");
  });
});
