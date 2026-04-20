import { describe, it, expect } from "vitest";

describe("Frontend smoke test", () => {
  it("true is true", () => {
    expect(true).toBe(true);
  });

  it("basic math works", () => {
    expect(1 + 1).toBe(2);
  });
});