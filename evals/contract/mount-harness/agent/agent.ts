import { defineAgent, defineDynamic } from "eve";
import {
  mockModel,
  type MockModelRequest,
  type MockModelResponse,
} from "eve/evals";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { env } from "../env";
import { recordRuntimeNotice } from "./lib/contract-delivery-provider";

type LanguageModelV3 = Extract<
  LanguageModel,
  { readonly specificationVersion: "v3" }
>;

export default defineAgent({
  model: defineDynamic({
    events: {
      async "step.started"(event, context) {
        const value = z
          .object({
            data: z
              .object({
                stepIndex: z.number().int().nonnegative().optional(),
                turnId: z.string().min(1).optional(),
              })
              .optional(),
            stepIndex: z.number().int().nonnegative().optional(),
            turnId: z.string().min(1).optional(),
          })
          .parse(event);
        const stepIndex = value.stepIndex ?? value.data?.stepIndex;
        const turnId = value.turnId ?? value.data?.turnId;
        if (stepIndex === undefined || !turnId) {
          throw new Error("Fixture model step is missing runtime identity.");
        }
        await recordRuntimeNotice(
          {
            sessionId: context.session.id,
            stepIndex,
            turnId,
          },
          "model.step.started"
        );
        return {
          model: mountFixtureModel,
          modelContextWindowTokens: 128_000,
        };
      },
    },
  }),
});

const mountFixtureModel = mockModel({
  modelId: "mount-fixture",
  provider: "openinstinct-contract-fixtures",
  respond(request) {
    const commandKey = (request.lastUserMessage ?? "none").replace(
      /[^a-z0-9]+/giu,
      "-"
    );
    const turnPrefix = `mount-${String(request.userMessageCount)}-${commandKey}-`;
    const response = respond({
      ...request,
      toolResults: request.toolResults.filter((result) =>
        result.id.startsWith(turnPrefix)
      ),
    });
    return {
      ...response,
      toolCalls: response.toolCalls?.map((call, index) =>
        Object.assign({}, call, {
          id: `${turnPrefix}${String(request.toolResults.length)}-${String(index)}`,
        })
      ),
    };
  },
});

if (!isLanguageModelV3(mountFixtureModel)) {
  throw new Error("The mount fixture requires the AI SDK V3 stream model.");
}

const mountFixtureDoStream = mountFixtureModel.doStream.bind(mountFixtureModel);
mountFixtureModel.doStream = async (options) => {
  const result = await mountFixtureDoStream(options);
  return lastUserPrompt(options) === "linq-source-error"
    ? { ...result, stream: failAfterToolCall(result.stream) }
    : result;
};

function respond(request: MockModelRequest): MockModelResponse {
  if (JSON.stringify(request).includes(env.CONTRACT_MCP_TOKEN)) {
    throw new Error("The connection credential reached the model request.");
  }

  const command = request.lastUserMessage?.trim() ?? "";
  if (
    command === "linq-final-timeout" ||
    command === "linq-final-normal" ||
    command === "linq-final-rejected" ||
    command === "linq-source-error" ||
    command === "linq-final-held-ack" ||
    command === "linq-final-held-ack-cancel"
  ) {
    const sentFinal = request.toolResults.some(
      (result) => result.name === "send_message"
    );
    if (sentFinal) {
      if (request.tools.some((tool) => tool.name === "send_message")) {
        throw new Error("Linq provider acknowledgement was not persisted");
      }
      if (command === "linq-final-rejected") {
        return { text: "DELIVERY_UNCONFIRMED" };
      }
      if (command === "linq-final-timeout") {
        throw new Error("contract fixture late model timeout after Linq ACK");
      }
      return { text: "DELIVERY_COMPLETE" };
    }
    return {
      toolCalls: [
        {
          input: {
            final: true,
            kind: "message",
            text:
              command === "linq-final-rejected"
                ? "Linq fixture rejected"
                : command === "linq-final-held-ack"
                  ? "Linq fixture held ACK"
                  : command === "linq-final-held-ack-cancel"
                    ? "Linq fixture held ACK cancel"
                    : "Linq fixture final",
          },
          name: "send_message",
        },
      ],
    };
  }

  if (
    command === "linq-final-progress" ||
    command === "linq-final-failed-sibling" ||
    command === "linq-final-held-success" ||
    command === "linq-final-held-failure" ||
    command === "linq-final-held-cancel"
  ) {
    if (request.toolResults.length > 0) {
      if (request.tools.some((tool) => tool.name === "send_message")) {
        throw new Error("Linq provider acknowledgement was not persisted");
      }
      throw new Error("contract fixture late model timeout after Linq ACK");
    }
    return {
      toolCalls:
        command === "linq-final-progress"
          ? [
              {
                input: {
                  final: false,
                  kind: "message",
                  text: "Linq fixture progress",
                },
                name: "send_message",
              },
              {
                input: {
                  final: true,
                  kind: "message",
                  text: "Linq fixture final",
                },
                name: "send_message",
              },
            ]
          : command === "linq-final-failed-sibling"
            ? [
                {
                  input: {
                    final: true,
                    kind: "message",
                    text: "Linq fixture final",
                  },
                  name: "send_message",
                },
                {
                  input: {
                    final: false,
                    kind: "message",
                    text: "Linq fixture sibling",
                  },
                  name: "send_message",
                },
              ]
            : [
                {
                  input: {
                    mode:
                      command === "linq-final-held-failure"
                        ? "failure"
                        : "success",
                  },
                  name: "hold_work",
                },
                {
                  input: {
                    final: true,
                    kind: "message",
                    text: "Linq fixture final",
                  },
                  name: "send_message",
                },
              ],
    };
  }

  const skill = /^load\s+(\S+)$/u.exec(command)?.[1];
  if (skill) {
    if (request.toolResults.length > 0) return { text: "SKILL LOADED" };
    return { toolCalls: [{ name: "load_skill", input: { skill } }] };
  }

  const match = /^call\s+(\S+)\s+([\s\S]+)$/u.exec(command);
  if (!match?.[1] || !match[2]) throw new Error("Invalid mount command.");

  if (request.toolResults.length > 0) {
    const lastResult = request.toolResults.at(-1);
    if (
      lastResult?.name === "connection_search" &&
      match[1] !== "connection_search"
    ) {
      return { toolCalls: [{ name: match[1], input: JSON.parse(match[2]) }] };
    }
    return { text: `RESULT ${JSON.stringify(lastResult?.output)}` };
  }

  if (
    match[1].split("__").length > 2 &&
    !request.tools.some((tool) => tool.name === match[1])
  ) {
    return {
      toolCalls: [{ name: "connection_search", input: { keywords: "echo" } }],
    };
  }
  return { toolCalls: [{ name: match[1], input: JSON.parse(match[2]) }] };
}

function lastUserPrompt(
  options: Parameters<typeof mountFixtureDoStream>[0]
): string | undefined {
  const message = options.prompt.findLast((entry) => entry.role === "user");
  if (!message || !Array.isArray(message.content)) return undefined;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function failAfterToolCall<T>(stream: ReadableStream<T>) {
  return new ReadableStream<T>({
    async start(controller) {
      const reader = stream.getReader();
      try {
        await forwardUntilToolCall(reader, controller);
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

async function forwardUntilToolCall<T>(
  reader: ReadableStreamDefaultReader<T>,
  controller: ReadableStreamDefaultController<T>
): Promise<void> {
  const next = await reader.read();
  if (next.done) {
    controller.close();
    return;
  }
  controller.enqueue(next.value);
  if (
    z.object({ type: z.literal("tool-call") }).safeParse(next.value).success
  ) {
    await reader
      .cancel("contract fixture injected source stream failure")
      .catch(() => undefined);
    controller.error(
      new Error("contract fixture original source stream failed")
    );
    return;
  }
  await forwardUntilToolCall(reader, controller);
}

function isLanguageModelV3(model: LanguageModel): model is LanguageModelV3 {
  return z.object({ specificationVersion: z.literal("v3") }).safeParse(model)
    .success;
}
