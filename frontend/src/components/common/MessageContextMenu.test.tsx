import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MessageContextMenu, { type MenuAction } from "./MessageContextMenu";

describe("MessageContextMenu", () => {
  const onAction = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderMenu(overrides: { isPinned?: boolean; showCreateThread?: boolean } = {}) {
    return render(
      <MessageContextMenu
        x={100}
        y={100}
        isPinned={overrides.isPinned ?? false}
        showCreateThread={overrides.showCreateThread ?? true}
        onAction={onAction}
        onClose={onClose}
      />
    );
  }

  it("renders all menu items including 建立讨论串", () => {
    renderMenu();
    expect(screen.getByText("Edit Message")).toBeInTheDocument();
    expect(screen.getByText("Reply")).toBeInTheDocument();
    expect(screen.getByText("Copy Text")).toBeInTheDocument();
    expect(screen.getByText("建立讨论串")).toBeInTheDocument();
    expect(screen.getByText("Pin Message")).toBeInTheDocument();
    expect(screen.getByText("Mark Unread")).toBeInTheDocument();
    expect(screen.getByText("Copy Message Link")).toBeInTheDocument();
    expect(screen.getByText("Voice Message")).toBeInTheDocument();
    expect(screen.getByText("Delete Message")).toBeInTheDocument();
  });

  it("shows Unpin Message when note is pinned", () => {
    renderMenu({ isPinned: true });
    expect(screen.getByText("Unpin Message")).toBeInTheDocument();
  });

  it("hides 建立讨论串 when showCreateThread is false", () => {
    renderMenu({ showCreateThread: false });
    expect(screen.queryByText("建立讨论串")).not.toBeInTheDocument();
    // Other items still present
    expect(screen.getByText("Edit Message")).toBeInTheDocument();
  });

  it("fires onAction with 'create-thread' when clicking 建立讨论串", () => {
    renderMenu();
    fireEvent.click(screen.getByText("建立讨论串"));
    expect(onAction).toHaveBeenCalledWith("create-thread" as MenuAction);
    expect(onClose).toHaveBeenCalled();
  });

  it("fires onAction with 'edit' when clicking Edit Message", () => {
    renderMenu();
    fireEvent.click(screen.getByText("Edit Message"));
    expect(onAction).toHaveBeenCalledWith("edit");
    expect(onClose).toHaveBeenCalled();
  });

  it("fires onAction with 'reply' when clicking Reply", () => {
    renderMenu();
    fireEvent.click(screen.getByText("Reply"));
    expect(onAction).toHaveBeenCalledWith("reply");
  });

  it("fires onAction with 'pin' when clicking Pin Message", () => {
    renderMenu();
    fireEvent.click(screen.getByText("Pin Message"));
    expect(onAction).toHaveBeenCalledWith("pin");
  });

  it("closes when clicking outside the menu", () => {
    renderMenu();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});
