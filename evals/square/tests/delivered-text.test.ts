import { describe, expect, it } from "vitest";
import { deliveredText } from "../square.eval";

describe("Square delivery grading", () => {
  it("grades final delivery input without exposing its control flag", () => {
    expect(
      deliveredText([
        {
          name: "send_message",
          output: { kind: "message", text: "Your receipt is ready." },
          status: "completed",
          turnIndex: 0,
          input: {
            kind: "message",
            text: "Your receipt is ready.",
            final: true,
          },
        },
      ])
    ).toBe("Your receipt is ready.");
  });
});
