import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DynamicResolveContext } from "eve/instructions";

const state = vi.hoisted(() => {
  const resets: (() => void)[] = [];
  return {
    resets,
    // The framework's own projection of background tasks. Controllable so a
    // terminal can exist HERE and nowhere else, which is the only way to prove
    // the resolver reconciles before it projects.
    // SAFETY: these stand in for Eve's own task projections, which the mock
    // below returns verbatim. Each case assigns records already shaped like
    // BackgroundTaskMember / BackgroundTaskTerminal, and the production reader
    // validates every entry against its schema before use, so an ill-shaped
    // entry is dropped rather than trusted.
    taskMembers: [] as unknown[],
    // SAFETY: as above -- the mock returns this verbatim and the production
    // reader validates each entry against its schema before trusting it.
    taskTerminals: [] as unknown[],
  };
});

vi.mock("eve/context", () => ({
  defineState: <T>(_name: string, initial: () => T) => {
    let value = initial();
    state.resets.push(() => {
      value = initial();
    });
    return {
      get: () => value,
      update: (update: (current: T) => T) => {
        value = update(value);
      },
    };
  },
  readBackgroundTaskMembers: () => state.taskMembers,
  readBackgroundTaskTerminals: () => state.taskTerminals,
}));

import completionEvidence from "@/agent/instructions/35-completion-evidence";
import { admitTask, recordTerminal } from "@/agent/lib/completion-obligations";

beforeEach(() => {
  for (const reset of state.resets) reset();
  state.taskMembers = [];
  state.taskTerminals = [];
});

/** Settles one task with the given facts, admitting it into `turnId`'s cohort. */
function settle(
  taskId: string,
  turnId: string,
  facts: {
    claim: string;
    evidence: "observed" | "worker_assertion" | "unknown";
  }[]
) {
  admitTask({ objectiveRevision: turnId, parentTurnId: turnId, taskId });
  recordTerminal(
    {
      childSessionId: `${taskId}_session`,
      parentTurnId: turnId,
      status: "completed",
      taskId,
      workerName: "worker",
    },
    facts
  );
}

function context(authenticator = "linq"): DynamicResolveContext {
  return {
    channel: { kind: "channel:linq" },
    messages: [],
    session: {
      auth: {
        current: {
          attributes: {},
          authenticator,
          principalId: "user-1",
          principalType: "user",
        },
        initiator: null,
      },
      id: "session-1",
    },
  } satisfies DynamicResolveContext;
}

async function resolve(turnId: string, authenticator = "linq") {
  const resolver = completionEvidence.events["turn.started"];
  if (!resolver) throw new Error("Missing turn.started resolver");
  return resolver({ data: { turnId } }, context(authenticator));
}

describe("completion evidence instruction", () => {
  it("CE-01: a later turn still receives a delivered cohort's claims, with provenance", async () => {
    settle("task_a", "turn_1", [
      {
        claim: "Opened example.com and read the heading.",
        evidence: "observed",
      },
    ]);

    const selected = await resolve("turn_2");

    expect(selected?.content).toContain(
      'Claim: "Opened example.com and read the heading." (confirmed)'
    );
    // Not this turn's own work -- labelled as prior, not current.
    expect(selected?.content).toContain("Prior work already reported");
  });

  it("CE-02: an observed claim and a worker-asserted claim on the same task stay separately attributed", async () => {
    settle("task_a", "turn_1", [
      { claim: "A screenshot shows the receipt.", evidence: "observed" },
      {
        claim: "The worker said the order was placed.",
        evidence: "worker_assertion",
      },
    ]);

    const selected = await resolve("turn_2");
    const content = selected?.content ?? "";

    expect(content).toContain(
      'Claim: "A screenshot shows the receipt." (confirmed)'
    );
    expect(content).toContain(
      'Claim: "The worker said the order was placed." (reported by the worker, not confirmed)'
    );
  });

  it("CE-03: an uncorroborated claim whose own text says 'verified' is still labelled worker-reported", async () => {
    settle("task_a", "turn_1", [
      {
        claim: "The page was verified successfully.",
        evidence: "worker_assertion",
      },
    ]);

    const selected = await resolve("turn_2");

    expect(selected?.content).toContain(
      'Claim: "The page was verified successfully." (reported by the worker, not confirmed)'
    );
    expect(selected?.content).not.toContain(
      'Claim: "The page was verified successfully." (confirmed)'
    );
  });

  it("CE-04: nothing settled contributes no instruction text", async () => {
    expect(await resolve("turn_empty")).toBeNull();

    // An admitted-but-unsettled task is still not settled work.
    admitTask({
      objectiveRevision: "turn_pending",
      parentTurnId: "turn_pending",
      taskId: "task_pending",
    });
    expect(await resolve("turn_other")).toBeNull();
  });

  it("CE-05: the whole rendered block stays within 6000 characters, with omissions counted", async () => {
    for (let cohort = 0; cohort < 12; cohort += 1) {
      settle(`task_${String(cohort)}`, `turn_${String(cohort)}`, [
        { claim: "x".repeat(900), evidence: "observed" },
        { claim: "y".repeat(900), evidence: "worker_assertion" },
      ]);
    }

    const selected = await resolve("turn_current_unrelated");
    const content = selected?.content ?? "";

    expect(content.length).toBeLessThanOrEqual(6_000);
    expect(content).toMatch(/further recorded claims are not shown here/);
  });

  it("CE-06: a cohort with one settled and one pending task is not presented as settled", async () => {
    settle("task_done", "turn_mixed", [
      { claim: "This part finished.", evidence: "observed" },
    ]);
    admitTask({
      objectiveRevision: "turn_mixed",
      parentTurnId: "turn_mixed",
      taskId: "task_pending",
    });

    const selected = await resolve("turn_other");

    expect(selected).toBeNull();
  });

  it("returns no instruction text for a scheduled worker session", async () => {
    settle("task_a", "turn_1", [
      { claim: "Opened example.com.", evidence: "observed" },
    ]);

    expect(await resolve("turn_2", "scheduled-worker")).toBeNull();
  });
});
describe("reconciling before projecting", () => {
  it("CE-07: a terminal that only the framework projection knows about still reaches the model", async () => {
    // Instructions can only resolve on session.started or turn.started, and the
    // agent's own reconcileBackgroundTasks() runs later, in the model resolver's
    // step.started. A projection built without reconciling first is therefore
    // stale by exactly one reconciliation -- it would miss the work that just
    // settled, which is the work most worth describing.
    //
    // So this supplies the terminal ONLY through the framework projection and
    // never calls admitTask/recordTerminal. It passes only if the resolver
    // reconciles before it projects.
    state.taskMembers = [
      {
        parentTurnId: "turn_wake",
        settled: true,
        taskId: "task_late",
        workerName: "browser",
      },
    ];
    state.taskTerminals = [
      {
        childSessionId: "child_late",
        output: {
          images: [],
          message: "Read the page heading",
          status: "success",
        },
        parentTurnId: "turn_wake",
        status: "completed",
        taskId: "task_late",
        terminalTaskId: "task_late",
        workerName: "browser",
      },
    ];

    const resolved = await resolve("turn_wake");

    expect(resolved?.content).toContain("Read the page heading");
  });
});
