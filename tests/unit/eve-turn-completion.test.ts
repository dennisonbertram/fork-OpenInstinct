import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ContextContainer,
  contextStorage,
} from "../../node_modules/eve/dist/src/context/container.js";
import { SessionKey } from "../../node_modules/eve/dist/src/context/keys.js";
import {
  deserializeContext,
  serializeContext,
} from "../../node_modules/eve/dist/src/context/serialize.js";
import {
  consumeTurnCompletionRequest,
  requestTurnCompletion,
} from "../../node_modules/eve/dist/src/context/turn-completion.js";
import type { HarnessSession } from "../../node_modules/eve/dist/src/harness/types.js";
import { TurnCancelledError } from "../../node_modules/eve/dist/src/harness/turn-cancellation.js";

const emissionState = {
  sequence: 4,
  sessionStarted: true,
  stepIndex: 2,
  turnId: "turn_4",
};

const harnessSession: HarnessSession = {
  agent: { dynamicModel: true, system: "", tools: [] },
  compaction: {
    recentWindowSize: 10,
    threshold: 100,
    thresholdPercent: 0.9,
  },
  continuationToken: "continuation-a",
  history: [],
  sessionId: "session-a",
};

function requestState() {
  const context = new ContextContainer();
  context.set(SessionKey, {
    auth: { current: null, initiator: null },
    sessionId: "session-a",
    turn: { id: "turn_4", sequence: 4 },
  });
  return contextStorage.run(context, () => {
    expect(requestTurnCompletion({ callId: "call-a", stepIndex: 2 })).toBe(
      true
    );
    expect(requestTurnCompletion({ callId: "call-a", stepIndex: 2 })).toBe(
      true
    );
    expect(requestTurnCompletion({ callId: "call-b", stepIndex: 2 })).toBe(
      false
    );
    return serializeContext(context);
  });
}

function runReplayProcess(script: string, input?: string) {
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input,
    }
  );
  // SAFETY: each call site validates the child JSON with a result-specific schema.
  return JSON.parse(output) as unknown;
}

const createRequestProcess = `
  import { ContextContainer, contextStorage } from "./node_modules/eve/dist/src/context/container.js";
  import { SessionKey } from "./node_modules/eve/dist/src/context/keys.js";
  import { serializeContext } from "./node_modules/eve/dist/src/context/serialize.js";
  import { requestTurnCompletion } from "./node_modules/eve/dist/src/context/turn-completion.js";

  const context = new ContextContainer();
  context.set(SessionKey, {
    auth: { current: null, initiator: null },
    sessionId: "session-a",
    turn: { id: "turn_4", sequence: 4 },
  });
  const state = contextStorage.run(context, () => {
    requestTurnCompletion({ callId: "call-a", stepIndex: 2 });
    return serializeContext(context);
  });
  process.stdout.write(JSON.stringify({ state }));
`;

const consumeRequestProcess = `
  import { contextStorage } from "./node_modules/eve/dist/src/context/container.js";
  import { deserializeContext, serializeContext } from "./node_modules/eve/dist/src/context/serialize.js";
  import { consumeTurnCompletionRequest } from "./node_modules/eve/dist/src/context/turn-completion.js";

  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { state } = JSON.parse(input);
  const context = await deserializeContext(state);
  const session = {
    agent: { dynamicModel: true, system: "", tools: [] },
    compaction: { recentWindowSize: 10, threshold: 100, thresholdPercent: 0.9 },
    continuationToken: "continuation-a",
    history: [],
    sessionId: "session-a",
  };
  const result = contextStorage.run(context, () => {
    const stale = consumeTurnCompletionRequest({
      completedCallIds: new Set(["call-a"]),
      emissionState: { sequence: 4, sessionStarted: true, stepIndex: 3, turnId: "turn_4" },
      session,
    });
    const consumed = consumeTurnCompletionRequest({
      completedCallIds: new Set(["call-a"]),
      emissionState: { sequence: 4, sessionStarted: true, stepIndex: 2, turnId: "turn_4" },
      session,
    });
    const repeated = consumeTurnCompletionRequest({
      completedCallIds: new Set(["call-a"]),
      emissionState: { sequence: 4, sessionStarted: true, stepIndex: 2, turnId: "turn_4" },
      session,
    });
    return {
      consumed: consumed !== undefined,
      repeated: repeated !== undefined,
      stale: stale !== undefined,
      state: serializeContext(context),
    };
  });
  process.stdout.write(JSON.stringify(result));
`;

const abortRequestProcess = `
  import { contextStorage } from "./node_modules/eve/dist/src/context/container.js";
  import { deserializeContext, serializeContext } from "./node_modules/eve/dist/src/context/serialize.js";
  import { consumeTurnCompletionRequest } from "./node_modules/eve/dist/src/context/turn-completion.js";
  import { TurnCancelledError } from "./node_modules/eve/dist/src/harness/turn-cancellation.js";

  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { state } = JSON.parse(input);
  const context = await deserializeContext(state);
  const controller = new AbortController();
  controller.abort(new TurnCancelledError());
  const session = {
    agent: { dynamicModel: true, system: "", tools: [] },
    compaction: { recentWindowSize: 10, threshold: 100, thresholdPercent: 0.9 },
    continuationToken: "continuation-a",
    history: [],
    sessionId: "session-a",
  };
  const result = contextStorage.run(context, () => {
    let errorName;
    try {
      consumeTurnCompletionRequest({
        abortSignal: controller.signal,
        completedCallIds: new Set(["call-a"]),
        emissionState: { sequence: 4, sessionStarted: true, stepIndex: 2, turnId: "turn_4" },
        session,
      });
    } catch (error) {
      errorName = error instanceof Error ? error.name : String(error);
    }
    return { errorName, state: serializeContext(context) };
  });
  process.stdout.write(JSON.stringify(result));
`;

const completionRequestSchema = z.object({
  callId: z.string(),
  sessionId: z.string(),
  stepIndex: z.number(),
  turnId: z.string(),
});

const serializedContextSchema = z.looseObject({
  "eve.turnCompletionRequest": completionRequestSchema.optional(),
});

const createdProcessSchema = z.object({ state: serializedContextSchema });
const consumedProcessSchema = z.object({
  consumed: z.boolean(),
  repeated: z.boolean(),
  stale: z.boolean(),
  state: serializedContextSchema,
});
const abortedProcessSchema = z.object({
  errorName: z.string().optional(),
  state: serializedContextSchema,
});

describe("installed Eve turn completion request", () => {
  it("persists an exact request across a fresh context and consumes only a matching completed action", async () => {
    const state = requestState();
    expect(state).toMatchObject({
      "eve.turnCompletionRequest": {
        callId: "call-a",
        sessionId: "session-a",
        stepIndex: 2,
        turnId: "turn_4",
      },
    });

    const resumed = await deserializeContext(state);
    contextStorage.run(resumed, () => {
      expect(
        consumeTurnCompletionRequest({
          completedCallIds: new Set(["other-call"]),
          emissionState,
          session: harnessSession,
        })
      ).toBeUndefined();
      expect(serializeContext(resumed)).toMatchObject(state);

      const consumed = consumeTurnCompletionRequest({
        completedCallIds: new Set(["call-a"]),
        emissionState,
        session: harnessSession,
      });
      expect(consumed).toMatchObject({ sessionId: "session-a" });
      expect(serializeContext(resumed)).not.toHaveProperty(
        "eve.turnCompletionRequest"
      );
    });
  });

  it("does not consume a request replayed for another step or turn, and a later turn replaces it", async () => {
    const resumed = await deserializeContext(requestState());
    contextStorage.run(resumed, () => {
      expect(
        consumeTurnCompletionRequest({
          completedCallIds: new Set(["call-a"]),
          emissionState: { ...emissionState, stepIndex: 3 },
          session: harnessSession,
        })
      ).toBeUndefined();
      expect(
        consumeTurnCompletionRequest({
          completedCallIds: new Set(["call-a"]),
          emissionState: { ...emissionState, turnId: "turn_5" },
          session: harnessSession,
        })
      ).toBeUndefined();

      resumed.set(SessionKey, {
        auth: { current: null, initiator: null },
        sessionId: "session-a",
        turn: { id: "turn_5", sequence: 5 },
      });
      expect(requestTurnCompletion({ callId: "call-b", stepIndex: 3 })).toBe(
        true
      );
      expect(serializeContext(resumed)).toMatchObject({
        "eve.turnCompletionRequest": {
          callId: "call-b",
          sessionId: "session-a",
          stepIndex: 3,
          turnId: "turn_5",
        },
      });
    });
  });

  it("leaves the request durable when the native turn signal is already aborted", async () => {
    const resumed = await deserializeContext(requestState());
    const controller = new AbortController();
    controller.abort(new TurnCancelledError());

    contextStorage.run(resumed, () => {
      expect(() =>
        consumeTurnCompletionRequest({
          abortSignal: controller.signal,
          completedCallIds: new Set(["call-a"]),
          emissionState,
          session: harnessSession,
        })
      ).toThrow(TurnCancelledError);
      expect(serializeContext(resumed)).toMatchObject({
        "eve.turnCompletionRequest": { callId: "call-a" },
      });
    });
  });

  it("hydrates the exact request in a separate Node process without stale or repeated completion", () => {
    const created = createdProcessSchema.parse(
      runReplayProcess(createRequestProcess)
    );
    expect(created.state).toMatchObject({
      "eve.turnCompletionRequest": {
        callId: "call-a",
        sessionId: "session-a",
        stepIndex: 2,
        turnId: "turn_4",
      },
    });

    const consumed = consumedProcessSchema.parse(
      runReplayProcess(consumeRequestProcess, JSON.stringify(created))
    );
    expect(consumed).toMatchObject({
      consumed: true,
      repeated: false,
      stale: false,
    });
    expect(consumed.state).not.toHaveProperty("eve.turnCompletionRequest");

    const aborted = abortedProcessSchema.parse(
      runReplayProcess(abortRequestProcess, JSON.stringify(created))
    );
    expect(aborted.errorName).toBe("TurnCancelledError");
    expect(aborted.state).toMatchObject({
      "eve.turnCompletionRequest": { callId: "call-a" },
    });
  });
});
