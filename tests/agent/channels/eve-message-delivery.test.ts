import type { EveChannelInput } from "eve/channels/eve";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  finalizeScheduledReport,
  releaseScheduledReport,
} from "@/db/services/scheduled-agent-jobs";

const channelCapture = vi.hoisted(() => {
  const configs: EveChannelInput[] = [];
  return { configs };
});
const delivery = vi.hoisted(() => ({
  finalize: vi.fn<typeof finalizeScheduledReport>(),
  release: vi.fn<typeof releaseScheduledReport>(),
}));
const completion = vi.hoisted(() => ({
  request: vi.fn<(callId: string, turnId: string, stepIndex: number) => void>(),
}));

vi.mock(import("eve/channels/eve"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    eveChannel(config: EveChannelInput) {
      channelCapture.configs.push(config);
      return original.eveChannel(config);
    },
  };
});
vi.mock("@/db/services/scheduled-agent-jobs", () => ({
  finalizeScheduledReport: delivery.finalize,
  releaseScheduledReport: delivery.release,
}));
vi.mock("@/agent/lib/message-delivery", async (importOriginal) => ({
  ...(await importOriginal()),
  requestFinalDeliveryCompletion: completion.request,
}));

// Loads the production channel so the mocked factory captures its event configuration.
await import("@/agent/channels/eve");

const events = channelCapture.configs[0]?.events;
const handleActionResult = events?.["action.result"];
const handleMessageCompleted = events?.["message.completed"];
if (!handleActionResult || !handleMessageCompleted) {
  throw new Error("The Eve channel must configure scheduled report delivery.");
}

type ActionParameters = Parameters<typeof handleActionResult>;

describe("Eve scheduled report delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delivery.finalize.mockResolvedValue(true);
    delivery.release.mockResolvedValue(true);
    completion.request.mockReset();
  });

  it("finalizes a report when send_message completes", async () => {
    await handleActionResult(
      {
        result: {
          callId: "call-send-message",
          kind: "tool-result",
          output: { kind: "message", text: "The price fell." },
          toolName: "send_message",
        },
        sequence: 0,
        status: "completed",
        stepIndex: 0,
        turnId: "turn-1",
      },
      {},
      scheduledReportSession()
    );

    expect(delivery.finalize).toHaveBeenCalledExactlyOnceWith(
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000004",
      "delivered"
    );
    expect(completion.request).not.toHaveBeenCalled();
  });

  it("requests completion for an interactive accepted send", async () => {
    await handleActionResult(
      {
        result: {
          callId: "call-send-message",
          kind: "tool-result",
          output: { kind: "message", text: "The price fell." },
          toolName: "send_message",
        },
        sequence: 0,
        status: "completed",
        stepIndex: 0,
        turnId: "turn-1",
      },
      {},
      interactiveSession()
    );

    expect(completion.request).toHaveBeenCalledExactlyOnceWith(
      "call-send-message",
      "turn-1",
      0
    );
  });

  it("does not finalize or request completion for tool-calls text", async () => {
    await handleMessageCompleted(
      {
        finishReason: "tool-calls",
        message: "Internal tool text",
        sequence: 0,
        stepIndex: 0,
        turnId: "turn-1",
      },
      {},
      scheduledReportSession()
    );

    expect(delivery.finalize).not.toHaveBeenCalled();
    expect(completion.request).not.toHaveBeenCalled();
  });

  it("does not request completion when scheduled bookkeeping rejects", async () => {
    delivery.finalize.mockRejectedValueOnce(new Error("bookkeeping failed"));

    await expect(
      handleActionResult(
        {
          result: {
            callId: "call-send-message",
            kind: "tool-result",
            output: { kind: "message", text: "The price fell." },
            toolName: "send_message",
          },
          sequence: 0,
          status: "completed",
          stepIndex: 0,
          turnId: "turn-1",
        },
        {},
        scheduledReportSession()
      )
    ).rejects.toThrow("bookkeeping failed");
    expect(completion.request).not.toHaveBeenCalled();
  });

  it("suppresses a report when the turn finishes without send_message", async () => {
    await handleMessageCompleted(
      {
        finishReason: "stop",
        message: "Internal final text",
        sequence: 0,
        stepIndex: 0,
        turnId: "turn-1",
      },
      {},
      scheduledReportSession()
    );

    expect(delivery.finalize).toHaveBeenCalledExactlyOnceWith(
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000004",
      "suppressed"
    );
  });
});

describe("Eve reaction delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delivery.finalize.mockResolvedValue(true);
    delivery.release.mockResolvedValue(true);
    completion.request.mockReset();
  });

  it("requests completion for an interactive accepted reaction add", async () => {
    await handleActionResult(
      reactToMessageResult({ operation: "add", type: "heart" }),
      {},
      interactiveSession()
    );

    expect(completion.request).toHaveBeenCalledExactlyOnceWith(
      "call-react-to-message",
      "turn-1",
      0
    );
    expect(delivery.finalize).not.toHaveBeenCalled();
  });

  it("does not request completion for reaction remove", async () => {
    await handleActionResult(
      reactToMessageResult({ operation: "remove", type: "heart" }),
      {},
      interactiveSession()
    );

    expect(completion.request).not.toHaveBeenCalled();
    expect(delivery.finalize).not.toHaveBeenCalled();
  });

  it("does not request completion for a failed reaction action", async () => {
    await handleActionResult(
      reactToMessageResult(
        { operation: "add", type: "heart" },
        "failed"
      ),
      {},
      interactiveSession()
    );

    expect(completion.request).not.toHaveBeenCalled();
  });

  it("does not request completion for a malformed reaction result", async () => {
    await handleActionResult(
      {
        result: {
          callId: "call-react-to-message",
          kind: "tool-result",
          output: { operation: "add" },
          toolName: "react_to_message",
        },
        sequence: 0,
        status: "completed",
        stepIndex: 0,
        turnId: "turn-1",
      },
      {},
      interactiveSession()
    );

    expect(completion.request).not.toHaveBeenCalled();
  });

  it("does not request completion for an arbitrary tool result", async () => {
    await handleActionResult(
      {
        result: {
          callId: "call-other",
          kind: "tool-result",
          output: {},
          toolName: "load_skill",
        },
        sequence: 0,
        status: "completed",
        stepIndex: 0,
        turnId: "turn-1",
      },
      {},
      interactiveSession()
    );

    expect(completion.request).not.toHaveBeenCalled();
  });

  it("finalizes a report and does not request completion for a scheduled reaction", async () => {
    await handleActionResult(
      reactToMessageResult({ operation: "add", type: "heart" }),
      {},
      scheduledReportSession()
    );

    expect(delivery.finalize).toHaveBeenCalledExactlyOnceWith(
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000004",
      "delivered"
    );
    expect(completion.request).not.toHaveBeenCalled();
  });
});

function reactToMessageResult(
  output: { operation: "add" | "remove"; type: string },
  status: "completed" | "failed" = "completed"
): ActionParameters[0] {
  return {
    result: {
      callId: "call-react-to-message",
      kind: "tool-result",
      output,
      toolName: "react_to_message",
    },
    sequence: 0,
    status,
    stepIndex: 0,
    turnId: "turn-1",
  };
}

function scheduledReportSession() {
  return {
    async getSandbox() {
      throw new Error("Sandbox access is outside this focused test.");
    },
    getSkill() {
      throw new Error("Skill access is outside this focused test.");
    },
    session: {
      auth: {
        current: {
          attributes: {
            scheduledReportLeaseToken: "00000000-0000-4000-8000-000000000004",
            scheduledReportSequence: "1",
            scheduledRunId: "00000000-0000-4000-8000-000000000002",
          },
          authenticator: "scheduled-result",
          principalId: "user-1",
          principalType: "user",
        },
        initiator: null,
      },
      id: "session-1",
      turn: { id: "turn-1", sequence: 0 },
    },
  } satisfies ActionParameters[2];
}

function interactiveSession() {
  return {
    async getSandbox() {
      throw new Error("Sandbox access is outside this focused test.");
    },
    getSkill() {
      throw new Error("Skill access is outside this focused test.");
    },
    session: {
      auth: {
        current: {
          attributes: {},
          authenticator: "authjs",
          principalId: "user-1",
          principalType: "user" as const,
        },
        initiator: null,
      },
      id: "session-1",
      turn: { id: "turn-1", sequence: 0 },
    },
  } satisfies ActionParameters[2];
}
