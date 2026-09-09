import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WhyTeaser } from "@/components/landing/why-teaser";

describe("WhyTeaser", () => {
  it("renders the heading", () => {
    render(<WhyTeaser />);
    expect(
      screen.getByRole("heading", { name: /why we.re building jory/i })
    ).toBeInTheDocument();
  });

  it("renders a link to /why", () => {
    render(<WhyTeaser />);
    expect(
      screen.getByRole("link", { name: /read the inside look/i })
    ).toHaveAttribute("href", "/why");
  });
});
