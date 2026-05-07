import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConsoleImportModal from "./ConsoleImportModal";
import { consoleApi } from "../../services";

vi.mock("../../services", () => ({
  consoleApi: {
    importToChannel: vi.fn().mockResolvedValue({ data: { success: true } }),
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
});
