import { describe, expect, it } from "vitest";
import { splitLinqReply } from "../reply";

describe("splitLinqReply", () => {
  it("splits a four-paragraph invoice reply into 4 bubbles", () => {
    const message = [
      "Yes. You have 1 unpaid invoice:",
      "Margaret Hamilton owes $63.00",
      "Invoice #000001",
      "Due September 16",
    ].join("\n\n");

    expect(splitLinqReply(message)).toHaveLength(4);
  });

  it("splits a block of three bullet lines into 3 bubbles", () => {
    const message = ["- one", "- two", "- three"].join("\n");

    expect(splitLinqReply(message)).toEqual(["- one", "- two", "- three"]);
  });

  it("does not join words across a line break inside a non-list block", () => {
    const message = "To: margaret@example.com\nSubject: Reminder";

    const bubbles = splitLinqReply(message);

    expect(bubbles).toHaveLength(1);
    // Linq's markdown renderer drops a raw "\n" with no separator, so a
    // bubble that still contains one collapses into "comSubject" on-device.
    expect(bubbles[0]).not.toContain("\n");
    expect(bubbles[0]).not.toContain("comSubject");
  });

  it("separates tokens across a line break in a short block", () => {
    const message = "Best,\nDennison";

    const bubbles = splitLinqReply(message);

    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]).not.toContain("\n");
    expect(bubbles[0]).not.toContain("Best,Dennison");
  });

  it("returns zero bubbles for an empty string", () => {
    expect(splitLinqReply("")).toEqual([]);
  });
});
