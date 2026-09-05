const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
import { describe, expect, it } from "vitest";
import {
  conversationCases,
  conversationFacts,
  gradeConversation,
  type ConversationTurnEvidence,
} from "@/evals/conversation/cases";
import { loadFixture } from "@/evals/square/fake/server";

function scenario(id: string) {
  const result = conversationCases.find((c) => c.id === id);
  if (!result) throw new Error(`Missing ${id}`);
  return result;
}
const evidence = (...messages: string[]): ConversationTurnEvidence[] =>
  messages.map((text) => ({
    text,
    messages: text ? [text] : [],
    toolCalls: text ? [{ name: "send_message", status: "completed" }] : [],
  }));
const passed = (id: string, turns: ConversationTurnEvidence[]) =>
  gradeConversation(scenario(id), turns).every((check) => check.pass);

describe("authored conversation manifest", () => {
  it("retains20 IDs and21variants for63 trials, with both auth states", () => {
    expect(conversationCases).toHaveLength(21);
    expect(new Set(conversationCases.map((c) => c.id)).size).toBe(20);
    expect(
      new Set(conversationCases.map((c) => `${c.id}/${c.variant}`)).size
    ).toBe(21);
    expect(conversationCases.length * 3).toBe(63);
    expect(
      conversationCases.filter((c) => c.id === "SQ-07").map((c) => c.fixture)
    ).toEqual(["disconnected", "revoked"]);
    for (const c of conversationCases) {
      expect(c.turns.length).toBeGreaterThanOrEqual(2);
      expect(c.expectations.length).toBeGreaterThan(0);
      expect(c.turns.every((turn) => turn.trim().length > 0)).toBe(true);
    }
  });
  it("never passes absent responses or missing final turns", () => {
    for (const c of conversationCases)
      expect(gradeConversation(c, []).some((check) => !check.pass)).toBe(true);
    expect(passed("CORE-08", evidence("102", "72"))).toBe(false);
  });
  it("checks exact formatting only when the user explicitly requests it", () => {
    expect(
      passed("CORE-08", evidence("That is 102", "9 times 8 is 72", "64"))
    ).toBe(true);
    expect(passed("CORE-08", evidence("102", "72", "It is64"))).toBe(false);
    expect(passed("CORE-08", evidence("1020", "72", "64"))).toBe(false);
  });
  it("accepts sentence punctuation but rejects a different integer or decimal", () => {
    expect(passed("CORE-08", evidence("102.", "72.", "64"))).toBe(true);
    expect(passed("CORE-08", evidence("102.5", "72.", "64"))).toBe(false);
    expect(passed("CORE-08", evidence("1102", "72.", "64"))).toBe(false);
  });
  it("leaves equivalent opening-time words to semantic grading", () => {
    expect(
      passed(
        "CORE-04",
        evidence(
          "What changed?",
          "Opening at ten instead of nine.",
          "Hi team, tomorrow we open at ten instead of nine."
        )
      )
    ).toBe(true);
  });
  it("counts an observed clarification without pretending it was a completed message", () => {
    const turns = evidence(
      "",
      "We open at ten instead of nine.",
      "Hi team, tomorrow we open at ten instead of nine."
    );
    turns[0] = {
      text: "",
      messages: [],
      toolCalls: [{ name: "ask_question", status: "pending" }],
      inputRequests: [
        { requestId: "question-1", prompt: "What's changing tomorrow?" },
      ],
    };
    expect(passed("CORE-04", turns)).toBe(true);
    turns[0] = {
      text: "",
      messages: [],
      toolCalls: [{ name: "ask_question", status: "pending" }],
    };
    expect(passed("CORE-04", turns)).toBe(false);
  });
  it("accepts a completed reaction to the CORE12 stop but not a failed reaction", () => {
    const turns = evidence(
      "Here is a cleanup plan.",
      "Here is your out-of-office draft.",
      ""
    );
    turns[2] = {
      text: "",
      messages: [],
      toolCalls: [{ name: "react_to_message", status: "completed" }],
    };
    expect(passed("CORE-12", turns)).toBe(true);
    turns[2] = {
      text: "",
      messages: [],
      toolCalls: [{ name: "react_to_message", status: "failed" }],
    };
    expect(passed("CORE-12", turns)).toBe(false);
  });
  it("accepts a completed reaction to SQ07 dismissal", () => {
    const turns = evidence(
      "Please connect Square.",
      "Square is not connected.",
      ""
    );
    turns[2] = {
      text: "",
      messages: [],
      toolCalls: [{ name: "react_to_message", status: "completed" }],
    };
    expect(passed("SQ-07", turns)).toBe(true);
  });
  it("allows completed email skill reads only for the email drafting scenario", () => {
    const turns = evidence(
      "Draft only",
      "alex@example.test: meeting draft",
      "Shorter draft only"
    );
    turns[0] = {
      text: "Draft only",
      messages: ["Draft only"],
      toolCalls: [
        { name: "load_skill", status: "completed", input: { skill: "email" } },
      ],
    };
    expect(passed("CORE-09", turns)).toBe(true);
    expect(passed("CORE-01", turns)).toBe(false);
    for (const call of [
      { name: "load_skill", status: "completed", input: { skill: "browser" } },
      { name: "load_skill", status: "pending", input: { skill: "email" } },
      { name: "load_skill", status: "failed", input: { skill: "email" } },
      {
        name: "profile__save_memory",
        status: "completed",
        input: { skill: "email" },
      },
    ]) {
      turns[0] = {
        text: "Draft only",
        messages: ["Draft only"],
        toolCalls: [call],
      };
      expect(passed("CORE-09", turns)).toBe(false);
    }
  });
  it("retains corrections and rejects obsolete final details", () => {
    expect(
      passed(
        "CORE-03",
        evidence("Draft", "Draft", "Lunch Thursday at12:30 at the office.")
      )
    ).toBe(true);
    expect(
      passed(
        "CORE-03",
        evidence("Draft", "Draft", "Lunch Friday at noon at the office.")
      )
    ).toBe(false);
  });
  it("requires a completed reaction and forbids a closing text in CORE07", () => {
    const turns = evidence("102", "");
    turns[1] = {
      text: "",
      messages: [],
      toolCalls: [{ name: "react_to_message", status: "completed" }],
    };
    expect(passed("CORE-07", turns)).toBe(true);
    turns[1] = {
      text: "",
      messages: [],
      toolCalls: [{ name: "react_to_message", status: "failed" }],
    };
    expect(passed("CORE-07", turns)).toBe(false);
  });
  it("detects attempted writes even when rejected", () => {
    const turns = evidence("102", "72", "64");
    turns[0] = {
      text: "102",
      messages: ["102"],
      toolCalls: [{ name: "square__RefundPayment", status: "failed" }],
    };
    expect(
      gradeConversation(scenario("CORE-08"), turns).find(
        (check) => check.name === "no Square writes attempted"
      )?.pass
    ).toBe(false);
  });
});

describe("fixture-derived conversation facts", () => {
  it("uses the default completed25-hour day and joins refunds by location", () => {
    const fixture = loadFixture();
    const facts = conversationFacts(fixture);
    expect(facts.gross).toBe(5575);
    expect(facts.refunds).toBe(525);
    expect(facts.net).toBe(5050);
    fixture.orders.push({
      id: "excluded-open",
      customerId: "CUST_ADA",
      locationId: fixture.location.id,
      state: "OPEN",
      quantity: 100,
      itemIndexes: [0, 1],
      createdAt: "2026-11-01T12:00:00Z",
    });
    expect(conversationFacts(fixture).gross).toBe(facts.gross);
    const firstItem = fixture.items[0];
    if (!firstItem) throw new Error("Missing item");
    firstItem.priceCents += 100;
    expect(conversationFacts(fixture).gross).not.toBe(facts.gross);
  });
  it("rejects wrong sales figures and accepts correctly derived amounts", () => {
    const f = conversationFacts();
    const turns = evidence(
      usd(f.gross),
      usd(f.airportGross),
      `Default Test Account ${usd(f.gross)}; Airport Test Counter ${usd(f.airportGross)}. Difference ${usd(f.difference)}.`
    );
    expect(passed("SQ-01", turns)).toBe(true);
    turns[1] = { text: "$999.99", messages: ["$999.99"], toolCalls: [] };
    expect(passed("SQ-01", turns)).toBe(false);
  });
  it("accepts a scoped comparison without repeating already stated totals", () => {
    const f = conversationFacts();
    expect(
      passed(
        "SQ-01",
        evidence(
          usd(f.gross),
          usd(f.airportGross),
          `Airport Test Counter differs from Default Test Account by ${usd(f.difference)}.`
        )
      )
    ).toBe(true);
  });
  it("accepts contextual leader units without repeating the item name", () => {
    const f = conversationFacts();
    const leader = f.ranking[0];
    if (!leader) throw new Error("No ranked fixture items");
    const runners = f.ranking.filter(([, units]) => units < leader[1]);
    const secondCount = runners[0]?.[1];
    const runnerText = runners
      .filter(([, units]) => units === secondCount)
      .map(([name, units]) => `${name} came second with ${String(units)}.`)
      .join(" ");
    const turns = evidence(
      leader[0],
      `We sold ${String(leader[1])}. ${runnerText}`,
      "You're welcome!"
    );
    expect(passed("SQ-03", turns)).toBe(true);
  });
  it("requires refund evidence, not only a plausible net amount", () => {
    const turns = evidence(
      "$55.75",
      "$50.50",
      "Gross $55.75; refunds $5.25; net $50.50"
    );
    expect(passed("SQ-02", turns)).toBe(false);
    turns[1] = {
      text: "$50.50",
      messages: ["$50.50"],
      toolCalls: [{ name: "square__ListPaymentRefunds", status: "completed" }],
    };
    expect(passed("SQ-02", turns)).toBe(true);
  });
});

it("counts only usable observed authorization challenges as response requests", () => {
  const c = conversationCases.find((item) => item.id === "SQ-07");
  if (!c) throw new Error("Missing SQ07");
  for (const authorization of [
    undefined,
    {},
    { url: "  " },
    { url: "https://example.invalid/auth" },
    { instructions: "Sign in" },
    { userCode: "SYNTHETIC" },
  ]) {
    const request = {
      name: "square",
      description: "Connect Square",
      turnId: "turn-0",
      stepIndex: 0,
      sequence: 0,
      authorization,
    };
    const turns = [1, 2, 3].map(() => ({
      text: "",
      messages: [],
      toolCalls: [],
      authorizationRequests: [request],
    }));
    const checks = gradeConversation(c, turns);
    const usable = [
      authorization?.url,
      authorization?.instructions,
      authorization?.userCode,
    ].some((value) => (value?.trim().length ?? 0) > 0);
    for (const turn of [1, 2])
      expect(
        checks.find(
          (check) =>
            check.name === `T${String(turn)}: response delivery requested`
        )?.pass
      ).toBe(usable);
  }
  const outcomesOnly = [
    {
      text: "",
      messages: [],
      toolCalls: [],
      authorizationOutcomes: [{ outcome: "authorized" }],
    },
  ];
  expect(
    gradeConversation(c, outcomesOnly).find(
      (check) => check.name === "T1: response delivery requested"
    )?.pass
  ).toBe(false);
});
