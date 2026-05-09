import { describe, it, expect } from "vitest";
import api from "./api";

describe("API axios instance", () => {
  it("should have timeout set to 120000ms (120s)", () => {
    expect(api.defaults.timeout).toBe(120000);
  });

  it("should have baseURL set to /api", () => {
    expect(api.defaults.baseURL).toBe("/api");
  });
});
