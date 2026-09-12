import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineState } from "eve/context";
import {
  ContextContainer,
  contextStorage,
} from "../../node_modules/eve/dist/src/context/container.js";
import { ContextKey } from "../../node_modules/eve/dist/src/context/key.js";
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
const CODEC_KEY_NAME = "completion.codec";
const CONTINUITY_KEY_NAMES = [
  DROPPED_KEY_NAME,
  CODEC_KEY_NAME,
  "eve.taskMembers",
  "eve.taskTerminals",
] as const;

const codecKey = new ContextKey<Date>(CODEC_KEY_NAME, {
  codec: {
    deserialize(value) {
      return new Date(z.string().parse(value));
    },
    serialize(value) {
      return value.toISOString();
    },
  },
});

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
  const savedRegistryEntries = new Map<string, unknown>();
  let registryEntriesSaved = false;

  afterEach(() => {
    // The key registry is process-global (shared with every other test file
    // in this run), so a simulated "older build" MUST be undone here even if
    // an assertion above throws mid-test.
    if (registryEntriesSaved) {
      const registry = keyRegistry();
      for (const name of CONTINUITY_KEY_NAMES) {
        const saved = savedRegistryEntries.get(name);
        if (saved === undefined) {
          registry.delete(name);
        } else {
          registry.set(name, saved);
        }
      }
      savedRegistryEntries.clear();
      registryEntriesSaved = false;
    }
  });

  /**
   * CDC-01: an old root deployment may deserialize a context emitted by a
   * newer child even though it has not registered the child's completion and
   * task-projection keys. The old root cannot interpret those values, but it
   * must serialize them unchanged before the next compatible child hydrates
   * the continuation. Otherwise an owed completion report disappears.
   */
  it("CDC-01: an old root preserves unknown state for a compatible child", async () => {
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

    const codecValue = new Date("2026-09-12T01:03:02.762Z");
    contextStorage.run(container, () => {
      completion.update(() => cohortOwingAReport);
      container.set(codecKey, codecValue);
    });

    // Step 1: the newer revision hands off the turn.
    const taskMembers = [
      {
        parentTurnId: "turn_21:07:49Z",
        settled: true,
        taskId: "task_report_writer",
        workerName: "worker",
      },
    ];
    const taskTerminals = [
      {
        output: "Example Domain",
        parentTurnId: "turn_21:07:49Z",
        status: "completed",
        taskId: "task_report_writer",
        terminalTaskId: "task_report_writer",
        workerName: "worker",
      },
    ];
    const payload = Object.assign(serializeContext(container), {
      "eve.taskMembers": taskMembers,
      "eve.taskTerminals": taskTerminals,
    });
    expect(payload[DROPPED_KEY_NAME]).toEqual(cohortOwingAReport);

    // Step 2: simulate the old root receiving the newer child's handoff.
    // Its build predates these keys, so it has no registry entries for them.
    const registry = keyRegistry();
    for (const name of CONTINUITY_KEY_NAMES) {
      savedRegistryEntries.set(name, registry.get(name));
      registry.delete(name);
    }
    registryEntriesSaved = true;

    // Step 3: the older build deserializes the payload.
    const deserialized = await deserializeContext(payload);

    // Step 4: a module can register a key while the old root is still running.
    // The stored value remains its wire form, so forwarding must not apply that
    // codec a second time. Serializing models the old root returning control to
    // a compatible child.
    registry.set(CODEC_KEY_NAME, codecKey);
    const forwardedPayload = serializeContext(deserialized);
    expect(forwardedPayload).toMatchObject({
      "completion.codec": codecValue.toISOString(),
      "completion.obligations": cohortOwingAReport,
      "eve.taskMembers": taskMembers,
      "eve.taskTerminals": taskTerminals,
    });

    // The compatible child resolves the registered handle while hydrating the
    // forwarded payload, so the owed cohort reaches its delivery policy intact.
    for (const name of CONTINUITY_KEY_NAMES) {
      const saved = savedRegistryEntries.get(name);
      if (saved === undefined) {
        registry.delete(name);
      } else {
        registry.set(name, saved);
      }
    }
    savedRegistryEntries.clear();
    registryEntriesSaved = false;
    const recoveredContext = await deserializeContext(forwardedPayload);
    const recovered = contextStorage.run(recoveredContext, () =>
      completion.get()
    );
    expect(recovered).toEqual(cohortOwingAReport);
    expect(recoveredContext.get(codecKey)).toEqual(codecValue);
  });

  it("CDC-02: an ordinary hydrated update replaces an opaque predecessor", async () => {
    const newerChild = new ContextContainer();
    const originalValue = new Date("2026-09-12T01:03:02.762Z");
    newerChild.set(codecKey, originalValue);
    const payload = serializeContext(newerChild);

    const registry = keyRegistry();
    savedRegistryEntries.set(CODEC_KEY_NAME, registry.get(CODEC_KEY_NAME));
    registryEntriesSaved = true;
    registry.delete(CODEC_KEY_NAME);
    const oldRoot = await deserializeContext(payload);

    // A compatible runtime module may load before the old root finishes. Its
    // normal update supersedes the opaque wire value rather than being
    // overwritten by it during the next serialization boundary.
    registry.set(CODEC_KEY_NAME, codecKey);
    const updatedValue = new Date("2026-09-12T01:05:00.000Z");
    oldRoot.set(codecKey, updatedValue);
    const forwardedPayload = serializeContext(oldRoot);
    expect(forwardedPayload[CODEC_KEY_NAME]).toBe(updatedValue.toISOString());

    const saved = savedRegistryEntries.get(CODEC_KEY_NAME);
    if (saved === undefined) {
      registry.delete(CODEC_KEY_NAME);
    } else {
      registry.set(CODEC_KEY_NAME, saved);
    }
    savedRegistryEntries.clear();
    registryEntriesSaved = false;
    const compatibleChild = await deserializeContext(forwardedPayload);
    expect(compatibleChild.get(codecKey)).toEqual(updatedValue);
  });
});
