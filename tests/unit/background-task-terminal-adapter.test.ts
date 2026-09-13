import { describe, expect, it } from "vitest";
import {
  ContextContainer,
  contextStorage,
} from "../../node_modules/eve/dist/src/context/container.js";
import {
  attachChildIdentityToTerminalView,
  setSessionTaskTerminals,
  TaskTerminalsKey,
  type BackgroundTaskTerminal,
} from "../../node_modules/eve/dist/src/tasks/terminal-projection.js";
import { cacheTerminalTaskView } from "../../node_modules/eve/dist/src/tasks/session-index.js";
import { createDurableSessionState } from "../../node_modules/eve/dist/src/execution/durable-session-store.js";
import { routeDeliverToChildren } from "../../node_modules/eve/dist/src/execution/route-child-delivery.js";
import type { SessionStateMap } from "../../node_modules/eve/dist/src/harness/types.js";
import {
  backgroundTaskMembers,
  backgroundTaskTerminals,
} from "../../agent/lib/background-task-terminal";

const subagentMetadata = {
  agentId: "browser-agent",
  kind: "subagent" as const,
  mode: "local" as const,
  name: "browser",
};

interface IndexEntryOverrides {
  taskId?: string;
  taskRunId?: string;
  taskInboxToken?: string;
  createdByTurnId?: string;
  metadata?: typeof subagentMetadata;
  terminalView?: object;
}

function indexEntry(overrides: IndexEntryOverrides = {}) {
  const entry = {
    createdByTurnId: overrides.createdByTurnId ?? "turn_1",
    metadata: overrides.metadata ?? subagentMetadata,
    taskId: overrides.taskId ?? "task_a",
    taskInboxToken: overrides.taskInboxToken ?? "private-routing-credential",
    taskRunId: overrides.taskRunId ?? "run_a",
  };
  if (overrides.terminalView === undefined) return entry;
  return { ...entry, terminalView: overrides.terminalView };
}

function completedView<Data extends object>(
  taskId: string,
  data: Data,
  executor?: { childSessionId?: string; childTurnId?: string }
) {
  return {
    executor:
      executor === undefined
        ? undefined
        : { ...executor, lifecycle: "terminal" as const },
    lastOutput: { data, type: "result" as const },
    metadata: subagentMetadata,
    status: "completed" as const,
    taskId,
  };
}

function failedView<Data extends object>(taskId: string, data: Data) {
  return {
    lastOutput: { data, type: "error" as const },
    metadata: subagentMetadata,
    status: "failed" as const,
    taskId,
  };
}

function cancelledView(taskId: string) {
  return {
    metadata: subagentMetadata,
    status: "cancelled" as const,
    taskId,
  };
}

function runWithState(state: SessionStateMap) {
  const context = new ContextContainer();
  setSessionTaskTerminals(context, state);
  return contextStorage.run(context, () => backgroundTaskTerminals());
}

describe("backgroundTaskTerminals", () => {
  it("TA-01: projects a completed task with its structured output and child identity", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({
            terminalView: completedView(
              "task_a",
              { message: "captured 2 screenshots", status: "done" },
              { childSessionId: "session_child", childTurnId: "turn_child" }
            ),
          }),
        ],
      },
    };

    const context = new ContextContainer();
    setSessionTaskTerminals(context, state);
    const records = contextStorage.run(context, () =>
      backgroundTaskTerminals()
    );

    expect(records).toEqual([
      {
        taskId: "task_a",
        parentTurnId: "turn_1",
        childSessionId: "session_child",
        childTurnId: "turn_child",
        workerName: "browser",
        status: "completed",
        output: { message: "captured 2 screenshots", status: "done" },
      },
    ]);
    expect(JSON.stringify(records)).not.toContain("private-routing-credential");
  });

  it("TA-02: reports failed with its error payload and cancelled with no output, never completed", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({
            taskId: "task_failed",
            terminalView: failedView("task_failed", {
              message: "navigation blocked",
            }),
          }),
          indexEntry({
            taskId: "task_cancelled",
            terminalView: cancelledView("task_cancelled"),
          }),
        ],
      },
    };

    const records = runWithState(state);

    expect(records).toEqual([
      {
        taskId: "task_failed",
        parentTurnId: "turn_1",
        childSessionId: undefined,
        childTurnId: undefined,
        workerName: "browser",
        status: "failed",
        output: { message: "navigation blocked" },
      },
      {
        taskId: "task_cancelled",
        parentTurnId: "turn_1",
        childSessionId: undefined,
        childTurnId: undefined,
        workerName: "browser",
        status: "cancelled",
        output: undefined,
      },
    ]);
    expect(records.some((record) => record.status === "completed")).toBe(false);
  });

  it("TA-03: an empty task index with unrelated message text yields zero records", () => {
    const state = {
      "eve.tasks": { tasks: [] },
      "some.unrelated.messages": [
        'Background task browser finished. Result: { "status": "done" }',
      ],
    };

    expect(runWithState(state)).toEqual([]);
  });

  it("TA-04: seeding and reading twice does not duplicate records", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({ terminalView: completedView("task_a", { ok: true }) }),
        ],
      },
    };

    const context = new ContextContainer();
    setSessionTaskTerminals(context, state);
    setSessionTaskTerminals(context, state);

    const first = contextStorage.run(context, () => backgroundTaskTerminals());
    const second = contextStorage.run(context, () => backgroundTaskTerminals());

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("TA-05: a retried task keeps one record carrying the retry's output", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({
            taskId: "task_a",
            taskRunId: "run_a_retry",
            terminalView: completedView("task_a", { attempt: "retry" }),
          }),
        ],
      },
    };

    const records = runWithState(state);

    expect(records).toEqual([
      {
        taskId: "task_a",
        parentTurnId: "turn_1",
        childSessionId: undefined,
        childTurnId: undefined,
        workerName: "browser",
        status: "completed",
        output: { attempt: "retry" },
      },
    ]);
  });

  it("TA-06: filtering by a childSessionId that does not match yields zero records", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({
            terminalView: completedView(
              "task_a",
              { ok: true },
              {
                childSessionId: "session_other",
              }
            ),
          }),
        ],
      },
    };

    const context = new ContextContainer();
    setSessionTaskTerminals(context, state);
    const records = contextStorage.run(context, () =>
      backgroundTaskTerminals({ childSessionId: "session_child" })
    );

    expect(records).toEqual([]);
  });

  it("filters a two-cohort index down to the matching parentTurnId", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({
            taskId: "task_from_turn_1",
            createdByTurnId: "turn_1",
            terminalView: completedView("task_from_turn_1", { cohort: 1 }),
          }),
          indexEntry({
            taskId: "task_from_turn_2",
            createdByTurnId: "turn_2",
            terminalView: completedView("task_from_turn_2", { cohort: 2 }),
          }),
        ],
      },
    };

    const context = new ContextContainer();
    setSessionTaskTerminals(context, state);
    const records = contextStorage.run(context, () =>
      backgroundTaskTerminals({ parentTurnId: "turn_2" })
    );

    expect(records).toEqual([
      {
        taskId: "task_from_turn_2",
        parentTurnId: "turn_2",
        childSessionId: undefined,
        childTurnId: undefined,
        workerName: "browser",
        status: "completed",
        output: { cohort: 2 },
      },
    ]);
  });

  // Eve's own index schema refuses a terminal view whose identity disagrees
  // with its owning entry, so these two guards are seeded directly into the
  // projection slot. They are the adapter's defence if a future framework
  // version relaxes that schema.
  it("TA-06b: ignores a terminal whose identity disagrees with its owning task", () => {
    const context = new ContextContainer();
    context.set(TaskTerminalsKey, [
      {
        taskId: "task_a",
        terminalTaskId: "task_b",
        parentTurnId: "turn_1",
        childSessionId: "session_child",
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
    ]);

    expect(
      contextStorage.run(context, () => backgroundTaskTerminals())
    ).toEqual([]);
  });

  it("detaches the returned output from the session state it came from", () => {
    const output = { message: "captured 2 screenshots", status: "done" };
    const state = {
      "eve.tasks": {
        tasks: [indexEntry({ terminalView: completedView("task_a", output) })],
      },
    };

    const records = runWithState(state);

    // Equal in value, but not the same object: a caller holding this record
    // cannot reach back into the session state that produced it.
    expect(records[0]?.output).toEqual(output);
    expect(records[0]?.output).not.toBe(output);
  });

  it("drops an entry that fails validation and keeps its valid sibling", () => {
    const context = new ContextContainer();
    // The first two entries satisfy the declared projection type but fail the
    // adapter's own schema: identity and turn strings must be non-empty, so a
    // blank one carries no usable identity.
    const entries: readonly BackgroundTaskTerminal[] = [
      {
        taskId: "",
        terminalTaskId: "",
        parentTurnId: "turn_1",
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
      {
        taskId: "task_blank_turn",
        terminalTaskId: "task_blank_turn",
        parentTurnId: "",
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
      {
        taskId: "task_valid",
        terminalTaskId: "task_valid",
        parentTurnId: "turn_1",
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
    ];
    context.set(TaskTerminalsKey, entries);

    const records = contextStorage.run(context, () =>
      backgroundTaskTerminals()
    );

    expect(records.map((record) => record.taskId)).toEqual(["task_valid"]);
  });

  it("a pending task contributes no record while a settled sibling does", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({ taskId: "task_pending" }),
          indexEntry({
            taskId: "task_settled",
            terminalView: completedView("task_settled", { ok: true }),
          }),
        ],
      },
    };

    const records = runWithState(state);

    expect(records).toEqual([
      {
        taskId: "task_settled",
        parentTurnId: "turn_1",
        childSessionId: undefined,
        childTurnId: undefined,
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
    ]);
  });

  it("projects child identity from a native 0.54.3 executor binding after persist", () => {
    const nativeView = {
      executor: {
        binding: {
          data: {
            address: { kind: "agent/local", sessionId: "session_native" },
            childSessionId: "session_native",
          },
          kind: "workflow-task",
        },
      },
      lastOutput: { data: { ok: true }, type: "result" as const },
      metadata: subagentMetadata,
      status: "completed" as const,
      taskId: "task_a",
    };
    const state = {
      "eve.tasks": {
        tasks: [
          {
            createdByTurnId: "turn_1",
            metadata: subagentMetadata,
            taskId: "task_a",
            taskInboxToken: "private-routing-credential",
            taskRunId: "run_a",
          },
        ],
        version: 2,
      },
    };
    const persisted = cacheTerminalTaskView(state, nativeView);
    const context = new ContextContainer();
    setSessionTaskTerminals(context, persisted);
    const records = contextStorage.run(context, () =>
      backgroundTaskTerminals()
    );

    expect(records).toEqual([
      {
        taskId: "task_a",
        parentTurnId: "turn_1",
        childSessionId: "session_native",
        childTurnId: undefined,
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
    ]);
  });

  it("copies handle-store session identity onto a native terminal view before release", () => {
    const view = {
      executor: { binding: { data: {}, kind: "workflow-task" } },
      lastOutput: { data: { done: true }, type: "result" as const },
      metadata: subagentMetadata,
      status: "completed" as const,
      taskId: "task_a",
    };
    const state = {
      "eve.agent.handles": {
        handles: [
          {
            address: {
              continuationToken: "child-token",
              kind: "agent/local",
              sessionId: "session_from_handle",
            },
            identity: {
              id: "ag_browser:1",
              name: "browser",
              nodeId: "browser-agent",
            },
            ownerId: "task_a",
            phase: "claimed",
            operationId: "op_1",
          },
        ],
      },
      "eve.tasks": {
        tasks: [
          {
            createdByTurnId: "turn_1",
            metadata: subagentMetadata,
            taskId: "task_a",
            taskInboxToken: "private-routing-credential",
            taskRunId: "run_a",
          },
        ],
        version: 2,
      },
    };

    const enriched = attachChildIdentityToTerminalView(state, view);
    expect(enriched.executor?.binding?.data).toMatchObject({
      childSessionId: "session_from_handle",
    });
  });

  it("keeps native child identity after a child settlement that releases the handle", async () => {
    const metadata = {
      agentId: "ag_browser:1",
      kind: "subagent" as const,
      mode: "local" as const,
      name: "browser",
    };
    const usage = {
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    const session = {
      agent: { dynamicModel: true as const, system: "", tools: [] },
      compaction: {
        recentWindowSize: 1,
        threshold: 1,
        thresholdPercent: 1,
      },
      continuationToken: "parent-token",
      history: [],
      sessionId: "session-parent",
      state: {
        "eve.agent.handles": {
          handles: [
            {
              address: {
                continuationToken: "child-token",
                kind: "agent/local",
                sessionId: "session_child",
              },
              callId: "call_1",
              identity: {
                id: "ag_browser:1",
                name: "browser",
                nodeId: "browser-agent",
              },
              operationId: "op_1",
              ownerId: "task_a",
              phase: "claimed",
            },
          ],
        },
        "eve.tasks": {
          tasks: [
            {
              createdByTurnId: "turn_1",
              executor: { data: {}, kind: "workflow-task" },
              metadata,
              taskId: "task_a",
              taskInboxToken: "private-routing-credential",
              taskRunId: "run_a",
            },
          ],
          version: 2,
        },
      },
    };
    const delivered = await routeDeliverToChildren({
      parentWritable: new WritableStream(),
      delivery: {
        kind: "deliver",
        payloads: [
          {
            task: {
              agentRequests: [
                {
                  replyTo: "reply",
                  request: {
                    kind: "agent-settled",
                    result: {
                      callId: "call_1",
                      kind: "subagent-result",
                      origin: "child",
                      outcome: {
                        kind: "terminal",
                        result: { kind: "succeeded", output: { ok: true } },
                        usageDelta: usage,
                      },
                      output: { ok: true },
                      subagentName: "browser",
                    },
                  },
                  taskId: "task_a",
                },
              ],
              views: [
                {
                  lastOutput: { data: { ok: true }, type: "result" },
                  metadata,
                  status: "completed",
                  taskId: "task_a",
                },
              ],
            },
          },
        ],
      },
      serializedContext: {},
      sessionState: createDurableSessionState({ session }),
    });
    const context = new ContextContainer();
    setSessionTaskTerminals(
      context,
      delivered.sessionState.snapshot?.session.state
    );
    expect(
      contextStorage.run(context, () => backgroundTaskTerminals())
    ).toEqual([
      {
        taskId: "task_a",
        parentTurnId: "turn_1",
        childSessionId: "session_child",
        childTurnId: undefined,
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
    ]);
  });
});

describe("backgroundTaskMembers", () => {
  it("TM-01: enumerates a pending sibling alongside a settled task", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({
            taskId: "task_settled",
            terminalView: completedView(
              "task_settled",
              { ok: true },
              {
                childSessionId: "session_child",
              }
            ),
          }),
          indexEntry({ taskId: "task_pending" }),
        ],
      },
    };

    const context = new ContextContainer();
    setSessionTaskTerminals(context, state);
    const members = contextStorage.run(context, () => backgroundTaskMembers());

    // A cohort owes one summary only when its LAST member settles, so the root
    // must be able to see that task_pending has not finished.
    expect(members).toEqual([
      {
        taskId: "task_settled",
        parentTurnId: "turn_1",
        workerName: "browser",
        settled: true,
      },
      {
        taskId: "task_pending",
        parentTurnId: "turn_1",
        workerName: "browser",
        settled: false,
      },
    ]);
  });

  it("TM-02: filters members to one parent turn", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({ taskId: "from_turn_1", createdByTurnId: "turn_1" }),
          indexEntry({ taskId: "from_turn_2", createdByTurnId: "turn_2" }),
        ],
      },
    };

    const context = new ContextContainer();
    setSessionTaskTerminals(context, state);
    const members = contextStorage.run(context, () =>
      backgroundTaskMembers({ parentTurnId: "turn_2" })
    );

    expect(members.map((member) => member.taskId)).toEqual(["from_turn_2"]);
  });

  it("TM-03: a member record carries no result and no private routing token", () => {
    const state = {
      "eve.tasks": {
        tasks: [
          indexEntry({
            taskId: "task_settled",
            terminalView: completedView("task_settled", {
              secretish: "result payload",
            }),
          }),
        ],
      },
    };

    const context = new ContextContainer();
    setSessionTaskTerminals(context, state);
    const members = contextStorage.run(context, () => backgroundTaskMembers());

    const serialized = JSON.stringify(members);
    expect(serialized).not.toContain("result payload");
    expect(serialized).not.toContain("private-routing-credential");
  });
});
