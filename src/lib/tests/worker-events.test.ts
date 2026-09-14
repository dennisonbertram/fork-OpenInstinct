import type { MessageStreamEvent } from "eve/client";
import { describe, expect, it } from "vitest";
import { measureMatchedTask } from "@/lib/worker-events";

function messageReceived(message: string, at: string): MessageStreamEvent {
  return {
    data: { message, sequence: 0, turnId: "turn_1" },
    meta: { at, id: "msg_1" },
    type: "message.received",
  };
}

function stepCompleted(
  at: string,
  usage?: { costUsd?: number; inputTokens?: number; outputTokens?: number }
): MessageStreamEvent {
  return {
    data: {
      finishReason: "stop",
      sequence: 1,
      stepIndex: 1,
      turnId: "turn_1",
      usage,
    },
    meta: { at, id: "step_1" },
    type: "step.completed",
  };
}

function resultCompleted(
  status: "success" | "failure",
  message: string,
  at: string
): MessageStreamEvent {
  return {
    data: {
      result: JSON.stringify({ message, status }),
      sequence: 2,
      stepIndex: 1,
      turnId: "turn_1",
    },
    meta: { at, id: "res_1" },
    type: "result.completed",
  };
}

function turnFailed(message: string, at: string): MessageStreamEvent {
  return {
    data: { code: "failed", message, sequence: 2, turnId: "turn_1" },
    meta: { at, id: "fail_1" },
    type: "turn.failed",
  };
}

function turnCancelled(at: string): MessageStreamEvent {
  return {
    data: { sequence: 1, turnId: "turn_1" },
    meta: { at, id: "cancel_1" },
    type: "turn.cancelled",
  };
}

describe("measureMatchedTask", () => {
  it("records a matched task with complete metrics and verified goal result", () => {
    const events: MessageStreamEvent[] = [
      messageReceived("User instruction", "2026-09-14T00:00:00.000Z"),
      stepCompleted("2026-09-14T00:00:01.000Z", {
        costUsd: 0.005,
        inputTokens: 100,
        outputTokens: 50,
      }),
      resultCompleted(
        "success",
        "Finished order lookup",
        "2026-09-14T00:00:02.000Z"
      ),
    ];

    const record = measureMatchedTask("task_1", events, {
      caseId: "case_alpha",
      constraintCount: 2,
      finalDeliveryState: "delivered",
      recoveryAttempts: 1,
      verificationState: "verified",
    });

    expect(record).toEqual({
      caseId: "case_alpha",
      constraintCount: 2,
      costComplete: true,
      costUsd: 0.005,
      duplicateCount: 0,
      durationMs: 2000,
      finalDeliveryState: "delivered",
      goalResult: "completed",
      inputTokens: 100,
      modelSteps: 1,
      outputTokens: 50,
      recoveryAttempts: 1,
      taskId: "task_1",
      verificationState: "verified",
    });
  });

  it("leaves unmeasured metrics as null and reports unverified status when absent", () => {
    const events: MessageStreamEvent[] = [
      messageReceived("User instruction", "2026-09-14T00:00:00.000Z"),
      stepCompleted("2026-09-14T00:00:01.000Z"),
      turnFailed("Task stopped abruptly", "2026-09-14T00:00:02.000Z"),
    ];

    const record = measureMatchedTask("task_2", events);

    expect(record).toEqual({
      caseId: null,
      constraintCount: 0,
      costComplete: false,
      costUsd: null,
      duplicateCount: 0,
      durationMs: 2000,
      finalDeliveryState: "unknown",
      goalResult: "failed",
      inputTokens: null,
      modelSteps: 1,
      outputTokens: null,
      recoveryAttempts: 0,
      taskId: "task_2",
      verificationState: "unknown",
    });
  });

  it("handles cancelled worker tasks correctly", () => {
    const events: MessageStreamEvent[] = [
      messageReceived("User instruction", "2026-09-14T00:00:00.000Z"),
      turnCancelled("2026-09-14T00:00:01.500Z"),
    ];

    const record = measureMatchedTask("task_3", events);

    expect(record.goalResult).toBe("cancelled");
    expect(record.durationMs).toBe(1500);
    expect(record.modelSteps).toBe(0);
  });

  it("preserves terminal background task state across repeated receipts", () => {
    const events: MessageStreamEvent[] = [
      {
        data: {
          backgroundTask: { status: "working", taskId: "bg_1" },
          callId: "call_1",
          output: "",
          subagentName: "browser-agent",
        },
        meta: { at: "2026-09-14T00:00:00.000Z", id: "rcpt_1" },
        type: "subagent.completed",
      },
      messageReceived(
        'Background task bg_1 (browser-agent) is completed.\n\nResult:\n{"status":"success","message":"Done"}',
        "2026-09-14T00:00:02.000Z"
      ),
      // Duplicate receipt afterwards
      {
        data: {
          backgroundTask: { status: "working", taskId: "bg_1" },
          callId: "call_2",
          output: "",
          subagentName: "browser-agent",
        },
        meta: { at: "2026-09-14T00:00:03.000Z", id: "rcpt_2" },
        type: "subagent.completed",
      },
    ];

    const record = measureMatchedTask("task_4", events);

    expect(record.goalResult).toBe("completed");
  });
});
