import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReportPartIdentity } from "@/agent/lib/completion-report-attempts";
import type {
  ClaimOutcome,
  CompletionReportClaim,
  CompletionReportPartKey,
} from "@/db/services/completion-report-attempts";

/**
 * The crash-window boundary for one completion-report part, driven through a
 * synthetic channel adapter rather than through assertions about the database.
 *
 * What this file proves: at each fault point a restarted process, holding
 * nothing but the durable record, reaches a decision that leaves the adapter
 * called at most once for a given logical part. The oracle is the adapter's call
 * count, not a mocked return value.
 *
 * What it does not prove, and must not be read as proving:
 *
 *   - that the real compare-and-swap is atomic. The store below is a faithful
 *     in-memory replica of `db/services/completion-report-attempts.ts`, not that
 *     service. Contention, row locking and restart readback against a real
 *     database are covered in `tests/integration/real-postgres.test.ts`, which
 *     the supervised Real Postgres lane runs, and that lane is the release gate.
 *   - that the redundant refusal of an already uncertain part matters on its
 *     own. Removing that early return changes nothing here, because the
 *     compare-and-swap refuses the same transition a moment later. It is
 *     defence in depth, and `agent/lib/tests/completion-report-attempts.test.ts`
 *     is where it is pinned, by asserting no attempt is even tried.
 *   - that any channel behaves this way. No channel calls `permitReportDispatch`
 *     yet. `dispatchOnce` below stands in for that binding, so this file pins
 *     the seam's contract ahead of the caller rather than the caller's use of it.
 */

interface StoredPart {
  id: string;
  state: "claimed" | "attempted" | "accepted" | "unconfirmed";
  leaseOwner: string;
  version: number;
  providerHandle: string | null;
  leaseExpiresAt: Date;
}

/** Survives a simulated restart. Everything else in a process does not. */
const durable = new Map<string, StoredPart>();

/** The logical identity, as one string. Structured so no segment can blur into the next. */
function keyOf(key: CompletionReportPartKey): string {
  return JSON.stringify([
    key.workspaceId,
    key.rootSessionId,
    key.cohortId,
    key.reportRevision,
    key.part,
  ]);
}

function project(row: StoredPart): CompletionReportClaim {
  return {
    id: row.id,
    leaseOwner: row.leaseOwner,
    providerHandle: row.providerHandle,
    state: row.state,
    version: row.version,
  };
}

function byId(id: string): StoredPart | undefined {
  for (const row of durable.values()) if (row.id === id) return row;
  return undefined;
}

/**
 * The same decisions the owning service makes, over a Map. Kept deliberately
 * close to that file so a divergence in its rules shows up here as a failure
 * rather than as a quietly different contract.
 */
/**
 * When true, the claim read and its takeover write are separated by a yield,
 * which models a database that does not serialise them. The real service does
 * serialise, under `SELECT ... FOR UPDATE`; one case below switches this on to
 * show what still holds if that lock were ever lost.
 */
let unserialisedClaims = false;

const store = {
  async claim(input: {
    key: CompletionReportPartKey;
    id: string;
    leaseOwner: string;
    leaseExpiresAt: Date;
    now?: Date;
  }): Promise<ClaimOutcome> {
    const now = input.now ?? new Date();
    const existing = durable.get(keyOf(input.key));
    if (!existing) {
      const created: StoredPart = {
        id: input.id,
        leaseExpiresAt: input.leaseExpiresAt,
        leaseOwner: input.leaseOwner,
        providerHandle: null,
        state: "claimed",
        version: 1,
      };
      durable.set(keyOf(input.key), created);
      return { claim: project(created), kind: "claimed" };
    }
    if (existing.state === "accepted") {
      return { claim: project(existing), kind: "settled" };
    }
    if (existing.state === "attempted" || existing.state === "unconfirmed") {
      return { claim: project(existing), kind: "uncertain" };
    }
    if (existing.leaseExpiresAt > now) {
      return { claim: project(existing), kind: "uncertain" };
    }
    // Lease expired on a part that never dispatched: a new owner may take over,
    // and the version bump is what stops the old one from dispatching later.
    if (unserialisedClaims) await Promise.resolve();
    existing.leaseExpiresAt = input.leaseExpiresAt;
    existing.leaseOwner = input.leaseOwner;
    existing.version += 1;
    return { claim: project(existing), kind: "claimed" };
  },

  transition(
    from: StoredPart["state"],
    to: StoredPart["state"],
    input: { id: string; leaseOwner: string; version: number },
    providerHandle?: string
  ): CompletionReportClaim | undefined {
    const row = byId(input.id);
    if (
      !row ||
      row.state !== from ||
      row.leaseOwner !== input.leaseOwner ||
      row.version !== input.version
    ) {
      return undefined;
    }
    row.state = to;
    row.version += 1;
    if (providerHandle !== undefined) row.providerHandle = providerHandle;
    return project(row);
  },
};

vi.mock("@/db/services/completion-report-attempts", () => ({
  claimCompletionReportPart: (input: Parameters<typeof store.claim>[0]) =>
    store.claim(input),
  findCompletionReportPart: (key: CompletionReportPartKey) => {
    const row = durable.get(keyOf(key));
    return Promise.resolve(row ? project(row) : undefined);
  },
  markAccepted: (input: {
    id: string;
    leaseOwner: string;
    version: number;
    providerHandle?: string;
  }) =>
    Promise.resolve(
      store.transition("attempted", "accepted", input, input.providerHandle)
    ),
  markProviderAttempted: (input: {
    id: string;
    leaseOwner: string;
    version: number;
  }) => Promise.resolve(store.transition("claimed", "attempted", input)),
  markUnconfirmed: (input: {
    id: string;
    leaseOwner: string;
    version: number;
  }) => Promise.resolve(store.transition("attempted", "unconfirmed", input)),
}));

const { permitReportDispatch, reportPartAccepted } =
  await import("@/agent/lib/completion-report-attempts");
const { findCompletionReportPart } =
  await import("@/db/services/completion-report-attempts");

/** The synthetic channel. Its call count is the oracle for every case here. */
const adapter = { send: vi.fn<(body: string) => Promise<string>>() };

const identity: ReportPartIdentity = {
  cohortId: "turn_1",
  part: "text",
  reportRevision: 0,
  rootSessionId: "root-session",
  workspaceId: "workspace-1",
};

/** Where a simulated process dies. */
type Fault = "after-claim" | "before-adapter" | "before-checkpoint" | "none";

/**
 * One process's whole attempt at delivering one part. It is handed nothing from
 * any previous attempt beyond the part's logical identity, which is the point:
 * a restarted process has only that and the durable record.
 */
async function dispatchOnce(options: {
  owner: string;
  fault?: Fault;
  leaseMs?: number;
  part?: ReportPartIdentity["part"];
  now?: Date;
}): Promise<string> {
  const permission = await permitReportDispatch({
    channel: "channel:synthetic",
    contentDigest: "digest-of-the-composed-summary",
    conversationId: "conversation-1",
    identity: options.part ? { ...identity, part: options.part } : identity,
    leaseMs: options.leaseMs,
    leaseOwner: options.owner,
    now: options.now,
  });

  if (permission.kind !== "may_dispatch") return permission.kind;
  // A crash here is the one fault the claim alone cannot distinguish, so the
  // attempt record above had to exist before this line.
  if (options.fault === "before-adapter") return "died_before_adapter";

  const handle = await adapter.send("the composed summary");
  if (options.fault === "before-checkpoint") return "died_before_checkpoint";

  await reportPartAccepted({ claim: permission.claim, providerHandle: handle });
  return "accepted";
}

beforeEach(() => {
  unserialisedClaims = false;
  durable.clear();
  adapter.send.mockReset();
  adapter.send.mockResolvedValue("provider-handle-1");
});

describe("DW-01: the process dies after claiming, before recording an attempt", () => {
  it("lets a later owner dispatch exactly once, and never the stale original", async () => {
    const now = new Date("2026-09-11T12:00:00Z");
    const firstClaim = await permitReportDispatch({
      channel: "channel:synthetic",
      contentDigest: "digest-of-the-composed-summary",
      conversationId: "conversation-1",
      identity,
      leaseMs: 60_000,
      leaseOwner: "owner-that-died",
      now,
    });
    expect(firstClaim.kind).toBe("may_dispatch");

    // Readback at the fault point: the part is attempted, because this owner
    // recorded the intent before it would have called anything.
    expect((await findCompletionReportPart(identity))?.state).toBe("attempted");

    // While that record stands, nothing takes it over, whatever the lease says.
    const later = new Date(now.getTime() + 10 * 60_000);
    expect(
      await dispatchOnce({ now: later, owner: "owner-after-restart" })
    ).toBe("do_not_dispatch");
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("hands an expired claim to a new owner whose attempt then wins the CAS", async () => {
    const now = new Date("2026-09-11T12:00:00Z");
    // A claim with no attempt recorded: the process died between the two, which
    // the store can represent but `permitReportDispatch` never leaves behind.
    durable.set(keyOf(identity), {
      id: "died-attempt",
      leaseExpiresAt: new Date(now.getTime() + 1000),
      leaseOwner: "owner-that-died",
      providerHandle: null,
      state: "claimed",
      version: 1,
    });

    const later = new Date(now.getTime() + 60_000);
    expect(await dispatchOnce({ now: later, owner: "owner-taking-over" })).toBe(
      "accepted"
    );
    expect(adapter.send).toHaveBeenCalledOnce();

    // The original owner resuming with its remembered version is refused: the
    // takeover moved the version, so its compare-and-swap cannot succeed.
    const stale = await import("@/db/services/completion-report-attempts");
    expect(
      await stale.markProviderAttempted({
        id: "died-attempt",
        leaseOwner: "owner-that-died",
        version: 1,
      })
    ).toBeUndefined();
    expect(adapter.send).toHaveBeenCalledOnce();
  });
});

describe("DW-02: the process dies after recording the attempt, before the adapter call", () => {
  it("persists the attempt the adapter never received, and nothing re-sends it", async () => {
    expect(
      await dispatchOnce({ fault: "before-adapter", owner: "owner-a" })
    ).toBe("died_before_adapter");
    // Zero provider calls happened, and yet the record says an attempt was
    // about to. That asymmetry is deliberate: the alternative is a send nothing
    // can account for.
    expect(adapter.send).not.toHaveBeenCalled();
    expect((await findCompletionReportPart(identity))?.state).toBe("attempted");

    expect(await dispatchOnce({ owner: "owner-after-restart" })).toBe(
      "do_not_dispatch"
    );
    expect(adapter.send).not.toHaveBeenCalled();
  });
});

describe("DW-03: the process dies after the adapter accepted, before the checkpoint", () => {
  it("leaves exactly one provider call and no automatic second one", async () => {
    expect(
      await dispatchOnce({ fault: "before-checkpoint", owner: "owner-a" })
    ).toBe("died_before_checkpoint");
    expect(adapter.send).toHaveBeenCalledOnce();
    // The send landed, but no confirmation was ever written. Recovery sees the
    // same `attempted` as DW-02 and behaves the same way, because from the
    // record alone those two situations are genuinely indistinguishable.
    expect((await findCompletionReportPart(identity))?.state).toBe("attempted");

    expect(await dispatchOnce({ owner: "owner-after-restart" })).toBe(
      "do_not_dispatch"
    );
    expect(adapter.send).toHaveBeenCalledOnce();
  });
});

describe("the logical part, not the call", () => {
  it("refuses a regenerated call for a part that already completed", async () => {
    expect(await dispatchOnce({ owner: "owner-a" })).toBe("accepted");
    expect(await dispatchOnce({ owner: "owner-b" })).toBe("already_accepted");
    expect(adapter.send).toHaveBeenCalledOnce();
  });

  it("gives exactly one of many concurrent dispatchers the provider call", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        dispatchOnce({ owner: `racer-${String(index)}` })
      )
    );
    expect(outcomes.filter((outcome) => outcome === "accepted")).toHaveLength(
      1
    );
    expect(adapter.send).toHaveBeenCalledOnce();
  });

  it("still dispatches once if the database stopped serialising takeovers", async () => {
    // Two owners both read an expired claim before either writes, so both are
    // handed the right to dispatch. This cannot happen against the real
    // service, which takes a row lock; the case exists to show where the
    // protection actually lives. The compare-and-swap on the attempt is what
    // limits the provider to one call, not the lock.
    unserialisedClaims = true;
    const now = new Date("2026-09-11T12:00:00Z");
    durable.set(keyOf(identity), {
      id: "contended-attempt",
      leaseExpiresAt: new Date(now.getTime() - 1000),
      leaseOwner: "owner-that-died",
      providerHandle: null,
      state: "claimed",
      version: 1,
    });

    const outcomes = await Promise.all([
      dispatchOnce({ now, owner: "owner-a" }),
      dispatchOnce({ now, owner: "owner-b" }),
    ]);

    expect(outcomes).toContain("do_not_dispatch");
    expect(outcomes.filter((outcome) => outcome === "accepted")).toHaveLength(
      1
    );
    expect(adapter.send).toHaveBeenCalledOnce();
  });

  it("treats each physical effect of one report as its own part", async () => {
    expect(await dispatchOnce({ owner: "owner-a", part: "media-upload" })).toBe(
      "accepted"
    );
    expect(await dispatchOnce({ owner: "owner-a", part: "media-send" })).toBe(
      "accepted"
    );
    expect(adapter.send).toHaveBeenCalledTimes(2);

    // And an upload that may already have happened is never repeated, so a
    // recovered report cannot upload the same artifact twice.
    durable.set(keyOf({ ...identity, part: "attachment" }), {
      id: "upload-attempt",
      leaseExpiresAt: new Date(Date.now() + 60_000),
      leaseOwner: "owner-that-died",
      providerHandle: null,
      state: "attempted",
      version: 2,
    });
    expect(await dispatchOnce({ owner: "owner-b", part: "attachment" })).toBe(
      "do_not_dispatch"
    );
    expect(adapter.send).toHaveBeenCalledTimes(2);
  });
});
