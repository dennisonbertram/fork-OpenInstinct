import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UseCases } from "@/components/landing/use-cases";

describe("UseCases", () => {
  it("renders the cafe use case by default", () => {
    render(<UseCases />);
    expect(screen.getByText("Use cases")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cafes" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(
      screen.getByText(/new hires slow down service/i)
    ).toBeInTheDocument();
  });

  it("switches use-case detail when a different tab is selected", () => {
    render(<UseCases />);
    fireEvent.click(screen.getByRole("tab", { name: "Construction" }));
    expect(screen.getByRole("tab", { name: "Construction" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText(/site safety briefings/i)).toBeInTheDocument();
  });
});
