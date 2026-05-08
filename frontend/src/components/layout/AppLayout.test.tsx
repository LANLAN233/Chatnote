import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock stores
vi.mock("../../stores", () => ({
  useServerStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = { servers: [], fetchServers: vi.fn() };
    return selector ? selector(state) : state;
  }),
}));

// Mock services
vi.mock("../../services", () => ({
  statsApi: {
    get: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
}));

// Mock child components to simplify test
vi.mock("./Sidebar", () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("./ChannelList", () => ({
  default: () => <div data-testid="channel-list">ChannelList</div>,
}));

vi.mock("../home/HomeSidebar", () => ({
  default: ({ activeTab }: { activeTab: string }) => (
    <div data-testid="home-sidebar" data-tab={activeTab}>
      HomeSidebar: {activeTab}
    </div>
  ),
}));

vi.mock("../thread/ThreadPanel", () => ({
  default: () => <div data-testid="thread-panel">ThreadPanel</div>,
}));

import AppLayout from "./AppLayout";

describe("AppLayout URL tab param", () => {
  it("renders HomeSidebar with activeTab=overview when no tab param", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppLayout />
      </MemoryRouter>
    );
    const sidebar = screen.getByTestId("home-sidebar");
    expect(sidebar.getAttribute("data-tab")).toBe("overview");
  });

  it("reads ?tab=console and sets activeTab to console", () => {
    render(
      <MemoryRouter initialEntries={["/?tab=console"]}>
        <AppLayout />
      </MemoryRouter>
    );
    const sidebar = screen.getByTestId("home-sidebar");
    expect(sidebar.getAttribute("data-tab")).toBe("console");
  });

  it("reads ?tab=import and sets activeTab to import", () => {
    render(
      <MemoryRouter initialEntries={["/?tab=import"]}>
        <AppLayout />
      </MemoryRouter>
    );
    const sidebar = screen.getByTestId("home-sidebar");
    expect(sidebar.getAttribute("data-tab")).toBe("import");
  });

  it("ignores invalid tab param and defaults to overview", () => {
    render(
      <MemoryRouter initialEntries={["/?tab=invalid"]}>
        <AppLayout />
      </MemoryRouter>
    );
    const sidebar = screen.getByTestId("home-sidebar");
    expect(sidebar.getAttribute("data-tab")).toBe("overview");
  });
});
