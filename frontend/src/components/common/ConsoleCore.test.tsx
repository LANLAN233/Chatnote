import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
