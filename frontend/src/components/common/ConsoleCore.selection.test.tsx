import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import ConsoleCore from "./ConsoleCore";
import { consoleSessionApi } from "../../services";

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock the services
vi.mock("../../services", () => ({
  consoleSessionApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
    get: vi.fn().mockResolvedValue({ data: { success: true, data: { messages: [] } } }),
    create: vi.fn().mockResolvedValue({ data: { success: true, data: { id: 1, title: "Test", updated_at: new Date().toISOString() } } }),
    update: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
    archive: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
  serverApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
  },
  channelApi: {
    list: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
  },
  wsService: {
    on: vi.fn(() => vi.fn()),
  },
  consoleApi: {
    importToChannel: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// Mock executeFn
const mockExecuteFn = vi.fn().mockResolvedValue({ type: "text", content: "Test response" });

describe("ConsoleCore text selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // React cleans up portals; no manual DOM removal here.
  });

  it("renders init messages", () => {
    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={mockExecuteFn}
        initMessages={["Welcome message"]}
      />
    );

    // Init messages are wrapped with [SYSTEM] prefix
    expect(screen.getByText(/Welcome message/)).toBeTruthy();
  });

  it("shows floating toolbar when text is selected in message area", async () => {
    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={mockExecuteFn}
        initMessages={["Welcome message"]}
      />
    );

    // Find the message content
    const messageContent = screen.getByText(/Welcome message/);
    expect(messageContent).toBeTruthy();

    // Simulate text selection
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(messageContent);
      selection.removeAllRanges();
      selection.addRange(range);

      // Fire mouseup event on document to trigger the handler
      await act(async () => {
        fireEvent.mouseUp(document);
      });
    }

    // Toolbar should appear with "复制" and "导入到..." buttons
    // Use document.body since Portal renders there
    expect(document.body.textContent).toContain("复制");
    expect(document.body.textContent).toContain("导入到...");
  });

  it("hides toolbar when clicking outside", async () => {
    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={mockExecuteFn}
        initMessages={["Welcome message"]}
      />
    );

    const messageContent = screen.getByText(/Welcome message/);

    // First select text to show toolbar
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(messageContent);
      selection.removeAllRanges();
      selection.addRange(range);

      await act(async () => {
        fireEvent.mouseUp(document);
      });
    }

    // Verify toolbar is visible in body
    expect(document.body.textContent).toContain("复制");

    // Click outside - on a non-toolbar element
    await act(async () => {
      fireEvent.mouseDown(document.body);
    });

    // Toolbar should be hidden
    expect(document.body.textContent).not.toContain("复制");
  });

  it("copies selected text to clipboard when clicking 复制 button", async () => {
    // Mock clipboard
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      configurable: true,
      writable: true,
    });

    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={mockExecuteFn}
        initMessages={["Copy this text"]}
      />
    );

    const messageContent = screen.getByText(/Copy this text/);

    // Select text
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(messageContent);
      selection.removeAllRanges();
      selection.addRange(range);

      await act(async () => {
        fireEvent.mouseUp(document);
      });
    }

    // Find the copy button in the toolbar (which is in document.body via Portal)
    const copyButton = document.querySelector('[data-testid="selection-toolbar"] button');
    expect(copyButton).toBeTruthy();

    // Click copy button
    await act(async () => {
      fireEvent.click(copyButton!);
    });

    // Verify clipboard was called
    expect(mockClipboard.writeText).toHaveBeenCalled();
  });

  it("hides toolbar on Escape key", async () => {
    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={mockExecuteFn}
        initMessages={["Escape test"]}
      />
    );

    const messageContent = screen.getByText(/Escape test/);

    // Select text to show toolbar
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(messageContent);
      selection.removeAllRanges();
      selection.addRange(range);

      await act(async () => {
        fireEvent.mouseUp(document);
      });
    }

    // Verify toolbar is visible
    expect(document.body.textContent).toContain("复制");

    // Press Escape
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });

    // Toolbar should be hidden
    expect(document.body.textContent).not.toContain("复制");
  });

  it("does not show toolbar when no text is selected", async () => {
    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={mockExecuteFn}
        initMessages={["No selection"]}
      />
    );

    // Clear any selection
    window.getSelection()?.removeAllRanges();

    // Fire mouseup with no selection
    await act(async () => {
      fireEvent.mouseUp(document);
    });

    // Toolbar should not appear
    expect(document.body.textContent).not.toContain("复制");
    expect(document.body.textContent).not.toContain("导入到...");
  });

  it("shows hover toolbar on message hover and triggers copy/import actions", async () => {
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: clipboardWriteText },
      configurable: true,
      writable: true,
    });

    const message = {
      id: 101,
      session_id: 1,
      role: "assistant" as const,
      type: "text",
      content: "Hover me",
      created_at: new Date().toISOString(),
    };

    vi.mocked(consoleSessionApi.list).mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ id: 1, user_id: 1, server_id: 1, title: "Hover session", updated_at: new Date().toISOString(), created_at: new Date().toISOString() }],
      },
    } as any);
    vi.mocked(consoleSessionApi.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: { id: 1, user_id: 1, server_id: 1, title: "Hover session", updated_at: new Date().toISOString(), created_at: new Date().toISOString(), messages: [message] },
      },
    } as any);

    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={mockExecuteFn}
        initMessages={[]}
      />
    );

    const row = await screen.findByTestId("message-row-101");
    const toolbar = screen.getByTestId("message-toolbar-101");

    expect(toolbar.className).toContain("opacity-0");

    await act(async () => {
      fireEvent.mouseEnter(row);
    });

    expect(toolbar.className).toContain("opacity-100");
    expect(within(toolbar).getByRole("button", { name: "复制" })).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: "导入到..." })).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(toolbar).getByRole("button", { name: "复制" }));
    });
    expect(clipboardWriteText).toHaveBeenCalledWith("Hover me");

    await act(async () => {
      fireEvent.click(within(toolbar).getByRole("button", { name: "导入到..." }));
    });
    expect(await screen.findByLabelText("Content")).toHaveValue("Hover me");

    await act(async () => {
      fireEvent.mouseLeave(row);
    });

    expect(toolbar.className).toContain("opacity-0");
  });
});
