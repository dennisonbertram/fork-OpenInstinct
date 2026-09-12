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
      channel: "channel:linq" as const,
      expected: { type: "required" },
      history: [{ content: "look up the top story", role: "user" as const }],
      id: "DG-04",
      what: "leaves a new user request free to act",
    },
    {
      channel: "channel:linq" as const,
      expected: { toolName: "send_message", type: "tool" },
      history: [{ content: "on it", role: "assistant" as const }],
      id: "DG-05",
      what: "still steers a wake with no new user message to send_message",
    },
    {
      // Production runs on SendBlue, not Linq. Both earlier cases used a Linq
      // history, so removing the relaxation for SendBlue alone would have left
      // them green while the live channel kept the original block.
      channel: "channel:sendblue" as const,
      expected: { type: "required" },
      history: [{ content: "look up the top story", role: "user" as const }],
      id: "DG-06",
      what: "leaves a new user request free to act on the live SendBlue channel",
    },
    {
      // eve injects these announcements under the USER role and its own source
      // warns they must not drive parsing. Counted as a request, a report-only
      // wake would escape the summary it owes. The text is the shape eve's
      // `harness/handles/prompt.js` actually renders, not a paraphrase.
      channel: "channel:sendblue" as const,
      expected: { toolName: "send_message", type: "tool" },
      history: [{ content: agentsAnnouncement, role: "user" as const }],
      id: "DG-07",
      what: "does not mistake a framework [Agents] note for a user request",
    },
    {
      // The shape eve's `tasks/delivery-context.js` emits: the label, then the
      // JSON cohort listing. Read as a request, the wake that exists to deliver
      // the report is freed from delivering it.
      channel: "channel:sendblue" as const,
      expected: { toolName: "send_message", type: "tool" },
      history: [{ content: taskStateNote, role: "user" as const }],
      id: "DG-09",
      what: "does not mistake a [Task state] wake note for a user request",
    },
    {
      // The whole wake, in the order eve appends it: `harness/tool-loop.js`
      // pushes the turn input's context entries first and its message after,
      // so the note is NOT last -- the unlabelled completion notification is.
      // Judging by the newest message alone read the wake as a new user
      // request and let it skip the report it was woken to deliver.
      channel: "channel:sendblue" as const,
      expected: { toolName: "send_message", type: "tool" },
      history: [
        { content: taskStateNote, role: "user" as const },
        {
          content:
            'Background task task_a (browser-agent) is completed.\n\nResult:\nThe top story is "A title".',
          role: "user" as const,
        },
      ],
      id: "DG-10",
      what: "reads the whole wake, not only its last message",
    },
    {
      // eve can append an [Agents] announcement after a tool receipt while the
      // user's request still has calls to make. Treating the announcement as
      // "no request pending" forced the old report in place of the next call.
      channel: "channel:sendblue" as const,
      expected: { type: "required" },
      history: [
        {
          content: [
            {
              output: { type: "text" as const, value: "accepted" },
              toolCallId: "call_worker_1",
              toolName: "browser-agent",
              type: "tool-result" as const,
            },
          ],
          role: "tool" as const,
        },
        { content: agentsAnnouncement, role: "user" as const },
      ],
      id: "DG-11",
      what: "still lets a request finish when an [Agents] note lands mid-turn",
    },
    {
      // The label alone proves nothing about who wrote the message: SendBlue's
      // inbound path keeps the user's text verbatim, so a person can send one
      // that opens with it. The framework note's shape -- label, newline, JSON
      // cohort listing -- is what separates them.
      channel: "channel:sendblue" as const,
      expected: { type: "required" },
      history: [
        {
          content: "[Task state] check whether my export finished",
          role: "user" as const,
        },
      ],
      id: "DG-12",
      what: "does not discard a user message that merely opens with the label",
    },
    {
      // Mid-turn the newest entry is a tool result while the request is still
      // unfinished; forcing here reinstated the original block as soon as a
      // lookup needed a second call.
      channel: "channel:sendblue" as const,
      expected: { type: "required" },
      history: [
        {
          content: [
            {
              output: { type: "text" as const, value: "page one of three" },
              toolCallId: "call_lookup_1",
              toolName: "browser-agent",
              type: "tool-result" as const,
            },
          ],
          role: "tool" as const,
        },
      ],
      id: "DG-08",
      what: "keeps a half-finished request free to make its next call",
    },
  ])("$id: an owed report $what", async ({ channel, expected, history }) => {
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

    const selection = await resolveStepModel(channel, "test", {}, history);
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

const agentsAnnouncement =
  '[Agents]\n<agents>\n<agent id="a" name="browser-agent" availability="busy" taskId="task_a" taskStatus="working">(busy)</agent>\n</agents>';

const taskStateNote = `[Task state]\n${JSON.stringify({
  tasks: [
    {
      name: "browser-agent",
      output: { data: "The top story is a title." },
      status: "completed",
      taskId: "task_a",
    },
  ],
})}`;

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
