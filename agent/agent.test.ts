import type { DynamicResolveContext } from "eve";
import { streamText, type LanguageModel } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contractFixtureModel } from "@/evals/contract/fixture-model";
import type { LinqLatencyStages } from "@/agent/lib/linq/timing";
import type { finalDeliveryStatus } from "@/agent/lib/message-delivery";
import type { reconcileBackgroundTasks } from "@/agent/lib/completion-obligations";
import type { getGatewayModel } from "@/db/services/settings";
import type { isScheduledAgentRunLeaseActive } from "@/db/services/scheduled-agent-run-leases";

interface EvlogContext {
  linqLatency?: LinqLatencyStages;
}

interface TestServices {
  contractFixtureEnabled: boolean;
  deliveryStatus: ReturnType<typeof vi.fn<typeof finalDeliveryStatus>>;
  evlogContext: EvlogContext;
  gateway: ReturnType<typeof vi.fn<(modelId: string) => LanguageModel>>;
  getModel: ReturnType<typeof vi.fn<typeof getGatewayModel>>;
  isActive: ReturnType<typeof vi.fn<typeof isScheduledAgentRunLeaseActive>>;
  /** Cohorts the mocked obligations module reports as owing a summary. */
  owedCohorts: { readonly cohortId: string }[];
  reconcile: ReturnType<typeof vi.fn<typeof reconcileBackgroundTasks>>;
}

const services = vi.hoisted<TestServices>(() => ({
  getModel: vi.fn<typeof getGatewayModel>(),
  isActive: vi.fn<typeof isScheduledAgentRunLeaseActive>(),
  deliveryStatus: vi.fn<typeof finalDeliveryStatus>(),
  reconcile: vi.fn<typeof reconcileBackgroundTasks>(),
  owedCohorts: [],
  gateway: vi.fn<(modelId: string) => LanguageModel>(),
  contractFixtureEnabled: true,
  evlogContext: {},
}));

vi.mock("eve", () => ({
  defineAgent: <T>(definition: T) => definition,
  defineDynamic: <T>(definition: T) => definition,
}));
vi.mock("@/env", () => ({
  env: {
    LINQ_LATENCY_MODE: "on",
    LINQ_LATENCY_WORKSPACE_ID: "workspace-test",
  },
  isContractFixtureEnabled: () => services.contractFixtureEnabled,
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal()),
  gateway: services.gateway,
}));
vi.mock("evlog/eve", () => ({
  useLogger: () => ({
    getContext: () => ({ eve: services.evlogContext }),
    set: (value: { eve: EvlogContext }) => {
      services.evlogContext = { ...services.evlogContext, ...value.eve };
    },
  }),
}));
vi.mock("@/db/services/settings", () => ({
  getGatewayModel: services.getModel,
}));
vi.mock("@/db/services/scheduled-agent-run-leases", () => ({
  isScheduledAgentRunLeaseActive: services.isActive,
}));
vi.mock("@/agent/lib/message-delivery", () => ({
  finalDeliveryStatus: services.deliveryStatus,
}));
// Reconciliation reads the framework's task projections, which need an active
// eve context. Mocked at its owning boundary, like the delivery status above.
vi.mock("@/agent/lib/completion-obligations", () => ({
  reconcileBackgroundTasks: services.reconcile,
  // Forcing is derived from what is owed. Most cases here are about model and
  // lease resolution and leave this empty; the delivery-guard wiring cases below
  // put a cohort in it so a report is genuinely owed.
  reportableCohorts: () => services.owedCohorts,
}));

const agent = await import("./agent");

describe("interactive model delivery resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    services.deliveryStatus.mockReturnValue(undefined);
    services.contractFixtureEnabled = true;
    services.gateway.mockReset();
    services.evlogContext = {};
    services.owedCohorts = [];
  });

  it("turns the silent Linq fixture's automatic choice into the AI SDK required-tool object", async () => {
    let received:
      | {
          headers: unknown;
          providerOptions: unknown;
          toolChoice: unknown;
        }
      | undefined;
    const originalDoStream =
      contractFixtureModel.doStream.bind(contractFixtureModel);
    vi.spyOn(contractFixtureModel, "doStream").mockImplementation(
      async (options) => {
        received = {
          headers: options.headers,
          providerOptions: options.providerOptions,
          toolChoice: options.toolChoice,
        };
        return originalDoStream(options);
      }
    );

    const selection = await resolveStepModel("channel:linq");
    const result = streamText({
      headers: { "x-test": "header" },
      messages: [{ content: "silent", role: "user" }],
      model: selection.model,
      providerOptions: { gateway: { trace: true } },
      toolChoice: "auto",
      tools: {},
    });
    await result.consumeStream();

    expect(received).toEqual({
      headers: { "x-test": "header" },
      providerOptions: { gateway: { trace: true } },
      toolChoice: { type: "required" },
    });
  });

  it("turns the silent Eve fixture's automatic choice into the AI SDK required-tool object", async () => {
    let receivedToolChoice: unknown;
    const originalDoStream =
      contractFixtureModel.doStream.bind(contractFixtureModel);
    vi.spyOn(contractFixtureModel, "doStream").mockImplementation(
      async (options) => {
        receivedToolChoice = options.toolChoice;
        return originalDoStream(options);
      }
    );

    const selection = await resolveStepModel("channel:eve");
    const result = streamText({
      messages: [{ content: "silent", role: "user" }],
      model: selection.model,
      toolChoice: "auto",
      tools: {},
    });
    await result.consumeStream();

    expect(receivedToolChoice).toEqual({ type: "required" });
  });

  it.each([
    ["http", "test"],
    ["channel:linq", "scheduled-result"],
  ] as const)(
    "leaves %s/%s model calls on their existing automatic choice",
    async (channelKind, authenticator) => {
      let receivedToolChoice: unknown;
      const originalDoStream =
        contractFixtureModel.doStream.bind(contractFixtureModel);
      vi.spyOn(contractFixtureModel, "doStream").mockImplementation(
        async (options) => {
          receivedToolChoice = options.toolChoice;
          return originalDoStream(options);
        }
      );

      const selection = await resolveStepModel(channelKind, authenticator);
      const result = streamText({
        messages: [{ content: "silent", role: "user" }],
        model: selection.model,
        toolChoice: "auto",
        tools: {},
      });
      await result.consumeStream();

      expect(receivedToolChoice).toEqual({ type: "auto" });
    }
  );
  it("records scoped gateway model stream timing after a consumed stream", async () => {
    services.contractFixtureEnabled = false;
    services.getModel.mockResolvedValue("openai/gpt-5.6-luna-fast");
    services.gateway.mockReturnValue(contractFixtureModel);

    const selection = await resolveStepModel("channel:linq", "linq-message", {
      workspaceId: "workspace-test",
      linqAdmissionTiming: JSON.stringify({
        admissionStartedAtMs: 1,
        phoneLookupMs: 1,
        scopeVerificationMs: 1,
        scopeVerifiedAtMs: 2,
      }),
    });
    const result = streamText({
      messages: [{ content: "silent", role: "user" }],
      model: selection.model,
      tools: {},
    });
    await result.consumeStream();

    const stages = services.evlogContext.linqLatency;
    expect(stages?.firstModelProviderAttemptStarted).toBe(true);
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
  it.each([
    {
      expected: { type: "required" },
      history: [{ content: "look up the top story", role: "user" as const }],
      id: "DG-04",
      what: "leaves a new user request free to act",
    },
    {
      expected: { toolName: "send_message", type: "tool" },
      history: [{ content: "on it", role: "assistant" as const }],
      id: "DG-05",
      what: "still steers a wake with no new user message to send_message",
    },
  ])("$id: an owed report $what", async ({ expected, history }) => {
    // The guard's own cases prove the decision. These prove the wiring: agent.ts
    // derives the signal from ctx.messages, and if that derivation is lost the
    // fix stops working in production while every guard-level case still passes.
    services.owedCohorts = [{ cohortId: "turn_old" }];
    let receivedToolChoice: unknown;
    const originalDoStream =
      contractFixtureModel.doStream.bind(contractFixtureModel);
    vi.spyOn(contractFixtureModel, "doStream").mockImplementation(
      async (options) => {
        receivedToolChoice = options.toolChoice;
        return originalDoStream(options);
      }
    );

    const selection = await resolveStepModel(
      "channel:linq",
      "test",
      {},
      history
    );
    const result = streamText({
      messages: [{ content: "silent", role: "user" }],
      model: selection.model,
      toolChoice: "auto",
      tools: {},
    });
    await result.consumeStream();

    expect(receivedToolChoice).toEqual(expected);
  });
});

async function resolveStepModel(
  channelKind: DynamicResolveContext["channel"]["kind"],
  authenticator = "test",
  attributes: Record<string, string> = {},
  messages: DynamicResolveContext["messages"] = []
): Promise<
  Awaited<
    ReturnType<NonNullable<(typeof agent.default.model.events)["step.started"]>>
  >
> {
  const resolve = agent.default.model.events["step.started"];
  if (!resolve) throw new Error("Expected a step-started model resolver.");
  const selection = await resolve(
    { data: { turnId: "turn-1" } },
    {
      channel: { kind: channelKind },
      messages,
      session: {
        auth: {
          current: {
            attributes,
            authenticator,
            principalId: "user-1",
            principalType: "user",
          },
          initiator: null,
        },
        id: "session-1",
      },
    }
  );
  return selection;
}
