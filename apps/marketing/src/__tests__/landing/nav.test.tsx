import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Nav } from "@/components/landing/nav";

describe("Nav", () => {
  it("renders the JORY brand name", () => {
    render(<Nav />);
    expect(screen.getByText("JORY")).toBeInTheDocument();
  });

  it("renders exactly 6 nav links", () => {
    render(<Nav />);
    const links = [
      "Features",
      "How it works",
      "Pricing",
      "Security",
      "About",
      "Why we're building Jory",
    ];
    links.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("links the new entry to /why", () => {
    render(<Nav />);
    expect(
      screen.getByRole("link", { name: /why we.re building jory/i })
    ).toHaveAttribute("href", "/why");
  });

  it("renders a 'Get early access' CTA button", () => {
    render(<Nav />);
    expect(
      screen.getByRole("button", { name: /get early access/i })
    ).toBeInTheDocument();
  });
});
