import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import UrlPreviewCard from "./UrlPreviewCard";

describe("UrlPreviewCard", () => {
  it("renders title as a link to the URL with correct attributes", () => {
    render(
      <UrlPreviewCard
        title="Example Page"
        url="https://example.com"
        summary="A summary of the page content."
      />
    );

    const link = screen.getByTestId("url-preview-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent("Example Page");
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("displays summary truncated to 200 characters", () => {
    const longSummary = "A".repeat(250);
    render(
      <UrlPreviewCard
        title="Long Content"
        url="https://example.com"
        summary={longSummary}
      />
    );

    const summary = screen.getByTestId("url-preview-summary");
    expect(summary).toBeInTheDocument();
    expect(summary.textContent!.length).toBeLessThanOrEqual(202); // 200 + ellipsis char
    expect(summary.textContent!.endsWith("…")).toBe(true);
  });

  it("renders globe icon when no favicon provided", () => {
    render(
      <UrlPreviewCard
        title="No Favicon"
        url="https://example.com"
      />
    );

    const card = screen.getByTestId("url-preview-card");
    expect(card).toBeInTheDocument();
    // Should contain an SVG (Globe icon) since no favicon
    const svg = card.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("renders favicon image when provided", () => {
    render(
      <UrlPreviewCard
        title="With Favicon"
        url="https://example.com"
        favicon="https://example.com/favicon.ico"
      />
    );

    const img = screen.getByAltText("");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/favicon.ico");
  });

  it("displays the URL text at the bottom", () => {
    render(
      <UrlPreviewCard
        title="Test"
        url="https://example.com/page"
      />
    );

    expect(screen.getByText("https://example.com/page")).toBeInTheDocument();
  });

  it("uses URL as title when title is empty", () => {
    render(
      <UrlPreviewCard
        title=""
        url="https://example.com"
      />
    );

    const link = screen.getByTestId("url-preview-link");
    expect(link).toHaveTextContent("https://example.com");
  });

  it("does not render summary paragraph when summary is not provided", () => {
    render(
      <UrlPreviewCard
        title="No Summary"
        url="https://example.com"
      />
    );

    const summary = screen.queryByTestId("url-preview-summary");
    expect(summary).toBeNull();
  });
});
