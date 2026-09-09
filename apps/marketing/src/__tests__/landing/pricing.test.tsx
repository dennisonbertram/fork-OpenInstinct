import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PricingPage from "@/app/pricing/page";

describe("PricingPage", () => {
  it("says Jory is free to use", () => {
    render(<PricingPage />);
    expect(screen.getAllByText(/free/i).length).toBeGreaterThan(0);
    expect(screen.getByText("$0")).toBeInTheDocument();
  });

  it("does not show paid tiers", () => {
    render(<PricingPage />);
    for (const price of ["$20", "$45", "$70"]) {
      expect(screen.queryByText(price)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/most popular/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sla/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/single sign-on/i)).not.toBeInTheDocument();
  });

  it("points to the terms of service", () => {
    render(<PricingPage />);
    const termsLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/terms");
    expect(termsLinks.length).toBeGreaterThan(0);
  });

  it("keeps a Get early access CTA", () => {
    render(<PricingPage />);
    expect(
      screen.getAllByRole("button", { name: /get early access/i }).length
    ).toBeGreaterThan(0);
  });
});
