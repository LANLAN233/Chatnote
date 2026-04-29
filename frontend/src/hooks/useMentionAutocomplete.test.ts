import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMentionAutocomplete } from "./useMentionAutocomplete";

describe("useMentionAutocomplete", () => {
  let value = "";
  const onChange = vi.fn((v: string) => {
    value = v;
  });

  beforeEach(() => {
    value = "";
    onChange.mockClear();
  });

  it("should detect @server suggestion", async () => {
    const getSuggestions = vi.fn().mockResolvedValue(["高等数学", "线性代数"]);
    const { result } = renderHook(() =>
      useMentionAutocomplete({ value, onChange, getSuggestions })
    );

    await act(async () => {
      await result.current.handleInputChange("@高", 2);
    });

    expect(getSuggestions).toHaveBeenCalledWith("高", "server", "@高");
    expect(result.current.show).toBe(true);
    expect(result.current.suggestions).toEqual(["高等数学", "线性代数"]);
    expect(result.current.type).toBe("server");
  });

  it("should detect #channel suggestion", async () => {
    const getSuggestions = vi.fn().mockResolvedValue(["极限", "导数"]);
    const { result } = renderHook(() =>
      useMentionAutocomplete({ value, onChange, getSuggestions })
    );

    await act(async () => {
      await result.current.handleInputChange("#极", 2);
    });

    expect(getSuggestions).toHaveBeenCalledWith("极", "channel", "#极");
    expect(result.current.show).toBe(true);
    expect(result.current.type).toBe("channel");
  });

  it("should not show suggestions when no pattern matched", async () => {
    const getSuggestions = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() =>
      useMentionAutocomplete({ value, onChange, getSuggestions })
    );

    await act(async () => {
      await result.current.handleInputChange("hello world", 11);
    });

    expect(getSuggestions).not.toHaveBeenCalled();
    expect(result.current.show).toBe(false);
  });

  it("should apply server suggestion and replace text", async () => {
    value = "@高";
    const getSuggestions = vi.fn().mockResolvedValue(["高等数学"]);
    const { result } = renderHook(() =>
      useMentionAutocomplete({ value, onChange, getSuggestions })
    );

    await act(async () => {
      await result.current.handleInputChange("@高", 2);
    });

    act(() => {
      result.current.applySuggestion("高等数学");
    });

    expect(onChange).toHaveBeenCalledWith("@高等数学 ");
    expect(result.current.show).toBe(false);
  });

  it("should apply channel suggestion and replace text", async () => {
    value = "@高等数学 #极";
    const getSuggestions = vi.fn().mockResolvedValue(["极限"]);
    const { result } = renderHook(() =>
      useMentionAutocomplete({ value, onChange, getSuggestions })
    );

    await act(async () => {
      await result.current.handleInputChange("@高等数学 #极", 9);
    });

    act(() => {
      result.current.applySuggestion("极限");
    });

    expect(onChange).toHaveBeenCalledWith("@高等数学 #极限 ");
  });

  it("should navigate suggestions with ArrowDown and ArrowUp", async () => {
    value = "@高";
    const getSuggestions = vi.fn().mockResolvedValue(["A", "B", "C"]);
    const { result } = renderHook(() =>
      useMentionAutocomplete({ value, onChange, getSuggestions })
    );

    await act(async () => {
      await result.current.handleInputChange("@高", 2);
    });

    expect(result.current.selectedIndex).toBe(0);

    const arrowDown = new KeyboardEvent("keydown", { key: "ArrowDown" }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current.handleKeyDown(arrowDown);
    });
    expect(result.current.selectedIndex).toBe(1);

    const arrowUp = new KeyboardEvent("keydown", { key: "ArrowUp" }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current.handleKeyDown(arrowUp);
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it("should apply suggestion on Tab", async () => {
    value = "@高";
    const getSuggestions = vi.fn().mockResolvedValue(["高等数学"]);
    const { result } = renderHook(() =>
      useMentionAutocomplete({ value, onChange, getSuggestions })
    );

    await act(async () => {
      await result.current.handleInputChange("@高", 2);
    });

    const tabEvent = new KeyboardEvent("keydown", { key: "Tab" }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current.handleKeyDown(tabEvent);
    });

    expect(onChange).toHaveBeenCalledWith("@高等数学 ");
  });

  it("should close suggestions on Escape", async () => {
    value = "@高";
    const getSuggestions = vi.fn().mockResolvedValue(["高等数学"]);
    const { result } = renderHook(() =>
      useMentionAutocomplete({ value, onChange, getSuggestions })
    );

    await act(async () => {
      await result.current.handleInputChange("@高", 2);
    });

    expect(result.current.show).toBe(true);

    const escEvent = new KeyboardEvent("keydown", { key: "Escape" }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current.handleKeyDown(escEvent);
    });

    expect(result.current.show).toBe(false);
  });

  it("should return false on Enter when no suggestion selected", async () => {
    value = "hello";
    const getSuggestions = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() =>
      useMentionAutocomplete({ value, onChange, getSuggestions })
    );

    await act(async () => {
      await result.current.handleInputChange("hello", 5);
    });

    const enterEvent = new KeyboardEvent("keydown", { key: "Enter" }) as unknown as React.KeyboardEvent;
    let consumed = false;
    act(() => {
      consumed = result.current.handleKeyDown(enterEvent);
    });
    expect(consumed).toBe(false);
  });
});
