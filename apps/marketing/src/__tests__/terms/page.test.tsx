import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TermsPage, { metadata } from "@/app/terms/page";

describe("TermsPage", () => {
  it("renders the terms of service", () => {
    render(<TermsPage />);
    expect(
      screen.getByRole("heading", { name: /terms of service/i, level: 1 })
    ).toBeInTheDocument();
    expect(String(metadata.title)).toMatch(/terms/i);
  });

  it("discloses that content may be used to train and improve models", () => {
    render(<TermsPage />);
    expect(screen.getAllByText(/train and improve/i).length).toBeGreaterThan(0);
  });

  it("says the service is free", () => {
    render(<TermsPage />);
    expect(screen.getAllByText(/free/i).length).toBeGreaterThan(0);
  });
});
