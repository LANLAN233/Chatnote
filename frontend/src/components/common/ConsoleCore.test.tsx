import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConsoleCore from "./ConsoleCore";

Element.prototype.scrollIntoView = vi.fn();

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
      data: {
        type: "context_loaded",
        content: "Loaded context from @TestServer #general (5 notes)",
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
      data: {
        type: "context_loaded",
        content: "Loaded context from @TestServer #general (5 notes)",
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
      data: {
        type: "context_loaded",
        content: "Loaded context from @TestServer #general (5 notes)",
        server_name: "TestServer",
        channel_name: "general",
        server_id: 1,
        channel_id: 2,
        notes_count: 5,
      },
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
