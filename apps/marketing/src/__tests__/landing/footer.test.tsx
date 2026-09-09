import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/landing/footer";

describe("Footer", () => {
  it("renders '© 2026. Jory' copyright", () => {
    render(<Footer />);
    expect(screen.getByText("© 2026. Jory")).toBeInTheDocument();
  });

  it("links to the terms of service", () => {
    render(<Footer />);
    const terms = screen.getByRole("link", { name: /terms/i });
    expect(terms).toHaveAttribute("href", "/terms");
  });

  it("does not render placeholder social links", () => {
    const { container } = render(<Footer />);
    expect(
      screen.queryByRole("link", { name: /x\(twitter\)/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /github/i })
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll('a[href="#"]')).toHaveLength(0);
  });
});
