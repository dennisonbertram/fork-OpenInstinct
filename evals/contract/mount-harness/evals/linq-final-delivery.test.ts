import { describe, expect, it } from "vitest";
import {
  assertProviderState,
  matchesProviderState,
  type ProviderState,
} from "./linq-final-delivery.eval";

const baseState: ProviderState = {
  counts: {
    aborted: 0,
    acknowledged: 1,
    attempts: 1,
    duplicateAttempts: 0,
    pending: 0,
    rejected: 0,
    requests: 1,
    waiters: 0,
  },
  deliveries: [],
  notices: [],
};

describe("linq final delivery provider state matcher", () => {
  it("matches when waiters equal zero", () => {
    expect(matchesProviderState(baseState, { waiters: 0 })).toBe(true);
  });

  it("matches when waiters equal a positive count", () => {
    const state: ProviderState = {
      ...baseState,
      counts: { ...baseState.counts, waiters: 3 },
    };
    expect(matchesProviderState(state, { waiters: 3 })).toBe(true);
  });

  it("rejects mismatching waiters", () => {
    const state: ProviderState = {
      ...baseState,
      counts: { ...baseState.counts, waiters: 2 },
    };
    expect(matchesProviderState(state, { waiters: 0 })).toBe(false);
  });

  it("accepts omitted waiter expectations", () => {
    const state: ProviderState = {
      ...baseState,
      counts: { ...baseState.counts, waiters: 5 },
    };
    expect(matchesProviderState(state, { acknowledged: 1 })).toBe(true);
  });

  it("asserts zero waiters", () => {
    expect(() => {
      assertProviderState(baseState, { waiters: 0 });
    }).not.toThrow();
  });

  it("throws when asserting mismatched waiters", () => {
    const state: ProviderState = {
      ...baseState,
      counts: { ...baseState.counts, waiters: 1 },
    };
    expect(() => {
      assertProviderState(state, { waiters: 0 });
    }).toThrow("Contract provider state did not match");
  });
});
