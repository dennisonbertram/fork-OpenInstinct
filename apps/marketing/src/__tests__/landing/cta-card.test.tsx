import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CtaCard } from "@/components/landing/cta-card";

describe("CtaCard", () => {
  it("renders 'No app.' headline", () => {
    render(<CtaCard />);
    expect(screen.getByText("No app.")).toBeInTheDocument();
  });

  it("renders 'Just text.' headline", () => {
    render(<CtaCard />);
    expect(screen.getByText("Just text.")).toBeInTheDocument();
  });

  it("renders tighter CTA copy", () => {
    render(<CtaCard />);
    expect(
      screen.getByRole("heading", { level: 3, name: /try it with your team/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/meet your team where they already are/i)
    ).toBeInTheDocument();
  });

  it("renders phone mockup chat bubbles", () => {
    render(<CtaCard />);
    expect(
      screen.getByText("Did Maya sign the phone policy?")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/signed yesterday.*barista basics/i)
    ).toBeInTheDocument();
  });

  it("invites early-access signup instead of a free-to-use claim", () => {
    render(<CtaCard />);
    expect(
      screen.getByText(
        /leave your email and we'll let you know when it's your turn/i
      )
    ).toBeInTheDocument();
  });

  it("renders 'Get early access' CTA button", () => {
    render(<CtaCard />);
    expect(
      screen.getByRole("button", { name: /get early access/i })
    ).toBeInTheDocument();
  });
});
