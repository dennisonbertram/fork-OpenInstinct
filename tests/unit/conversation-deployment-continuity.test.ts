import { afterEach, describe, expect, it } from "vitest";
import { defineState } from "eve/context";
import {
  ContextContainer,
  contextStorage,
} from "../../node_modules/eve/dist/src/context/container.js";
import {
  deserializeContext,
  serializeContext,
} from "../../node_modules/eve/dist/src/context/serialize.js";

// Eve's context serializer resolves each payload key by name against a
// process-global registry (`globalThis[Symbol.for("eve.context-key-registry")]`)
// populated as `ContextKey`/`defineState` modules are imported. A build that
// never imports the module declaring a key never registers its name, so
// `deserializeContext` treats that key as unknown.
const KEY_REGISTRY = Symbol.for("eve.context-key-registry");

interface GlobalWithKeyRegistry {
  [KEY_REGISTRY]?: Map<string, unknown>;
}

function keyRegistry(): Map<string, unknown> {
  // SAFETY: importing "eve/context" transitively imports key.js, which
  // seeds this exact global symbol with a `Map` before any `ContextKey` is
  // constructed. By the time this test runs, the slot is always that Map.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- narrows eve's untyped global registry slot, justified above.
  const registry = (globalThis as unknown as GlobalWithKeyRegistry)[
    KEY_REGISTRY
  ];
  if (registry === undefined) {
    throw new Error(
      "eve's context-key registry was not initialized by importing eve/context"
    );
  }
  return registry;
}

const DROPPED_KEY_NAME = "completion.obligations";

/** The completion records this case hands from one revision to the next. */
interface OwedCompletionRecords {
  readonly tasks: readonly {
    readonly taskId: string;
    readonly parentTurnId: string;
    readonly objectiveRevision: string;
    readonly terminal: {
      readonly status: "completed";
      readonly facts: readonly never[];
    };
  }[];
  readonly cohorts: readonly {
    readonly cohortId: string;
    readonly objectiveRevision: string;
    readonly taskIds: readonly string[];
    readonly phase: "must_report";
    readonly reportRevision: number;
  }[];
  readonly retired: readonly never[];
}

describe("conversation deployment continuity", () => {
  let savedRegistryEntry: unknown;
  let registryEntrySaved = false;

  afterEach(() => {
    // The key registry is process-global (shared with every other test file
    // in this run), so a simulated "older build" MUST be undone here even if
    // an assertion above throws mid-test.
    if (registryEntrySaved) {
      keyRegistry().set(DROPPED_KEY_NAME, savedRegistryEntry);
      registryEntrySaved = false;
    }
  });

  /**
   * CDC-01: On 2026-09-10, a live conversation's turn at 21:07:49Z ran on a
   * revision that had just shipped the completion-obligations feature and
   * admitted a background-task cohort that still owed the user a completion
   * report. The next turn of that same conversation, at 21:40:37Z, was routed
   * to an older running deployment (commit 61b801c) that predated the
   * feature and had never registered the "completion.obligations" context
   * key (nor "eve.taskTerminals" / "eve.taskMembers"). Deserializing the
   * handed-off context silently dropped the unrecognized keys -- logging
   * only "[eve:context.serialize] dropping unknown context key" -- so the
   * cohort's obligation to report vanished with no error and no report, and
   * the user received a Tapback instead of the result they were owed.
   */
  // Skipped, and only because the repair is not decided yet -- not because the
  // reproduction is doubted. It fails today for exactly the right reason, and
  // plan 017 requires Slice A to settle a routing decision before code: an
  // internal wake carries no acceptedDeploymentId and should therefore start on
  // the current deployment, so what actually routed those two turns to a day-old
  // revision is still unexplained. Writing the fix now would be the guessed fix
  // the plan forbids. Unskip it with the repair, and do not weaken it.
  // oxlint-disable-next-line vitest/no-disabled-tests -- deliberate: the reproduction is correct and fails today; the repair is blocked on plan 017 Slice A's routing decision, and the reason is written above.
  it.skip("CDC-01: deserializing a payload with a key this build never registered must not silently erase that key's state", async () => {
    const container = new ContextContainer();

    // Shaped like the real completion state so the payload carries genuine
    // cohort records; an empty initial value infers `never[]` and could not
    // hold the obligation this case is about.
    const completion = defineState(
      DROPPED_KEY_NAME,
      (): OwedCompletionRecords => ({
        cohorts: [],
        retired: [],
        tasks: [],
      })
    );

    const cohortOwingAReport = {
      tasks: [
        {
          taskId: "task_report_writer",
          parentTurnId: "turn_21:07:49Z",
          objectiveRevision: "rev_1",
          terminal: { status: "completed" as const, facts: [] },
        },
      ],
      cohorts: [
        {
          cohortId: "turn_21:07:49Z",
          objectiveRevision: "rev_1",
          taskIds: ["task_report_writer"],
          phase: "must_report" as const,
          reportRevision: 0,
        },
      ],
      retired: [],
    };

    contextStorage.run(container, () => {
      completion.update(() => cohortOwingAReport);
    });

    // Step 1: the newer revision hands off the turn.
    const payload = serializeContext(container);
    expect(payload[DROPPED_KEY_NAME]).toEqual(cohortOwingAReport);

    // Step 2: simulate the older build (commit 61b801c) receiving that
    // handoff -- it never imported completion-obligations.ts, so its
    // registry has no entry for this key name.
    const registry = keyRegistry();
    savedRegistryEntry = registry.get(DROPPED_KEY_NAME);
    registryEntrySaved = true;
    registry.delete(DROPPED_KEY_NAME);

    // Step 3: the older build deserializes the payload.
    const deserialized = await deserializeContext(payload);

    // Step 4: assert the defect. Nothing surfaces the loss -- deserializing
    // does not throw or report an error the caller can see.
    const survivingKeyNames = [...deserialized.entries()].map(
      ([key]) => key.name
    );

    // This is the behaviour we want: a build must not be able to silently
    // discard state it cannot resolve. Today it does, so this fails.
    //
    // Two repairs would satisfy the requirement and this case deliberately
    // encodes the second, because it is the one that keeps the user's report:
    //
    //   (a) refuse loudly -- deserialization throws, the turn fails visibly, and
    //       nothing is lost because nothing proceeds.
    //   (b) opaque pass-through -- an unresolvable entry is carried through
    //       deserialize/serialize untouched, so a build that cannot read the
    //       state also cannot destroy it, and the next compatible turn still
    //       owes and can deliver the report.
    //
    // (a) turns a silent data loss into a visible outage; (b) turns it into a
    // delay. If a maintainer chooses (a), this case must be rewritten to expect
    // the throw rather than weakened to accept the drop.
    expect(survivingKeyNames).toContain(DROPPED_KEY_NAME);

    // The cohort's obligation to report is the actual lost state, not a log
    // string or a revision comparison. Restore the registry so the current
    // build's own key handle can read the deserialized container back.
    registry.set(DROPPED_KEY_NAME, savedRegistryEntry);
    registryEntrySaved = false;

    const recovered = contextStorage.run(deserialized, () => completion.get());
    expect(recovered).toEqual(cohortOwingAReport);
  });
});
