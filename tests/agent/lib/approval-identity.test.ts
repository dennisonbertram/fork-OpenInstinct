import { describe, expect, it } from "vitest";
import {
  materialTermsFingerprint,
  resolveApprovalResume,
  type PendingApproval,
} from "@/agent/lib/approval-identity";

const orderTerms = {
  item: "Brake pads",
  kind: "place_order",
  merchant: "Parts Co",
  option: "Front axle",
  quantity: 2,
  total: "$84.00",
};

function authorized(
  overrides: Partial<Parameters<typeof materialTermsFingerprint>[0]> = {}
) {
  return materialTermsFingerprint({
    action: "place_order",
    origin: "https://parts.example",
    target_ref: "e7",
    target_token: "a".repeat(64),
    terms: orderTerms,
    ...overrides,
  });
}

function pending(fingerprint: string): PendingApproval {
  return {
    cohortId: "turn_1",
    fingerprint,
    objectiveRevision: "turn_1",
    requestId: "request_1",
    taskId: "task_1",
  };
}

describe("materialTermsFingerprint", () => {
  it("AP-01: is stable regardless of the key order a model happened to emit", () => {
    const reordered = {
      total: "$84.00",
      quantity: 2,
      option: "Front axle",
      merchant: "Parts Co",
      kind: "place_order",
      item: "Brake pads",
    };

    expect(authorized({ terms: reordered })).toBe(authorized());
  });

  it("AP-02: changes when any authorised material term changes", () => {
    const baseline = authorized();

    expect(authorized({ terms: { ...orderTerms, quantity: 3 } })).not.toBe(
      baseline
    );
    expect(
      authorized({ terms: { ...orderTerms, total: "$9,840.00" } })
    ).not.toBe(baseline);
    expect(authorized({ action: "delete" })).not.toBe(baseline);
    expect(authorized({ origin: "https://evil.example" })).not.toBe(baseline);
    expect(authorized({ target_ref: "e8" })).not.toBe(baseline);
    expect(authorized({ target_token: "b".repeat(64) })).not.toBe(baseline);
  });

  it("AP-03: is an opaque digest that carries no term material back out", () => {
    // Payment and vault exclusion is structural now: the contract declares only
    // action, origin, target and terms, so no caller can route secret-adjacent
    // values into the hash. What remains worth asserting is that the output
    // itself cannot be read back as the terms it summarises.
    const fingerprint = authorized();

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    // Only values long enough for the check to mean something: a single digit
    // like a quantity appears in any hex digest by chance.
    const substantial = Object.values(orderTerms)
      .map((value) => String(value))
      .filter((value) => value.length >= 4);
    expect(substantial.length).toBeGreaterThan(0);
    for (const material of substantial) {
      expect(fingerprint).not.toContain(material);
    }
    expect(fingerprint).not.toContain("parts.example");
  });
});

describe("materialTermsFingerprint collision resistance", () => {
  // Each of these was a real collision in the delimiter-joined encoding this
  // replaced, found by an outside review of that version.

  it("AP-08: a term value cannot forge a field boundary", () => {
    // Under a separator-joined encoding, a value containing the separator made
    // these two different actions hash identically.
    for (const separator of ["\u0000", "\u0001", "|", ","]) {
      const forged = authorized({
        terms: { item: `Brake pads${separator}merchant${separator}Evil Co` },
      });
      const honest = authorized({
        terms: { item: "Brake pads", merchant: "Evil Co" },
      });

      expect(forged).not.toBe(honest);
    }
  });

  it("AP-09: an absent target token differs from an empty one", () => {
    expect(authorized({ target_token: undefined })).not.toBe(
      authorized({ target_token: "" })
    );
  });

  it("AP-10: a count differs from the same digits as text", () => {
    expect(authorized({ terms: { ...orderTerms, quantity: 2 } })).not.toBe(
      authorized({ terms: { ...orderTerms, quantity: "2" } })
    );
  });

  it("AP-11: a lone surrogate is not folded onto the replacement character", () => {
    // UTF-8 encoding turns an unpaired surrogate into U+FFFD, so a raw
    // hash of the string would collide these two distinct values.
    expect(authorized({ terms: { item: "\uD800" } })).not.toBe(
      authorized({ terms: { item: "\uFFFD" } })
    );
  });

  it("AP-12: swapping which key holds which value changes the fingerprint", () => {
    expect(
      authorized({ terms: { item: "Brake pads", merchant: "Parts Co" } })
    ).not.toBe(
      authorized({ terms: { item: "Parts Co", merchant: "Brake pads" } })
    );
  });
});

describe("resolveApprovalResume", () => {
  it("AP-04: authorises only the matching request with unchanged terms", () => {
    const fingerprint = authorized();

    expect(
      resolveApprovalResume(pending(fingerprint), {
        fingerprint,
        requestId: "request_1",
        taskId: "task_1",
      })
    ).toEqual({ approval: pending(fingerprint), kind: "authorized" });
  });

  it("AP-05: a stale answer cannot authorise changed terms", () => {
    const fingerprint = authorized();

    expect(
      resolveApprovalResume(pending(fingerprint), {
        fingerprint: authorized({ terms: { ...orderTerms, quantity: 99 } }),
        requestId: "request_1",
        taskId: "task_1",
      })
    ).toEqual({ kind: "terms_changed" });
  });

  it("AP-06: an answer for another task does not authorise this one", () => {
    const fingerprint = authorized();

    expect(
      resolveApprovalResume(pending(fingerprint), {
        fingerprint,
        requestId: "request_1",
        taskId: "task_other",
      })
    ).toEqual({ kind: "wrong_task" });
  });

  it("AP-07: a plain new turn consumes no approval", () => {
    const fingerprint = authorized();

    // Nothing parked, and an answer for a different request, both yield the
    // same answer: there is no approval here to spend.
    expect(
      resolveApprovalResume(undefined, {
        fingerprint,
        requestId: "request_1",
        taskId: "task_1",
      })
    ).toEqual({ kind: "unknown" });
    expect(
      resolveApprovalResume(pending(fingerprint), {
        fingerprint,
        requestId: "request_from_an_older_turn",
        taskId: "task_1",
      })
    ).toEqual({ kind: "unknown" });
  });
});
