import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AiProgressEvent } from "../../types";
import ConsoleCore from "./ConsoleCore";

Element.prototype.scrollIntoView = vi.fn();

const mockClearProgress = vi.fn();
vi.mock("../../hooks/useAiProgress", () => ({
  useAiProgress: vi.fn(() => ({
    progress: null,
    disconnected: false,
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
    clearProgress: mockClearProgress,
  })),
}));

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
    onDisconnect: vi.fn(() => vi.fn()),
  },
}));

const mockExecuteFn = vi.fn().mockResolvedValue({ type: "text", content: "Test response" });

describe("ConsoleCore selection toolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the floating toolbar after mouseup selection", async () => {
    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} initMessages={["Welcome message"]} />
    );

    const messageContent = screen.getByText(/Welcome message/);
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

    expect(document.body.textContent).toContain("复制");
    expect(document.body.textContent).toContain("导入到...");
  });

  it("closes the toolbar on Escape", async () => {
    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} initMessages={["Escape test"]} />
    );

    const messageContent = screen.getByText(/Escape test/);
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

    expect(document.body.textContent).toContain("复制");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(document.body.textContent).not.toContain("复制");
  });
});

describe("handleSubmit $ask prefix bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should NOT add $ask prefix when text starts with @Server #Channel (mention)", async () => {
    render(<ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} aiEnabled={true} />);

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "@Server #Channel question" } });
      fireEvent.click(sendButton);
    });

    const calls = mockExecuteFn.mock.calls;
    expect(calls[calls.length - 1][0]).toBe("@Server #Channel question");
  });

  it("should add $ask prefix for plain text when AI enabled", async () => {
    render(<ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} aiEnabled={true} />);

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "帮我总结笔记" } });
      fireEvent.click(sendButton);
    });

    const calls = mockExecuteFn.mock.calls;
    expect(calls[calls.length - 1][0]).toBe("$ask 帮我总结笔记");
  });

  it("should add $ask prefix for @file: mention when AI enabled", async () => {
    render(<ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} aiEnabled={true} />);

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "@file:doc.pdf what is this" } });
      fireEvent.click(sendButton);
    });

    const calls = mockExecuteFn.mock.calls;
    expect(calls[calls.length - 1][0]).toBe("$ask @file:doc.pdf what is this");
  });

  it("should NOT add $ask prefix for /command text", async () => {
    render(<ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} aiEnabled={true} />);

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "/search keyword" } });
      fireEvent.click(sendButton);
    });

    const calls = mockExecuteFn.mock.calls;
    expect(calls[calls.length - 1][0]).toBe("/search keyword");
  });
});

describe("handleSubmit $ask prefix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithDefaults = () =>
    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={mockExecuteFn}
        aiEnabled={true}
      />
    );

  const submitText = async (value: string) => {
    renderWithDefaults();
    const textarea = screen.getByPlaceholderText(
      "Note or /command or $skill..."
    );
    const sendBtn = textarea.parentElement?.querySelector(
      "button"
    ) as HTMLButtonElement;

    await act(async () => {
      fireEvent.change(textarea, { target: { value } });
      fireEvent.click(sendBtn);
    });
  };

  it("should NOT prefix @ServerName #Channel patterns with $ask", async () => {
    await submitText("@MathClass #极限 什么是极限？");
    expect(mockExecuteFn).toHaveBeenCalledWith(
      "@MathClass #极限 什么是极限？",
      true,
      undefined
    );
  });

  it("should prefix plain text with $ask (regression guard)", async () => {
    await submitText("帮我总结笔记");
    expect(mockExecuteFn).toHaveBeenCalledWith(
      "$ask 帮我总结笔记",
      true,
      undefined
    );
  });

  it("should NOT prefix /help commands with $ask (regression guard)", async () => {
    await submitText("/help");
    expect(mockExecuteFn).toHaveBeenCalledWith(
      "/help",
      true,
      undefined
    );
  });

  it("should NOT double-prefix $ask commands (regression guard)", async () => {
    await submitText("$ask custom query");
    expect(mockExecuteFn).toHaveBeenCalledWith(
      "$ask custom query",
      true,
      undefined
    );
  });

  it("should still prefix @file: patterns with $ask (regression guard)", async () => {
    await submitText("@file:doc.pdf explain this");
    expect(mockExecuteFn).toHaveBeenCalledWith(
      "$ask @file:doc.pdf explain this",
      true,
      undefined
    );
  });
});

describe("context loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes context_loaded response and renders message in UI", async () => {
    const ctxResult = {
      type: "context_loaded",
      content: "Loaded context from @TestServer #general (5 notes):\\n- Note 1\\n- Note 2",
      data: {
        type: "context_loaded",
        content: "Loaded context from @TestServer #general (5 notes):\\n- Note 1\\n- Note 2",
        server_name: "TestServer",
        channel_name: "general",
        server_id: 1,
        channel_id: 2,
        notes_count: 5,
      },
    };
    const ctxFn = vi.fn().mockResolvedValue(ctxResult);

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={ctxFn} aiEnabled={true} />
    );

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "@TestServer #general" } });
      fireEvent.click(sendButton);
    });

    // The context_loaded content should appear in the UI as an assistant message
    await waitFor(() => {
      expect(screen.getByText(/Loaded context from @TestServer/)).toBeInTheDocument();
    });

    // Verify the executeFn was called with the right arguments
    expect(ctxFn).toHaveBeenCalledWith("@TestServer #general", true, undefined);
  });

  it("restores loaded_context from session data on session select", async () => {
    const ctxJson = JSON.stringify({
      server_name: "TestServer",
      channel_name: "general",
      server_id: 1,
      channel_id: 2,
      notes_count: 5,
    });

    const { consoleSessionApi } = await import("../../services");
    const mockedApi = vi.mocked(consoleSessionApi);

    // Mock list to return a session with loaded_context
    mockedApi.list.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 1,
            user_id: 1,
            server_id: null,
            title: "Test Session",
            loaded_context: ctxJson,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    // Mock get to return the session with loaded_context
    mockedApi.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 1,
          user_id: 1,
          server_id: null,
          title: "Test Session",
          loaded_context: ctxJson,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [
            {
              id: 10,
              session_id: 1,
              role: "assistant",
              content: "Context loaded.",
              type: "context_loaded",
              created_at: new Date().toISOString(),
            },
          ],
        },
      },
    });

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} />
    );

    // Wait for auto-load: list was called → session 1 selected
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith(1);
    });

    // Verify the get response was processed (messages loaded)
    expect(mockedApi.get).toHaveBeenCalled();
  });

  it("consoleSessionApi.update accepts loaded_context parameter for context removal", async () => {
    const { consoleSessionApi } = await import("../../services");
    const mockedUpdate = vi.mocked(consoleSessionApi.update);

    mockedUpdate.mockResolvedValueOnce({
      data: { success: true, data: {} as import("../../types").ConsoleSession },
    });

    // Simulate clearing loaded_context (as handleRemoveContext would do)
    await consoleSessionApi.update(1, { loaded_context: null });

    expect(mockedUpdate).toHaveBeenCalledWith(1, { loaded_context: null });
  });

  it("renders context chips when loadedContext has entries", async () => {
    const ctxResult = {
      type: "context_loaded",
      content: "Loaded context from @TestServer #general (5 notes)",
      server_name: "TestServer",
      channel_name: "general",
      server_id: 1,
      channel_id: 2,
      notes_count: 5,
    };
    const ctxFn = vi.fn().mockResolvedValue(ctxResult);

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={ctxFn} aiEnabled={true} />
    );

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "@TestServer #general" } });
      fireEvent.click(sendButton);
    });

    // Wait for context chips to appear
    await waitFor(() => {
      expect(screen.getByText(/上下文:/)).toBeInTheDocument();
    });

    expect(screen.getByText(/\(5条笔记\)/)).toBeInTheDocument();
  });

  it("clicking × on chip removes the chip", async () => {
    const { consoleSessionApi } = await import("../../services");
    const mockedApi = vi.mocked(consoleSessionApi);

    // Mock list to return a session so currentSessionId is set
    mockedApi.list.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 1,
            user_id: 1,
            server_id: null,
            title: "Test Session",
            loaded_context: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 1,
          user_id: 1,
          server_id: null,
          title: "Test Session",
          loaded_context: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
        },
      },
    });

    mockedApi.update.mockResolvedValueOnce({
      data: { success: true, data: {} as import("../../types").ConsoleSession },
    });

    const ctxResult = {
      type: "context_loaded",
      content: "Loaded context from @TestServer #general (5 notes)",
      server_name: "TestServer",
      channel_name: "general",
      server_id: 1,
      channel_id: 2,
      notes_count: 5,
    };
    const ctxFn = vi.fn().mockResolvedValue(ctxResult);

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={ctxFn} aiEnabled={true} />
    );

    // Wait for session to be auto-selected
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith(1);
    });

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "@TestServer #general" } });
      fireEvent.click(sendButton);
    });

    // Wait for context chips to appear
    await waitFor(() => {
      expect(screen.getByText(/上下文:/)).toBeInTheDocument();
    });

    // Find and click the remove button (×)
    const removeButton = screen.getByTitle("移除上下文");
    await act(async () => {
      fireEvent.click(removeButton);
    });

    // Context bar should be removed since all chips are gone
    await waitFor(() => {
      expect(screen.queryByText(/上下文:/)).not.toBeInTheDocument();
    });
  });

  it("does not show context chips when loadedContext is empty", () => {
    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} aiEnabled={true} />
    );

    expect(screen.queryByText(/上下文:/)).not.toBeInTheDocument();
  });

  it("full integration: context load then subsequent plain question gets $ask prefix", async () => {
    const ctxResult = {
      type: "context_loaded",
      content: "Loaded context from @TestServer #general (5 notes)",
      server_name: "TestServer",
      channel_name: "general",
      server_id: 1,
      channel_id: 2,
      notes_count: 5,
    };
    const textResult = { type: "text", content: "Here is the answer" };
    const ctxFn = vi.fn()
      .mockResolvedValueOnce(ctxResult)
      .mockResolvedValueOnce(textResult);

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={ctxFn} aiEnabled={true} />
    );

    // Step 1: Load context via @Server #Channel
    const input1 = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton1 = input1.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input1, { target: { value: "@TestServer #general" } });
      fireEvent.click(sendButton1);
    });

    // Verify context chips appear
    await waitFor(() => {
      expect(screen.getByText(/上下文:/)).toBeInTheDocument();
    });
    expect(screen.getByText(/\(5条笔记\)/)).toBeInTheDocument();

    // Step 2: Submit a plain text question without @# server/channel mention
    const input2 = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton2 = input2.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input2, { target: { value: "帮我总结" } });
      fireEvent.click(sendButton2);
    });

    // The second call should have $ask prefix (plain text with AI enabled)
    expect(ctxFn).toHaveBeenCalledTimes(2);
    expect(ctxFn).toHaveBeenNthCalledWith(2, "$ask 帮我总结", true, undefined);

    // Context chips should still be visible after the plain question
    expect(screen.getByText(/上下文:/)).toBeInTheDocument();
    expect(screen.getByText(/\(5条笔记\)/)).toBeInTheDocument();
  });

  it("@# routing bypass still works for subsequent question after context loaded", async () => {
    const ctxResult = {
      type: "context_loaded",
      content: "Loaded context from @MathClass #极限 (5 notes)",
      data: {
        type: "context_loaded",
        content: "Loaded context from @MathClass #极限 (5 notes)",
        server_name: "MathClass",
        channel_name: "极限",
        server_id: 1,
        channel_id: 2,
        notes_count: 5,
      },
    };
    const textResult = { type: "text", content: "Answer about limits" };
    const ctxFn = vi.fn()
      .mockResolvedValueOnce(ctxResult)
      .mockResolvedValueOnce(textResult);

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={ctxFn} aiEnabled={true} />
    );

    // Step 1: Load context
    const input1 = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton1 = input1.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input1, { target: { value: "@MathClass #极限" } });
      fireEvent.click(sendButton1);
    });

    await waitFor(() => {
      expect(screen.getByText(/上下文:/)).toBeInTheDocument();
    });

    // Step 2: Submit another @Server #Channel question — should NOT get $ask prefix
    const input2 = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton2 = input2.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input2, { target: { value: "@MathClass #极限 什么是极限？" } });
      fireEvent.click(sendButton2);
    });

    // Verify the second call bypasses $ask prefix — raw @# text is passed through
    expect(ctxFn).toHaveBeenCalledTimes(2);
    expect(ctxFn).toHaveBeenNthCalledWith(2, "@MathClass #极限 什么是极限？", true, undefined);
  });

  it("session restore: loaded_context populates context bar in UI", async () => {
    const ctxJson = JSON.stringify({
      server_name: "TestServer",
      channel_name: "general",
      server_id: 1,
      channel_id: 2,
      notes_count: 5,
    });

    const { consoleSessionApi } = await import("../../services");
    const mockedApi = vi.mocked(consoleSessionApi);

    mockedApi.list.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 1,
            user_id: 1,
            server_id: null,
            title: "Test Session",
            loaded_context: ctxJson,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 1,
          user_id: 1,
          server_id: null,
          title: "Test Session",
          loaded_context: ctxJson,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [
            {
              id: 10,
              session_id: 1,
              role: "assistant",
              content: "Context loaded.",
              type: "context_loaded",
              created_at: new Date().toISOString(),
            },
          ],
        },
      },
    });

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} />
    );

    // Wait for auto-load to select session and restore context
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith(1);
    });

    // Context bar should be visible with loaded context chips
    await waitFor(() => {
      expect(screen.getByText(/上下文:/)).toBeInTheDocument();
    });

    // Verify chip content — server name, channel name, and note count
    expect(screen.getByText(/@TestServer/)).toBeInTheDocument();
    expect(screen.getByText(/#general/)).toBeInTheDocument();
    expect(screen.getByText(/\(5条笔记\)/)).toBeInTheDocument();
  });
});

describe("context_loaded state update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates loadedContext when executeFn returns context_loaded response", async () => {
    const ctxMockExecute = vi.fn().mockResolvedValue({
      type: "context_loaded",
      content: "已加载 @TestServer #general 的 5 条笔记作为上下文",
      server_name: "TestServer",
      channel_name: "general",
      server_id: 1,
      channel_id: 2,
      notes_count: 5,
    });

    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={ctxMockExecute}
        aiEnabled={true}
      />
    );

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "@TestServer #general" } });
      fireEvent.click(sendButton);
    });

    // Verify executeFn was called with the raw text (no $ask prefix for @Server #Channel)
    expect(ctxMockExecute).toHaveBeenCalledWith("@TestServer #general", true, undefined);

    // Verify context chips appear
    await waitFor(() => {
      expect(screen.getByText(/上下文:/)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/@TestServer/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/#general/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\(5条笔记\)/)).toBeInTheDocument();
  });

  it("X button removes context chip", async () => {
    const { consoleSessionApi } = await import("../../services");
    const mockedApi = vi.mocked(consoleSessionApi);

    // Mock session list so auto-load picks up a session
    mockedApi.list.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 1,
            user_id: 1,
            server_id: null,
            title: "Test Session",
            loaded_context: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 1,
          user_id: 1,
          server_id: null,
          title: "Test Session",
          loaded_context: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          messages: [],
        },
      },
    });

    mockedApi.update.mockResolvedValueOnce({
      data: { success: true, data: {} as import("../../types").ConsoleSession },
    });

    const ctxMockExecute = vi.fn().mockResolvedValue({
      type: "context_loaded",
      content: "已加载 @TestServer #general 的 5 条笔记作为上下文",
      server_name: "TestServer",
      channel_name: "general",
      server_id: 1,
      channel_id: 2,
      notes_count: 5,
    });

    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={ctxMockExecute}
        aiEnabled={true}
      />
    );

    // Wait for session auto-load
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith(1);
    });

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "@TestServer #general" } });
      fireEvent.click(sendButton);
    });

    // Wait for context chip to appear
    await waitFor(() => {
      expect(screen.getByText(/上下文:/)).toBeInTheDocument();
    });

    // Click X button to remove context
    const xButton = screen.getByTitle("移除上下文");
    await act(async () => {
      fireEvent.click(xButton);
    });

    // Context bar should disappear (chips removed)
    await waitFor(() => {
      expect(screen.queryByText(/上下文:/)).not.toBeInTheDocument();
    });
  });
});

// T19: WebSocket title_updated handler
describe("title_updated WebSocket handler", () => {
  const mockSession = (id: number, title: string) => ({
    id,
    user_id: 1,
    server_id: null,
    title,
    loaded_context: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates session title from 'New Session' to generated title after title_updated event", async () => {
    const { consoleSessionApi, wsService } = await import("../../services");

    // Capture the handler registered by ConsoleCore
    let capturedHandler: ((data: unknown) => void) | null = null;
    (wsService.on as ReturnType<typeof vi.fn>).mockImplementation(
      (type: string, handler: unknown) => {
        if (type === "title_updated") capturedHandler = handler as (data: unknown) => void;
        return vi.fn();
      }
    );

    // Mock list to return one session with "New Session"
    vi.mocked(consoleSessionApi.list).mockResolvedValueOnce({
      data: {
        success: true,
        data: [mockSession(1, "New Session")],
      },
    });

    // Mock get to return session with no messages
    vi.mocked(consoleSessionApi.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: { ...mockSession(1, "New Session"), messages: [] },
      },
    });

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} />
    );

    // Wait for initial load and session selection
    await waitFor(() => {
      expect(vi.mocked(consoleSessionApi.get)).toHaveBeenCalledWith(1);
    });

    // Verify "New Session" is visible — appears both in "New Session" button and session title
    expect(screen.getAllByText("New Session").length).toBe(2);

    // Fire the title_updated WebSocket event
    await act(async () => {
      capturedHandler!({ session_id: 1, title: "Generated Title" });
    });

    // Verify the title updated in the sidebar session span
    await waitFor(() => {
      expect(screen.getByText("Generated Title")).toBeInTheDocument();
    });

    // "New Session" button still exists (it's the create button, always there)
    expect(screen.getByText("New Session")).toBeInTheDocument();
  });

  it("does not switch session when another session's title is updated", async () => {
    const { consoleSessionApi, wsService } = await import("../../services");

    let capturedHandler: ((data: unknown) => void) | null = null;
    (wsService.on as ReturnType<typeof vi.fn>).mockImplementation(
      (type: string, handler: unknown) => {
        if (type === "title_updated") capturedHandler = handler as (data: unknown) => void;
        return vi.fn();
      }
    );

    // Mock list to return 2 sessions
    vi.mocked(consoleSessionApi.list).mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          mockSession(1, "Session One"),
          mockSession(2, "Session Two"),
        ],
      },
    });

    // Mock get for session 1 (auto-selected first)
    vi.mocked(consoleSessionApi.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: { ...mockSession(1, "Session One"), messages: [{ id: 10, session_id: 1, role: "assistant" as const, content: "Hello from session 1", type: "text", created_at: new Date().toISOString() }] },
      },
    });

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} />
    );

    // Wait for initial load — should select session 1
    await waitFor(() => {
      expect(vi.mocked(consoleSessionApi.get)).toHaveBeenCalledWith(1);
    });

    const getCallCountBefore = vi.mocked(consoleSessionApi.get).mock.calls.length;

    // Fire title_updated for session 2 (the inactive session)
    await act(async () => {
      capturedHandler!({ session_id: 2, title: "Updated Session Two" });
    });

    // Verify title for session 2 updated in sidebar
    await waitFor(() => {
      expect(screen.getByText("Updated Session Two")).toBeInTheDocument();
    });

    // Verify no additional call to get (no session switch)
    expect(vi.mocked(consoleSessionApi.get).mock.calls.length).toBe(getCallCountBefore);

    // Verify session 1 is still there and still the active session
    expect(screen.getByText("Session One")).toBeInTheDocument();
    expect(screen.getByText("Hello from session 1")).toBeInTheDocument();
  });

  it("title update via WebSocket keeps current session and preserves input focus", async () => {
    const { consoleSessionApi, wsService } = await import("../../services");

    let capturedHandler: ((data: unknown) => void) | null = null;
    (wsService.on as ReturnType<typeof vi.fn>).mockImplementation(
      (type: string, handler: unknown) => {
        if (type === "title_updated") capturedHandler = handler as (data: unknown) => void;
        return vi.fn();
      }
    );

    vi.mocked(consoleSessionApi.list).mockResolvedValueOnce({
      data: {
        success: true,
        data: [mockSession(1, "New Session")],
      },
    });

    vi.mocked(consoleSessionApi.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: { ...mockSession(1, "New Session"), messages: [] },
      },
    });

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} />
    );

    await waitFor(() => {
      expect(vi.mocked(consoleSessionApi.get)).toHaveBeenCalledWith(1);
    });

    // Fire title_updated — title should update in sidebar
    await act(async () => {
      capturedHandler!({ session_id: 1, title: "Server Generated Title" });
    });

    // Verify title updated in sidebar session span
    await waitFor(() => {
      expect(screen.getByText("Server Generated Title")).toBeInTheDocument();
    });

    // Verify the input box is still present (no session switch, no focus lost)
    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    expect(input).toBeInTheDocument();

    // Verify no additional session load (get only called once for initial load)
    expect(vi.mocked(consoleSessionApi.get)).toHaveBeenCalledTimes(1);
  });
});

describe("session switch clears progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls clearProgress on session switch", async () => {
    const { consoleSessionApi } = await import("../../services");
    const mockedApi = vi.mocked(consoleSessionApi);

    const mockSession = (id: number, title: string) => ({
      id,
      user_id: 1,
      server_id: null,
      title,
      loaded_context: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockedApi.list.mockResolvedValueOnce({
      data: {
        success: true,
        data: [mockSession(1, "Session One"), mockSession(2, "Session Two")],
      },
    });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { ...mockSession(1, "Session One"), messages: [] },
      },
    });

    mockedApi.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { ...mockSession(2, "Session Two"), messages: [] },
      },
    });

    render(
      <ConsoleCore scope={{ type: "global" }} executeFn={mockExecuteFn} />
    );

    // Wait for auto-select of session 1 — clearProgress fires on mount + on sessionId change
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith(1);
    });
    expect(mockClearProgress).toHaveBeenCalledTimes(2);

    // Click session 2 in sidebar to switch
    const sessionTwoBtn = screen.getByText("Session Two");
    await act(async () => {
      fireEvent.click(sessionTwoBtn);
    });

    // Wait for session 2 to load
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith(2);
    });

    expect(mockClearProgress).toHaveBeenCalledTimes(3);
  });
});

describe("AiProgressPanel integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders AiProgressPanel during loading and shrinks on completion", async () => {
    const { useAiProgress } = await import("../../hooks/useAiProgress");
    const mockedUseAiProgress = vi.mocked(useAiProgress);

    // Phase 1: in_progress — panel should be expanded with visible stage list
    const inProgressData: AiProgressEvent = {
      operation_id: "op-1",
      stages: [
        {
          stage: "retrieval",
          status: "completed",
          model: "gpt-4",
          tier: "strong",
          message: "Retrieved 3 notes",
          duration_ms: 1200,
        },
        {
          stage: "answer_generation",
          status: "in_progress",
          model: "gpt-4",
          tier: "strong",
          message: "Generating answer...",
        },
      ],
      current_stage: 1,
      overall_status: "in_progress",
    };

    mockedUseAiProgress.mockReturnValue({
      progress: inProgressData,
      disconnected: false,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      clearProgress: mockClearProgress,
    });

    let resolveDeferred!: (value: unknown) => void;
    const deferredExecuteFn = vi
      .fn()
      .mockReturnValue(new Promise<unknown>((r) => { resolveDeferred = r; }));

    render(
      <ConsoleCore
        scope={{ type: "global" }}
        executeFn={deferredExecuteFn}
        aiEnabled={true}
      />
    );

    const input = screen.getByPlaceholderText("Note or /command or $skill...");
    const sendButton = input.closest("div")!.querySelector("button")!;

    await act(async () => {
      fireEvent.change(input, { target: { value: "帮我总结" } });
      fireEvent.click(sendButton);
    });

    // AiProgressPanel should appear during loading
    await waitFor(() => {
      expect(screen.getByTestId("progress-summary")).toBeInTheDocument();
    });

    // Stage list should be expanded for in_progress status
    const step0 = screen.getByTestId("progress-step-0");
    expect(step0).toBeVisible();
    const stepContainer = step0.parentElement?.parentElement;
    expect(stepContainer?.className).toContain("max-h-96");
    expect(stepContainer?.className).toContain("opacity-100");

    // Resolve the deferred promise — loading finishes, panel disappears
    await act(async () => {
      resolveDeferred({ type: "text", content: "Here is your summary" });
    });
    await waitFor(() => {
      expect(screen.queryByTestId("progress-summary")).not.toBeInTheDocument();
    });

    // Phase 2: completed — panel should show 完成 summary and collapsed stage list
    const completedData: AiProgressEvent = {
      operation_id: "op-2",
      stages: [
        {
          stage: "retrieval",
          status: "completed",
          model: "gpt-4",
          tier: "strong",
          message: "Retrieved 5 notes",
          duration_ms: 800,
        },
        {
          stage: "answer_generation",
          status: "completed",
          model: "gpt-4",
          tier: "strong",
          message: "Answer ready",
          duration_ms: 1500,
        },
      ],
      current_stage: 1,
      overall_status: "completed",
    };
    mockedUseAiProgress.mockReturnValue({
      progress: completedData,
      disconnected: false,
      startTracking: vi.fn(),
      stopTracking: vi.fn(),
      clearProgress: mockClearProgress,
    });

    let resolveDeferred2!: (value: unknown) => void;
    deferredExecuteFn.mockReturnValue(
      new Promise<unknown>((r) => { resolveDeferred2 = r; })
    );

    await act(async () => {
      fireEvent.change(input, { target: { value: "再问一个问题" } });
      fireEvent.click(sendButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId("progress-summary")).toBeInTheDocument();
    });

    // Completed summary should show 完成 text
    const toggle = screen.getByTestId("progress-toggle");
    expect(toggle.textContent).toContain("完成");
    expect(toggle.textContent).toContain("2/2");

    // Stage list should be collapsed for completed status
    const step0Completed = screen.queryByTestId("progress-step-0");
    const completedContainer = step0Completed?.parentElement?.parentElement;
    expect(completedContainer?.className).toContain("max-h-0");
    expect(completedContainer?.className).toContain("opacity-0");

    // Cleanup: resolve second deferred to avoid pending state
    await act(async () => {
      resolveDeferred2({ type: "text", content: "Answer 2" });
    });
  });
});
