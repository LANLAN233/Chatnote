import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ServerFilesModal from "./ServerFilesModal";

vi.mock("../../services", () => ({
  serverFileApi: {
    list: vi.fn().mockResolvedValue({ data: { data: { files: [] } } }),
    upload: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

describe("ServerFilesModal", () => {
  it("renders title 'Resources — {serverName}' when entryType is undefined", () => {
    render(
      <ServerFilesModal
        serverId={1}
        serverName="Test Server"
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/^Resources/)).toBeTruthy();
  });

  it("renders title 'Library — {serverName}' when entryType is 'library'", () => {
    render(
      <ServerFilesModal
        serverId={1}
        serverName="Test Server"
        onClose={() => {}}
        entryType="library"
      />
    );
    expect(screen.getByText(/^Library/)).toBeTruthy();
  });

  it("renders title 'My Assets — {serverName}' when entryType is 'my-assets'", () => {
    render(
      <ServerFilesModal
        serverId={1}
        serverName="Test Server"
        onClose={() => {}}
        entryType="my-assets"
      />
    );
    expect(screen.getByText(/^My Assets/)).toBeTruthy();
  });
});
