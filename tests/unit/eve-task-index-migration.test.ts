import { describe, expect, it } from "vitest";
import {
  cacheTerminalTaskView,
  getSessionTaskIndex,
  recordSessionTask,
} from "../../node_modules/eve/dist/src/tasks/session-index.js";
import { getSessionTaskCohorts } from "../../node_modules/eve/dist/src/tasks/session-task-cohorts.js";
import { sessionInboxWireV3Migration } from "../../node_modules/eve/dist/src/execution/wire/session-inbox-wire.v4.migration.js";
import type {
  HarnessSession,
  SessionStateMap,
} from "../../node_modules/eve/dist/src/harness/types.js";
import {
  ContextContainer,
  contextStorage,
} from "../../node_modules/eve/dist/src/context/container.js";
import { setSessionTaskTerminals } from "../../node_modules/eve/dist/src/tasks/terminal-projection.js";
import { backgroundTaskTerminals } from "../../agent/lib/background-task-terminal";

const subagentMetadata = {
  agentId: "browser-agent",
  kind: "subagent",
  name: "browser",
};

const legacyIndex = {
  "eve.tasks": {
    tasks: [
      {
        createdByTurnId: "turn_1",
        metadata: subagentMetadata,
        operationId: "op_legacy",
        taskId: "task_a",
        taskInboxToken: "private-routing-credential",
        taskRunId: "run_a",
        terminalView: {
          executor: {
            childSessionId: "session_child",
            childTurnId: "turn_child",
            lifecycle: "terminal",
          },
          lastOutput: { data: { ok: true }, type: "result" as const },
          metadata: subagentMetadata,
          status: "completed" as const,
          taskId: "task_a",
        },
      },
    ],
  },
};

function harnessSession(state: SessionStateMap): HarnessSession {
  return {
    agent: { dynamicModel: true, system: "", tools: [] },
    compaction: {
      recentWindowSize: 10,
      threshold: 100,
      thresholdPercent: 0.9,
    },
    continuationToken: "continuation-a",
    history: [],
    sessionId: "session-a",
    state,
  };
}

describe("Eve 0.49 task-index compatibility", () => {
  it("reads a version-less 0.49 { tasks } index from both readers without throwing", () => {
    expect(() => getSessionTaskIndex(legacyIndex)).not.toThrow();
    expect(() => getSessionTaskCohorts(legacyIndex)).not.toThrow();
    const tasks = getSessionTaskIndex(legacyIndex);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.taskId).toBe("task_a");
    expect(getSessionTaskCohorts(legacyIndex).get("task_a")).toEqual({
      cohortId: "task_a",
      settled: true,
    });
  });

  it("projects legacy executor child identity from a version-less index without writing", () => {
    const context = new ContextContainer();
    setSessionTaskTerminals(context, legacyIndex);
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
        output: { ok: true },
      },
    ]);
  });

  it("rewrites the index to version 2 on the next recordSessionTask write and keeps child identity", () => {
    const next = recordSessionTask(harnessSession(legacyIndex), {
      createdByTurnId: "turn_1",
      executor: { data: {}, kind: "workflow-task" },
      metadata: subagentMetadata,
      taskId: "task_a",
      taskInboxToken: "private-routing-credential",
      taskRunId: "run_a",
    });
    expect(next.state?.["eve.tasks"]).toMatchObject({ version: 2 });
    const context = new ContextContainer();
    setSessionTaskTerminals(context, next.state);
    expect(
      contextStorage.run(context, () => backgroundTaskTerminals())
    ).toEqual([
      {
        taskId: "task_a",
        parentTurnId: "turn_1",
        childSessionId: "session_child",
        childTurnId: "turn_child",
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
    ]);
  });

  it("throws on an unsupported future version", () => {
    expect(() =>
      getSessionTaskIndex({
        "eve.tasks": { tasks: [], version: 3 },
      })
    ).toThrow(/Unsupported task index version 3/);
    expect(() =>
      getSessionTaskCohorts({
        "eve.tasks": { tasks: [], version: 3 },
      })
    ).toThrow(/Unsupported task index version/);
  });

  it("keeps 0.49 executor child identity across the v3-to-v4 inbox view migration", () => {
    const migrated = sessionInboxWireV3Migration.migrate({
      kind: "deliver",
      payloads: [
        {
          message: "child completed",
          task: {
            views: [
              {
                executor: {
                  childSessionId: "session_child",
                  childTurnId: "turn_child",
                  lifecycle: "terminal",
                },
                lastOutput: { data: { ok: true }, type: "result" },
                metadata: subagentMetadata,
                status: "completed",
                taskId: "task_a",
              },
            ],
          },
        },
      ],
      version: 3,
    });
    const serialized = JSON.stringify(migrated);
    expect(serialized).toContain('"childSessionId":"session_child"');
    expect(serialized).toContain('"childTurnId":"turn_child"');
    expect(serialized).toContain('"binding"');
    expect(serialized).not.toContain('"lifecycle"');

    const written = cacheTerminalTaskView(legacyIndex, {
      executor: {
        binding: {
          data: {
            childSessionId: "session_child",
            childTurnId: "turn_child",
          },
          kind: "legacy-child",
        },
      },
      lastOutput: { data: { ok: true }, type: "result" },
      metadata: subagentMetadata,
      status: "completed",
      taskId: "task_a",
    });
    const context = new ContextContainer();
    setSessionTaskTerminals(context, written);
    expect(
      contextStorage.run(context, () => backgroundTaskTerminals())
    ).toEqual([
      {
        taskId: "task_a",
        parentTurnId: "turn_1",
        childSessionId: "session_child",
        childTurnId: "turn_child",
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
    ]);
  });

  it("cacheTerminalTaskView writes version 2 and keeps prior child identity", () => {
    const written = cacheTerminalTaskView(legacyIndex, {
      lastOutput: { data: { ok: true }, type: "result" },
      metadata: subagentMetadata,
      status: "completed",
      taskId: "task_a",
    });
    expect(written?.["eve.tasks"]).toMatchObject({ version: 2 });
    const context = new ContextContainer();
    setSessionTaskTerminals(context, written);
    expect(
      contextStorage.run(context, () => backgroundTaskTerminals())
    ).toEqual([
      {
        taskId: "task_a",
        parentTurnId: "turn_1",
        childSessionId: "session_child",
        childTurnId: "turn_child",
        workerName: "browser",
        status: "completed",
        output: { ok: true },
      },
    ]);
  });
});
