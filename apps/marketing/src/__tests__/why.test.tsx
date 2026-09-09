import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WhyPage from "@/app/why/page";

describe("WhyPage", () => {
  it("renders the H1", () => {
    render(<WhyPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /why we.re building jory/i,
      })
    ).toBeInTheDocument();
  });

  it("renders all five numbered point headings", () => {
    render(<WhyPage />);
    expect(
      screen.getByText(
        /jory turns how you run your business into written training/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/it.s agentic\. you mostly just chat/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/your team joins by text or the app/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/anyone can ask how the business is supposed to work/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/training becomes provable/i)).toBeInTheDocument();
  });

  it("renders the pull-quote text", () => {
    render(<WhyPage />);
    expect(
      screen.getByText(/the way your business runs shouldn.t live in/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/one person.s head\./i)).toBeInTheDocument();
  });

  it("renders an anchor phrase from each remaining section", () => {
    render(<WhyPage />);
    expect(screen.getByText(/you already have training/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /small teams pay the most for compliance/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /one system, five parts/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /proof, not paperwork/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /built for businesses that run on standards/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/a note from us/i)).toBeInTheDocument();
  });

  it("renders the closing CTA with How it works link and signup button", () => {
    render(<WhyPage />);
    const howItWorksLinks = screen.getAllByRole("link", {
      name: /how it works/i,
    });
    expect(
      howItWorksLinks.some(
        (link) => link.getAttribute("href") === "/how-it-works"
      )
    ).toBe(true);
    expect(
      screen.getAllByRole("button", { name: /get early access/i }).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("renders Nav and Footer", () => {
    render(<WhyPage />);
    expect(screen.getByLabelText(/jory home/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /terms of service/i })
    ).toBeInTheDocument();
  });
});
