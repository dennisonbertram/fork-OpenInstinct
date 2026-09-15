import { describe, expect, it } from "vitest";

import {
  ONBOARDING_BETA_AND_STOP,
  ONBOARDING_CAPABILITY_EXAMPLES,
  ONBOARDING_EXAMPLE_CARDS,
  ONBOARDING_INTRO,
  ONBOARDING_RATE_LIMITED,
  ONBOARDING_RECOVERY,
  ONBOARDING_WELCOME,
} from "@/agent/lib/onboarding/messages";

const messages = [
  ONBOARDING_WELCOME,
  ONBOARDING_INTRO,
  ONBOARDING_CAPABILITY_EXAMPLES,
  ONBOARDING_BETA_AND_STOP,
  ONBOARDING_RECOVERY,
  ONBOARDING_RATE_LIMITED,
];

describe("text-first onboarding messages", () => {
  it("provides bounded copy without website signup, account, or booking claims", () => {
    for (const message of messages) {
      expect(message).toBeTypeOf("string");
      expect(message.trim()).not.toBe("");
      expect(Number.isFinite(message.length)).toBe(true);
      expect(message.length).toBeLessThanOrEqual(240);
      expect(message).not.toMatch(/\b(join|otp|one[- ]time password)\b/i);
      expect(message).not.toMatch(/\b(sign ?up|website|web)\b/i);
      expect(message).not.toMatch(
        /\b(connected accounts?|booking|book a flight)\b/i
      );
    }
  });

  it("keeps the approved welcome, examples, beta, and recovery intent", () => {
    expect(ONBOARDING_WELCOME).toBe("You’re in! 🎉");
    expect(ONBOARDING_INTRO).toBe(
      "Welcome! I’m Jory. I help you run your small business, right here in Messages."
    );
    expect(ONBOARDING_CAPABILITY_EXAMPLES).toMatch(
      /Square.*stock.*deliveries/i
    );
    expect(ONBOARDING_BETA_AND_STOP).toMatch(/beta/i);
    expect(ONBOARDING_BETA_AND_STOP).toMatch(/STOP/);
    expect(ONBOARDING_RECOVERY).toMatch(/try again later/i);
    expect(ONBOARDING_RATE_LIMITED).toMatch(/try again later/i);
  });

  it("marks capability examples as illustrations, not live results", () => {
    expect(ONBOARDING_CAPABILITY_EXAMPLES).toMatch(/daily sales/i);
    expect(ONBOARDING_CAPABILITY_EXAMPLES).toMatch(/low stock/i);
    expect(ONBOARDING_CAPABILITY_EXAMPLES).toMatch(/deliver/i);
    expect(ONBOARDING_CAPABILITY_EXAMPLES).toMatch(/illustration/i);
    expect(ONBOARDING_CAPABILITY_EXAMPLES).toMatch(/not live results/i);
    expect(ONBOARDING_CAPABILITY_EXAMPLES).toMatch(/amounts/i);
    expect(ONBOARDING_CAPABILITY_EXAMPLES).not.toMatch(/disconnect/i);
    expect(ONBOARDING_CAPABILITY_EXAMPLES).not.toMatch(/your Square/i);
    expect(ONBOARDING_CAPABILITY_EXAMPLES).not.toMatch(
      /\b(caption|label|watermark|footer|image \d+)\b/i
    );
  });
  it("keeps three clearly illustrative small-business example cards", () => {
    expect(ONBOARDING_EXAMPLE_CARDS).toHaveLength(3);
    for (const card of ONBOARDING_EXAMPLE_CARDS) {
      expect(card).not.toHaveProperty("label");
      expect(card.conversation).toHaveLength(4);
      for (const { text } of card.conversation) {
        expect(text.trim()).not.toBe("");
        expect(Number.isFinite(text.length)).toBe(true);
        expect(text.length).toBeLessThanOrEqual(180);
        expect(text).not.toMatch(
          /\b(booking|book a flight|existing Square|purchased|purchase)\b/i
        );
      }
    }
    expect(ONBOARDING_EXAMPLE_CARDS.map(({ title }) => title)).toEqual([
      "Daily sales",
      "Low stock",
      "Receiving a delivery",
    ]);
    expect(ONBOARDING_EXAMPLE_CARDS[1].conversation[3].text).toMatch(
      /Milk[\s\S]*quantity[\s\S]*Cups[\s\S]*quantity[\s\S]*Lids[\s\S]*quantity[\s\S]*confirm[\s\S]*quantities[\s\S]*before placing an order/i
    );
    expect(ONBOARDING_EXAMPLE_CARDS[2].conversation[3].text).toMatch(
      /draft.*supplier message.*review/i
    );
  });
});
