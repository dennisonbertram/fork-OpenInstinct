import type { LanguageModel } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
type LanguageModelV4 = Extract<
  LanguageModel,
  { readonly specificationVersion: "v4" }
>;
type LanguageModelV4CallOptions = Parameters<LanguageModelV4["doStream"]>[0];
type LanguageModelV4StreamResult = Awaited<
  ReturnType<LanguageModelV4["doStream"]>
>;
type LanguageModelV4StreamPart =
  LanguageModelV4StreamResult["stream"] extends ReadableStream<infer Part>
    ? Part
    : never;

interface EvlogContext {
  linqLatency?: LinqLatencyStages;
}

interface TestState {
  context: EvlogContext;
  env: { mode: string; workspaceId: string };
}

const state = vi.hoisted<TestState>(() => ({
  env: { mode: "on", workspaceId: "workspace-test" },
  context: {},
}));

vi.mock("@/env", () => ({
  env: {
    get LINQ_LATENCY_MODE() {
      return state.env.mode;
    },
    get LINQ_LATENCY_WORKSPACE_ID() {
      return state.env.workspaceId;
    },
  },
}));
vi.mock("evlog/eve", () => ({
  useLogger: () => ({
    getContext: () => ({ eve: state.context }),
    set: (value: { eve: EvlogContext }) => {
      state.context = { ...state.context, ...value.eve };
    },
  }),
}));

import { type LinqLatencyStages, wrapLinqModelDurationProbe } from "./timing";

afterEach(() => {
  state.env = { mode: "on", workspaceId: "workspace-test" };
  state.context = {};
});

describe("Linq model duration probe", () => {
  it("preserves options, response metadata, and chunk order", async () => {
    let received: LanguageModelV4CallOptions | undefined;
    const response = { headers: { "x-provider": "present" } };
    const model = modelWith(async (options) => {
      received = options;
      return resultWith(
        [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: "one" },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: usage(),
          },
        ],
        response
      );
    });

    const wrapped = wrapLinqModelDurationProbe(model, probeInput());
    const result = await wrapped.doStream(callOptions);
    const chunks: string[] = [];
    for await (const part of result.stream) chunks.push(part.type);

    expect(received).toMatchObject({
      headers: { "x-test": "header" },
      providerOptions: { gateway: { trace: true } },
      toolChoice: { type: "auto" },
    });
    expect(result.response).toEqual(response);
    expect(chunks).toEqual(["text-start", "text-delta", "text-end", "finish"]);
    const stages = state.context.linqLatency;
    expect(stages?.firstModelProviderAttemptStarted).toBe(true);
    expect(stages?.admissionToFirstModelProviderStartMs).toEqual(
      expect.any(Number)
    );
    expect(stages?.firstModelProviderDoStreamReturnMs).toEqual(
      expect.any(Number)
    );
    expect(stages?.firstModelProviderTimeToFirstConsumedChunkMs).toEqual(
      expect.any(Number)
    );
    expect(stages?.firstModelProviderConsumedStreamLifetimeMs).toEqual(
      expect.any(Number)
    );
    expect(stages?.firstModelProviderStreamCompleted).toBe(true);
  });

  it("records a rejected doStream as failed without calling it headers-ready", async () => {
    const model = modelWith(async () => {
      throw new Error("provider rejected");
    });
    const wrapped = wrapLinqModelDurationProbe(model, probeInput());

    await expect(wrapped.doStream(callOptions)).rejects.toThrow(
      "provider rejected"
    );
    expect(state.context).toMatchObject({
      linqLatency: { firstModelProviderStreamFailed: true },
    });
    expect(state.context).not.toHaveProperty(
      "linqLatency.firstModelProviderDoStreamReturnMs"
    );
  });

  it("records a reader error and forwards it", async () => {
    const model = modelWith(async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        pull() {
          throw new Error("reader failed");
        },
      }),
    }));
    const wrapped = wrapLinqModelDurationProbe(model, probeInput());
    const result = await wrapped.doStream(callOptions);

    await expect(result.stream.getReader().read()).rejects.toThrow(
      "reader failed"
    );
    expect(state.context).toMatchObject({
      linqLatency: { firstModelProviderStreamFailed: true },
    });
  });

  it("marks an error chunk failed without reading its payload", async () => {
    const model = modelWith(async () =>
      resultWith([
        { type: "error", error: { private: "not logged" } },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: usage(),
        },
      ])
    );
    const wrapped = wrapLinqModelDurationProbe(model, probeInput());
    const result = await wrapped.doStream(callOptions);
    await result.stream.pipeTo(new WritableStream());

    expect(state.context).toMatchObject({
      linqLatency: { firstModelProviderStreamFailed: true },
    });
    expect(JSON.stringify(state.context)).not.toContain("not logged");
  });

  it("defers an error-chunk outcome until the source reaches EOF", async () => {
    let controller:
      | ReadableStreamDefaultController<LanguageModelV4StreamPart>
      | undefined;
    const source = new ReadableStream<LanguageModelV4StreamPart>({
      start(next) {
        controller = next;
      },
    });
    const wrapped = wrapLinqModelDurationProbe(
      modelWith(async () => ({ stream: source })),
      probeInput()
    );
    const result = await wrapped.doStream(callOptions);
    const reader = result.stream.getReader();
    controller?.enqueue({ type: "error", error: "not retained" });
    await reader.read();

    expect(state.context).not.toHaveProperty(
      "linqLatency.firstModelProviderConsumedStreamLifetimeMs"
    );
    expect(state.context).not.toHaveProperty(
      "linqLatency.firstModelProviderStreamFailed"
    );
    controller?.close();
    await reader.read();

    expect(
      state.context.linqLatency?.firstModelProviderConsumedStreamLifetimeMs
    ).toEqual(expect.any(Number));
    expect(state.context.linqLatency?.firstModelProviderStreamFailed).toBe(
      true
    );
  });

  it("returns a locked provider stream unchanged", async () => {
    const source = new ReadableStream<LanguageModelV4StreamPart>();
    const originalReader = source.getReader();
    const wrapped = wrapLinqModelDurationProbe(
      modelWith(async () => ({ stream: source })),
      probeInput()
    );

    const result = await wrapped.doStream(callOptions);

    expect(result.stream).toBe(source);
    originalReader.releaseLock();
  });

  it("records cancellation before a pending read resolves and cancels source once", async () => {
    let resolveRead:
      | ((value: ReadableStreamReadResult<LanguageModelV4StreamPart>) => void)
      | undefined;
    const sourceCancel = vi.fn<(reason: string) => void>();
    const model = modelWith(async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        pull() {
          return new Promise<void>((resolve) => {
            resolveRead = () => {
              resolve();
            };
          });
        },
        cancel: sourceCancel,
      }),
    }));
    const wrapped = wrapLinqModelDurationProbe(model, probeInput());
    const result = await wrapped.doStream(callOptions);
    const reader = result.stream.getReader();
    const reading = reader.read();
    await vi.waitFor(() => {
      expect(resolveRead).toBeDefined();
    });

    await reader.cancel("consumer stopped");
    resolveRead?.({ done: true, value: undefined });
    await reading;

    expect(sourceCancel).toHaveBeenCalledExactlyOnceWith("consumer stopped");
    expect(state.context).toMatchObject({
      linqLatency: { firstModelProviderStreamCancelled: true },
    });
    expect(state.context).not.toHaveProperty(
      "linqLatency.firstModelProviderStreamCompleted"
    );
  });

  it.each([
    ["off", "workspace-test", "linq-message"],
    ["on", "other-workspace", "linq-message"],
    ["on", "workspace-test", "other-authenticator"],
  ])(
    "does not wrap outside the exact probe scope",
    (mode, workspaceId, authenticator) => {
      state.env = { mode, workspaceId };
      const model = modelWith(async () => resultWith([]));

      expect(wrapLinqModelDurationProbe(model, probeInput(authenticator))).toBe(
        model
      );
    }
  );

  it("claims only the first model attempt for one turn", async () => {
    const model = modelWith(async () => resultWith([]));
    const wrapped = wrapLinqModelDurationProbe(model, probeInput());

    await (
      await wrapped.doStream(callOptions)
    ).stream.pipeTo(new WritableStream());
    const afterFirstAttempt = structuredClone(state.context);
    await (
      await wrapped.doStream(callOptions)
    ).stream.pipeTo(new WritableStream());

    expect(state.context).toEqual(afterFirstAttempt);
  });
});

function probeInput(authenticator = "linq-message") {
  return {
    auth: {
      attributes: {
        linqAdmissionTiming: JSON.stringify({
          admissionStartedAtMs: 1,
          phoneLookupMs: 1,
          scopeVerificationMs: 1,
          scopeVerifiedAtMs: 2,
        }),
        workspaceId: "workspace-test",
      },
      authenticator,
      principalId: "user-1",
      principalType: "user",
    },
    sessionId: "session-1",
    turnId: "turn-1",
  };
}

const callOptions = {
  headers: { "x-test": "header" },
  prompt: [],
  providerOptions: { gateway: { trace: true } },
  toolChoice: { type: "auto" },
} satisfies LanguageModelV4CallOptions;

function usage() {
  return {
    inputTokens: {
      cacheRead: undefined,
      cacheWrite: undefined,
      noCache: undefined,
      total: 0,
    },
    outputTokens: { reasoning: undefined, text: 0, total: 0 },
  };
}

function modelWith(
  doStream: (
    options: LanguageModelV4CallOptions
  ) => Promise<LanguageModelV4StreamResult>
) {
  return {
    specificationVersion: "v4",
    provider: "test-provider",
    modelId: "test-model",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("generate is not used by this stream test");
    },
    doStream,
  } satisfies LanguageModelV4;
}

function resultWith(
  parts: LanguageModelV4StreamPart[],
  response?: LanguageModelV4StreamResult["response"]
): LanguageModelV4StreamResult {
  return {
    response,
    stream: new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    }),
  };
}
