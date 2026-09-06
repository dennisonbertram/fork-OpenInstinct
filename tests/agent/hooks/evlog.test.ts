import type { HookContext } from "eve/hooks";
import type { DrainContext, WideEvent } from "evlog";
import { initLogger } from "evlog";
import { resetEvlogEveForTests, useLogger } from "evlog/eve";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type * as EnvModule from "@/env";

vi.mock("@/env", async (importOriginal) => {
  const original = await importOriginal<typeof EnvModule>();
  return {
    ...original,
    env: {
      ...original.env,
      LINQ_LATENCY_MODE: "on",
      LINQ_LATENCY_WORKSPACE_ID: "workspace-test",
    },
  };
});
import evlogHook from "@/agent/hooks/evlog";
import instrumentation from "@/agent/instrumentation/runtime-context";

const capturedEvents: WideEvent[] = [];

beforeAll(() => {
  resetEvlogEveForTests();
  initLogger({
    drain({ event }: DrainContext) {
      capturedEvents.push(structuredClone(event));
    },
    env: { service: "open-instinct-test" },
    redact: false,
    silent: true,
  });
});

describe("evlog hook", () => {
  it("omits message content, appends turn observations, and isolates later turns", async () => {
    const first = hookContext("turn-1", 0);
    const second = hookContext("turn-2", 1);

    await emit("turn.started", turnStarted("turn-1", 0), first);
    await emit(
      "message.received",
      messageReceived(
        "turn-1",
        "email mason@example.com card 4111111111111111"
      ),
      first
    );
    const log = useLogger(first);
    log.set({
      channel: {
        linq: { reactions: [{ outcome: "accepted" }] },
      },
    });
    log.set({
      channel: {
        linq: { reactions: [{ outcome: "already-acknowledged" }] },
      },
    });
    await emit(
      "message.completed",
      messageCompleted("turn-1", "full response mason@example.com"),
      first
    );
    await emit("turn.completed", turnCompleted("turn-1"), first);

    await emit("turn.started", turnStarted("turn-2", 1), second);
    await emit(
      "message.received",
      messageReceived("turn-2", "next turn"),
      second
    );
    await emit(
      "message.completed",
      messageCompleted("turn-2", "next response"),
      second
    );
    await emit("turn.completed", turnCompleted("turn-2"), second);

    expect(capturedEvents).toHaveLength(2);
    expect(capturedEvents[0]).toMatchObject({
      channel: {
        kind: "linq",
        linq: {
          reactions: [
            { outcome: "accepted" },
            { outcome: "already-acknowledged" },
          ],
        },
      },
    });
    // Fork policy: tenant message content never reaches logs.
    expect(capturedEvents[0]).not.toHaveProperty("message.received");
    expect(capturedEvents[0]).not.toHaveProperty("message.response");
    expect(JSON.stringify(capturedEvents)).not.toContain("mason@example.com");
    expect(JSON.stringify(capturedEvents)).not.toContain("4111111111111111");
    expect(capturedEvents[1]).toMatchObject({
      channel: { kind: "linq" },
    });
    expect(capturedEvents[1]).not.toHaveProperty("message.received");
    expect(capturedEvents[1]).not.toHaveProperty("message.response");
    expect(capturedEvents[1]).not.toHaveProperty("channel.linq");
  });

  it("records eligible Linq timing stages without retaining them for later turns", async () => {
    const before = capturedEvents.length;
    const first = hookContext("timed-turn", 2, timingAttributes());
    const second = hookContext("untimed-turn", 3);

    await emit("turn.started", turnStarted("timed-turn", 2), first);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_788_213_602_500);
    instrumentation.events["step.started"]({
      channel: { kind: "channel:linq", metadata: {} },
      modelInput: { instructions: undefined, messages: [] },
      session: {
        auth: first.session.auth,
        id: first.session.id,
      },
      step: { index: 0 },
      turn: { id: "timed-turn", sequence: 2 },
    });
    now.mockRestore();
    await emit("step.started", stepStarted("timed-turn"), first);
    await emit("message.appended", messageAppended("timed-turn"), first);
    await emit("turn.completed", turnCompleted("timed-turn"), first);

    await emit("turn.started", turnStarted("untimed-turn", 3), second);
    await emit("turn.completed", turnCompleted("untimed-turn"), second);

    const [timed, untimed] = capturedEvents.slice(before);
    expect(timed).toHaveProperty(
      "eve.linqLatency.admissionStartedAtMs",
      1_788_213_599_000
    );
    expect(timed).toHaveProperty(
      "eve.linqLatency.admissionToFirstModelInputPreparedMs",
      3_500
    );
    expect(timed).toHaveProperty(
      "eve.linqLatency.admissionToFirstStepStartedMs",
      3_000
    );
    expect(timed).toHaveProperty(
      "eve.linqLatency.admissionToFirstAssistantTextDeltaMs",
      4_000
    );
    expect(timed).toHaveProperty(
      "eve.linqLatency.admissionToBridgeSendStartMs",
      1_000
    );
    expect(timed).toHaveProperty("eve.linqLatency.bridgeSendToTurnStartMs", 0);
    expect(timed).toHaveProperty("eve.linqLatency.modelIsLunaFast", true);
    expect(untimed).not.toHaveProperty("eve.linqLatency");
  });
});

type EvlogEvents = NonNullable<typeof evlogHook.events>;

async function emit<Name extends keyof EvlogEvents>(
  name: Name,
  event: Parameters<NonNullable<EvlogEvents[Name]>>[0],
  context: HookContext
) {
  const handler = evlogHook.events?.[name];
  if (!handler) throw new Error(`Evlog handler ${name} is not configured.`);
  await handler(event, context);
}

function hookContext(
  turnId: string,
  sequence: number,
  attributes: Record<string, string> = {}
) {
  return {
    agent: { name: "root" },
    channel: { kind: "linq" },
    async getSandbox() {
      throw new Error("Sandbox access is outside this focused test.");
    },
    getSkill() {
      throw new Error("Skill access is outside this focused test.");
    },
    session: {
      auth: {
        current:
          Object.keys(attributes).length === 0
            ? null
            : {
                attributes,
                authenticator: "linq-message",
                principalId: "better-auth:test",
                principalType: "user",
              },
        initiator: null,
      },
      id: "session-1",
      turn: { id: turnId, sequence },
    },
  } satisfies HookContext;
}

function turnStarted(turnId: string, sequence: number) {
  return {
    data: { sequence, turnId },
    meta: { at: "2026-08-31T22:00:00.000Z", id: `start-${turnId}` },
    type: "turn.started",
  } satisfies Parameters<NonNullable<EvlogEvents["turn.started"]>>[0];
}

function messageReceived(turnId: string, message: string) {
  return {
    data: { message, sequence: 1, turnId },
    meta: { at: "2026-08-31T22:00:01.000Z", id: `received-${turnId}` },
    type: "message.received",
  } satisfies Parameters<NonNullable<EvlogEvents["message.received"]>>[0];
}

function messageCompleted(turnId: string, message: string) {
  return {
    data: {
      finishReason: "stop",
      message,
      sequence: 2,
      stepIndex: 0,
      turnId,
    },
    meta: { at: "2026-08-31T22:00:02.000Z", id: `message-${turnId}` },
    type: "message.completed",
  } satisfies Parameters<NonNullable<EvlogEvents["message.completed"]>>[0];
}

function stepStarted(turnId: string) {
  return {
    data: {
      modelId: "openai/gpt-5.6-luna-fast",
      sequence: 2,
      stepIndex: 0,
      turnId,
    },
    meta: { at: "2026-08-31T22:00:02.000Z", id: `step-${turnId}` },
    type: "step.started",
  } satisfies Parameters<NonNullable<EvlogEvents["step.started"]>>[0];
}

function messageAppended(turnId: string) {
  return {
    data: {
      messageDelta: "private output stays omitted",
      messageSoFar: "private output stays omitted",
      sequence: 3,
      stepIndex: 0,
      turnId,
    },
    meta: { at: "2026-08-31T22:00:03.000Z", id: `append-${turnId}` },
    type: "message.appended",
  } satisfies Parameters<NonNullable<EvlogEvents["message.appended"]>>[0];
}

function timingAttributes() {
  return {
    linqAdmissionTiming: JSON.stringify({
      admissionStartedAtMs: 1_788_213_599_000,
      phoneLookupMs: 1,
      scopeVerificationMs: 1,
      scopeVerifiedAtMs: 1_788_213_599_002,
      bridgeSendStartedAtMs: 1_788_213_600_000,
    }),
    workspaceId: "workspace-test",
  };
}

function turnCompleted(turnId: string) {
  return {
    data: { sequence: 3, turnId },
    meta: { at: "2026-08-31T22:00:03.000Z", id: `complete-${turnId}` },
    type: "turn.completed",
  } satisfies Parameters<NonNullable<EvlogEvents["turn.completed"]>>[0];
}
