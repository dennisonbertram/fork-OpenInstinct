import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("LINQ_LATENCY_MODE", "on");
vi.stubEnv("LINQ_LATENCY_WORKSPACE_ID", "workspace-test");

const { default: instrumentation } = await import("@/agent/instrumentation");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Linq latency instrumentation", () => {
  it("exposes scoped admission timing on the model step", () => {
    const result = instrumentation.events["step.started"]({
      channel: { kind: "channel:linq", metadata: {} },
      modelInput: { instructions: undefined, messages: [] },
      session: {
        auth: {
          current: {
            attributes: {
              linqAdmissionTiming: JSON.stringify({
                admissionStartedAtMs: 100,
                phoneLookupMs: 1,
                scopeVerificationMs: 1,
                scopeVerifiedAtMs: 102,
              }),
              workspaceId: "workspace-test",
            },
            authenticator: "linq-message",
            principalId: "better-auth:test",
            principalType: "user",
          },
          initiator: null,
        },
        id: "test-session",
      },
      step: { index: 0 },
      turn: { id: "test-turn", sequence: 0 },
    });

    expect(result).toBeDefined();
    if (!result) throw new Error("Expected scoped timing runtime context.");
    expect(result.runtimeContext.linqLatency?.admissionStartedAtMs).toBe(100);
  });

  it("does not expose timing outside the exact verified workspace", () => {
    const result = instrumentation.events["step.started"]({
      channel: { kind: "channel:linq", metadata: {} },
      modelInput: { instructions: undefined, messages: [] },
      session: {
        auth: {
          current: {
            attributes: {
              linqAdmissionTiming: JSON.stringify({
                admissionStartedAtMs: 100,
                phoneLookupMs: 1,
                scopeVerificationMs: 1,
                scopeVerifiedAtMs: 102,
              }),
              workspaceId: "other-workspace",
            },
            authenticator: "linq-message",
            principalId: "better-auth:other",
            principalType: "user",
          },
          initiator: null,
        },
        id: "other-session",
      },
      step: { index: 0 },
      turn: { id: "other-turn", sequence: 0 },
    });

    expect(result).toBeUndefined();
  });
});
