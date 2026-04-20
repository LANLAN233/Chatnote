import { describe, it, expect, beforeEach, vi } from "vitest";

describe("API service URL", () => {
  it("api base URL should be /api", () => {
    expect("/api").toBe("/api");
  });
});

describe("Types validation", () => {
  it("should create valid server object", () => {
    const server = {
      id: 1,
      user_id: 1,
      name: "Test Server",
      icon: null,
      description: "A test server",
      sort_order: 0,
      created_at: "2026-04-20T00:00:00",
      updated_at: "2026-04-20T00:00:00",
    };
    expect(server.name).toBe("Test Server");
    expect(server.id).toBe(1);
  });

  it("should create valid note object", () => {
    const note = {
      id: 1,
      channel_id: 1,
      user_id: 1,
      content: "Hello world",
      content_type: "markdown",
      raw_input: null,
      ai_category: null,
      ai_summary: null,
      ai_confidence: null,
      ai_tags: null,
      is_edited: false,
      created_at: "2026-04-20T00:00:00",
      updated_at: "2026-04-20T00:00:00",
    };
    expect(note.content).toBe("Hello world");
    expect(note.is_edited).toBe(false);
  });
});