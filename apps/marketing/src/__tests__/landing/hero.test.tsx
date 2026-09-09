import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/landing/hero";

describe("Hero", () => {
  it("renders training accountability headline", () => {
    render(<Hero />);
    expect(screen.getByText(/train your staff once/i)).toBeInTheDocument();
    expect(screen.getByText(/prove it every shift/i)).toBeInTheDocument();
  });

  it("renders deskless business copy", () => {
    render(<Hero />);
    expect(
      screen.getByText(/teach jory how your business should run/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/text-based training/i)).toBeInTheDocument();
    expect(screen.getAllByText(/signed proof/i).length).toBeGreaterThan(0);
  });

  it("does not claim Jory is free to use while access is gated", () => {
    render(<Hero />);
    expect(screen.queryByText(/free to use/i)).toBeNull();
  });

  it("renders primary 'Get early access' CTA button", () => {
    render(<Hero />);
    const signupButtons = screen.getAllByRole("button", {
      name: /get early access/i,
    });
    expect(signupButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("links 'See how it works' to the how-it-works page", () => {
    render(<Hero />);
    const cta = screen.getByRole("link", { name: /see how it works/i });
    expect(cta).toHaveAttribute("href", "/how-it-works");
  });

  it("renders all 4 feature row titles", () => {
    render(<Hero />);
    expect(screen.getByText("Onboard without bottlenecks")).toBeInTheDocument();
    expect(screen.getByText("Know who is ready")).toBeInTheDocument();
    expect(screen.getByText("Fix repeat mistakes")).toBeInTheDocument();
    expect(screen.getByText("Keep every location aligned")).toBeInTheDocument();
  });
});
