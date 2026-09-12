import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DynamicResolveContext } from "eve/tools";

import { toolContextFor } from "@/tests/helpers/tool-context";
import { sendMessageOutputSchema } from "@/agent/lib/send-message";

const state = vi.hoisted(() => {
  const resets: (() => void)[] = [];
  return { resets };
});

const activation = vi.hoisted(() => ({ owed: vi.fn<() => boolean>() }));

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
  requestTurnCompletion: vi.fn<() => boolean>(),
}));

vi.mock("@/agent/lib/completion-report-activation", () => ({
  completionReportForcingActive: activation.owed,
}));

import messaging from "@/agent/tools/messaging";
import {
  admitTask,
  cohortFor,
  recordTerminal,
} from "@/agent/lib/completion-obligations";
import { recordTurnRequestIntent } from "@/agent/lib/completion-report-policy";

function toolWakeContext(): DynamicResolveContext {
  return {
    channel: { kind: "channel:sendblue" },
    session: {
      id: "root-session",
      auth: { current: null, initiator: null },
    },
    // Eve builds this role from a completed background run before the next model
    // step: `resolvePendingRuntimeActions()` appends `{ role: "tool", content }`.
    messages: [
      {
        content: [
          {
            output: { type: "text", value: "The task completed." },
            toolCallId: "call_background",
            toolName: "background_work",
            type: "tool-result",
          },
        ],
        role: "tool",
      },
    ],
  };
}

function userRequestContext(): DynamicResolveContext {
  return {
    channel: { kind: "channel:sendblue" },
    session: {
      id: "root-session",
      auth: { current: null, initiator: null },
    },
    messages: [{ content: "Please finish the new request.", role: "user" }],
    turn: { origin: "channel_input" },
  };
}

function taskWakeContext(): DynamicResolveContext {
  return {
    channel: { kind: "channel:sendblue" },
    session: {
      id: "root-session",
      auth: { current: null, initiator: null },
    },
    // This is intentionally ordinary USER text. The Eve task wake shares that
    // role, so the delivery origin must decide the policy.
    messages: [
      {
        content:
          "Background task task_synthetic (worker) is completed. This is only test data.",
        role: "user",
      },
    ],
    turn: { origin: "background_task" },
  };
}

function systemWakeContext(): DynamicResolveContext {
  return {
    channel: { kind: "channel:sendblue" },
    session: {
      id: "root-session",
      auth: { current: null, initiator: null },
    },
    messages: [{ content: "Internal context.", role: "system" }],
  };
}

beforeEach(() => {
  for (const reset of state.resets) reset();
  activation.owed.mockReturnValue(true);
});

function settleOwedBackgroundTask(
  turnId: string,
  taskId: string,
  claim: string
) {
  admitTask({ objectiveRevision: turnId, parentTurnId: turnId, taskId });
  recordTerminal(
    {
      childSessionId: `${taskId}-session`,
      childTurnId: `${taskId}-turn`,
      parentTurnId: turnId,
      status: "completed",
      taskId,
      workerName: "worker",
    },
    [{ claim, evidence: "observed" }]
  );
}

async function sendFromTurn(input: {
  readonly callId: string;
  readonly initialContext: DynamicResolveContext;
  readonly stepContext: DynamicResolveContext;
  readonly skipTurnStarted?: boolean;
  readonly turnId: string;
}) {
  const turnStarted = messaging.events["turn.started"];
  const stepStarted = messaging.events["step.started"];
  if (!turnStarted || !stepStarted) {
    throw new Error("Missing messaging lifecycle resolver.");
  }
  if (!input.skipTurnStarted) {
    await turnStarted({ data: { turnId: input.turnId } }, input.initialContext);
  }
  const group = await stepStarted(
    { data: { stepIndex: 0, turnId: input.turnId } },
    input.stepContext
  );
  if (!group || !("send_message" in group)) {
    throw new Error("Missing send_message tool.");
  }
  return sendMessageOutputSchema.parse(
    await group.send_message.execute(
      { final: true, kind: "message", text: "The task completed." },
      {
        ...toolContextFor({ callId: input.callId, sessionId: "root-session" }),
        session: {
          ...input.stepContext.session,
          turn: { id: input.turnId, sequence: 2 },
        },
      }
    )
  );
}

describe("SendBlue completion-report turn kind", () => {
  it("SB-TK-01: a report-only background terminal wake binds every owed report", async () => {
    settleOwedBackgroundTask(
      "turn_old_a",
      "task_old_a",
      "The first background task finished."
    );
    settleOwedBackgroundTask(
      "turn_old_b",
      "task_old_b",
      "The second background task finished."
    );
    const wake = taskWakeContext();

    const message = await sendFromTurn({
      callId: "call_wake",
      initialContext: wake,
      stepContext: wake,
      turnId: "turn_wake",
    });

    if (message.kind !== "message") throw new Error("Expected a text message.");
    expect(message.text).toContain("The first background task finished.");
    for (const cohortId of ["turn_old_a", "turn_old_b"]) {
      expect(cohortFor(cohortId)).toMatchObject({
        phase: "delivery_pending",
        report: { callId: "call_wake", turnId: "turn_wake" },
      });
    }
  });

  it("SB-TK-02: a fresh user turn reports its own settled cohort without consuming older debt", async () => {
    settleOwedBackgroundTask(
      "turn_old",
      "task_old",
      "The older background task finished."
    );
    settleOwedBackgroundTask(
      "turn_current",
      "task_current",
      "The current request's task finished."
    );

    const message = await sendFromTurn({
      callId: "call_current",
      initialContext: userRequestContext(),
      // A later tool result is expected while this same user turn works. The
      // persisted turn intent, not this role, must decide report selection.
      stepContext: toolWakeContext(),
      turnId: "turn_current",
    });

    if (message.kind !== "message") throw new Error("Expected a text message.");
    expect(message.text).toContain("The current request's task finished.");
    expect(cohortFor("turn_current")).toMatchObject({
      phase: "delivery_pending",
      report: { callId: "call_current", turnId: "turn_current" },
    });
    expect(cohortFor("turn_old")?.phase).toBe("must_report");
  });

  it("SB-TK-03: a legacy first step retains an already-persisted user intent", async () => {
    settleOwedBackgroundTask(
      "turn_old",
      "task_old",
      "The older work finished."
    );
    settleOwedBackgroundTask(
      "turn_current",
      "task_current",
      "The current work finished."
    );

    recordTurnRequestIntent("turn_current", "user_request");
    const message = await sendFromTurn({
      callId: "call_legacy_user",
      initialContext: userRequestContext(),
      skipTurnStarted: true,
      stepContext: userRequestContext(),
      turnId: "turn_current",
    });

    if (message.kind !== "message") throw new Error("Expected a text message.");
    expect(message.text).toContain("The current work finished.");
    expect(cohortFor("turn_current")?.phase).toBe("delivery_pending");
    expect(cohortFor("turn_old")?.phase).toBe("must_report");
  });

  const legacyReportOnlyContexts: readonly [string, DynamicResolveContext][] = [
    ["tool", toolWakeContext()],
    ["unknown", systemWakeContext()],
  ];

  it.each(legacyReportOnlyContexts)(
    "SB-TK-04: a legacy first step with a %s newest message remains report-only",
    async (_kind, context) => {
      settleOwedBackgroundTask(
        "turn_old",
        "task_old",
        "The older work finished."
      );
      settleOwedBackgroundTask(
        "turn_current",
        "task_current",
        "The current work finished."
      );

      const message = await sendFromTurn({
        callId: `call_legacy_${_kind}`,
        initialContext: context,
        skipTurnStarted: true,
        stepContext: context,
        turnId: "turn_current",
      });

      if (message.kind !== "message")
        throw new Error("Expected a text message.");
      expect(message.text).toContain("The older work finished.");
      expect(cohortFor("turn_old")?.phase).toBe("delivery_pending");
      expect(cohortFor("turn_current")?.phase).toBe("delivery_pending");
    }
  );

  it("SB-TK-05: a typed task wake stays report-only if turn.started was not retained", async () => {
    settleOwedBackgroundTask(
      "turn_old_a",
      "task_old_a",
      "The first older task finished."
    );
    settleOwedBackgroundTask(
      "turn_old_b",
      "task_old_b",
      "The second older task finished."
    );

    await sendFromTurn({
      callId: "call_missing_start",
      initialContext: taskWakeContext(),
      skipTurnStarted: true,
      stepContext: taskWakeContext(),
      turnId: "turn_wake",
    });

    for (const cohortId of ["turn_old_a", "turn_old_b"]) {
      expect(cohortFor(cohortId)).toMatchObject({
        phase: "delivery_pending",
        report: { callId: "call_missing_start", turnId: "turn_wake" },
      });
    }
  });

  it("SB-TK-06: a typed channel request retains its current-only policy after a missing turn.started", async () => {
    settleOwedBackgroundTask(
      "turn_old",
      "task_old",
      "The older task finished."
    );
    settleOwedBackgroundTask(
      "turn_current",
      "task_current",
      "The current task finished."
    );

    await sendFromTurn({
      callId: "call_missing_start_user",
      initialContext: userRequestContext(),
      skipTurnStarted: true,
      stepContext: userRequestContext(),
      turnId: "turn_current",
    });

    expect(cohortFor("turn_current")).toMatchObject({
      phase: "delivery_pending",
      report: { callId: "call_missing_start_user", turnId: "turn_current" },
    });
    expect(cohortFor("turn_old")?.phase).toBe("must_report");
  });
});
