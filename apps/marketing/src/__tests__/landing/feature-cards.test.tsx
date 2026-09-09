import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeatureCards } from "@/components/landing/feature-cards";

describe("FeatureCards", () => {
  it("renders section title", () => {
    render(<FeatureCards />);
    expect(screen.getByText(/train once/i)).toBeInTheDocument();
    expect(screen.getByText(/educate every shift/i)).toBeInTheDocument();
    expect(
      screen.getByText(/give every shift the same playbook/i)
    ).toBeInTheDocument();
  });

  it("renders all 3 card titles", () => {
    render(<FeatureCards />);
    expect(screen.getByText("Capture the standard")).toBeInTheDocument();
    expect(screen.getByText("Train the next hire")).toBeInTheDocument();
    expect(screen.getByText("Spot the gaps")).toBeInTheDocument();
  });

  it("renders 3 cards total", () => {
    render(<FeatureCards />);
    const cardHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(cardHeadings).toHaveLength(3);
  });
});
