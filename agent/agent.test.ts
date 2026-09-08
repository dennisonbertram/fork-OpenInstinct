import type { DynamicResolveContext } from "eve";
import { streamText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contractFixtureModel } from "@/evals/contract/fixture-model";
import type { finalDeliveryStatus } from "@/agent/lib/message-delivery";
import type { getGatewayModel } from "@/db/services/settings";
import type { isScheduledAgentRunLeaseActive } from "@/db/services/scheduled-agent-run-leases";

const services = vi.hoisted(() => ({
  getModel: vi.fn<typeof getGatewayModel>(),
  isActive: vi.fn<typeof isScheduledAgentRunLeaseActive>(),
  deliveryStatus: vi.fn<typeof finalDeliveryStatus>(),
}));

vi.mock("eve", () => ({
  defineAgent: <T>(definition: T) => definition,
  defineDynamic: <T>(definition: T) => definition,
}));
vi.mock("@/env", () => ({ isContractFixtureEnabled: () => true }));
vi.mock("@/db/services/settings", () => ({
  getGatewayModel: services.getModel,
}));
vi.mock("@/db/services/scheduled-agent-run-leases", () => ({
  isScheduledAgentRunLeaseActive: services.isActive,
}));
vi.mock("@/agent/lib/message-delivery", () => ({
  finalDeliveryStatus: services.deliveryStatus,
}));

const agent = await import("./agent");

describe("interactive model delivery resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    services.deliveryStatus.mockReturnValue(undefined);
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
});

async function resolveStepModel(
  channelKind: DynamicResolveContext["channel"]["kind"],
  authenticator = "test"
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
      messages: [],
      session: {
        auth: {
          current: {
            attributes: {},
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
