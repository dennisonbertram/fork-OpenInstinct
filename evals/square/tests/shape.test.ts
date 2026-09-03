import { describe, expect, it } from "vitest";
import { bubbleGate, dollars } from "@/evals/square/shape";

describe("dollars", () => {
  it("formats 875 cents as $8.75", () => {
    expect(dollars(875)).toBe("$8.75");
  });

  it("formats 6300 cents as $63.00", () => {
    expect(dollars(6300)).toBe("$63.00");
  });
});

describe("bubbleGate", () => {
  it("passes a normal layout at 2 bubbles", () => {
    const reply = "Paragraph one.\n\nParagraph two.";

    const result = bubbleGate(reply, "normal");

    expect(result).toEqual({ bubbles: 2, ok: true });
  });

  it("soft-warns a normal layout at exactly 3 bubbles", () => {
    const reply = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";

    const result = bubbleGate(reply, "normal");

    expect(result).toEqual({
      bubbles: 3,
      note: "3 bubbles (soft warn)",
      ok: true,
    });
  });

  it("fails a normal layout at 4+ bubbles", () => {
    const reply =
      "Paragraph one.\n\nParagraph two.\n\nParagraph three.\n\nParagraph four.";

    const result = bubbleGate(reply, "normal");

    expect(result).toEqual({
      bubbles: 4,
      note: "4 bubbles (over the limit)",
      ok: false,
    });
  });

  it("passes a list layout at 3 bubbles", () => {
    const reply = "- item one\n- item two\n- item three";

    const result = bubbleGate(reply, "list");

    expect(result).toEqual({ bubbles: 3, ok: true });
  });

  it("passes a 4+ list layout that states a count and offers the rest", () => {
    const reply =
      "- item one\n- item two\n- item three\n- item four\n\nWe have 4 items. Want the rest?";

    const result = bubbleGate(reply, "list");

    expect(result.ok).toBe(true);
    expect(result.bubbles).toBeGreaterThan(3);
    expect(result.note).toBeUndefined();
  });

  it("fails a 4+ list layout lacking a count and an offer", () => {
    const reply = "- item one\n- item two\n- item three\n- item four";

    const result = bubbleGate(reply, "list");

    expect(result).toEqual({
      bubbles: 4,
      note: "list reply lacks a count and an offer",
      ok: false,
    });
  });
});
