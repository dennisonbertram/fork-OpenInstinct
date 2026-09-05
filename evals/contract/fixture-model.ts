import {
  mockModel,
  type MockModelRequest,
  type MockModelResponse,
  type MockModelToolCall,
} from "eve/evals";
import type { LanguageModel } from "ai";
import { z } from "zod";

type LanguageModelV3 = Extract<
  LanguageModel,
  { readonly specificationVersion: "v3" }
>;

const deliveryTools = new Set(["react_to_message", "send_message"]);
const languageModelV3Schema = z.object({
  specificationVersion: z.literal("v3"),
});
const reactionTypes = new Set([
  "exclamation",
  "heart",
  "laugh",
  "question",
  "thumbs_down",
  "thumbs_up",
]);

const fixtureModel = mockModel({
  modelId: "contract-fixture",
  provider: "openinstinct-contract-fixtures",
  respond(request) {
    // The SDK includes tool results from the entire conversation. Own the
    // fixture's call IDs so a prior turn's delivery cannot finish this turn.
    const turnPrefix = `contract-turn-${String(request.userMessageCount)}-`;
    const response = contractFixtureResponse({
      ...request,
      toolResults: request.toolResults.filter((result) =>
        result.id.startsWith(turnPrefix)
      ),
    });
    return {
      ...response,
      toolCalls: response.toolCalls?.map((call, index) => ({
        input: call.input,
        name: call.name,
        id: `${turnPrefix}${String(request.toolResults.length)}-${String(index)}`,
      })),
    };
  },
});

if (!isLanguageModelV3(fixtureModel)) {
  throw new Error("The contract fixture requires the AI SDK V3 stream model.");
}

export const contractFixtureModel = fixtureModel;

const fixtureDoStream =
  contractFixtureModel.doStream.bind(contractFixtureModel);
contractFixtureModel.doStream = async (options) => {
  const result = await fixtureDoStream(options);
  return lastUserPrompt(options) === "wait"
    ? { ...result, stream: delayFixtureStream(result.stream, 5_000) }
    : result;
};

export function contractFixtureResponse(
  request: MockModelRequest
): MockModelResponse {
  const command = request.lastUserMessage?.trim();
  if (!command) throw new Error("Contract fixture requires a command.");

  if (command === "silent") return { text: "DELIVERY_COMPLETE" };
  if (command === "wait") return { text: "WAIT_COMPLETE" };

  if (request.toolResults.some((result) => deliveryTools.has(result.name))) {
    return { text: "DELIVERY_COMPLETE" };
  }

  const requestedCall = parseCall(command);
  if (
    requestedCall &&
    requestedCall.name !== "connection_search" &&
    request.toolResults.at(-1)?.name === "connection_search"
  ) {
    return { toolCalls: [requestedCall] };
  }

  const result = request.toolResults.at(-1);
  if (result) {
    return {
      toolCalls: [
        {
          input: {
            kind: "message",
            text: JSON.stringify(result.output),
          },
          name: "send_message",
        },
      ],
    };
  }

  if (
    requestedCall?.name.includes("__") &&
    !request.tools.some((tool) => tool.name === requestedCall.name)
  ) {
    return {
      toolCalls: [
        {
          input: {
            keywords: requestedCall.name.split("__").slice(1).join(" "),
          },
          name: "connection_search",
        },
      ],
    };
  }

  const toolCalls = command
    .split(";")
    .flatMap((clause) => toolCallsForClause(clause.trim(), request));
  if (toolCalls.length === 0) {
    throw new Error(
      `Contract fixture command produced no tool calls: ${command}`
    );
  }
  return { toolCalls };
}

function toolCallsForClause(
  clause: string,
  request: MockModelRequest
): MockModelToolCall[] {
  if (clause.startsWith("say")) {
    const text = clause.slice("say".length).trim();
    return text
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => ({
        input: { kind: "message", text: part },
        name: "send_message",
      }));
  }

  const reaction = /^react\s+(\S+)$/u.exec(clause)?.[1];
  if (reaction) {
    if (!reactionTypes.has(reaction)) {
      throw new Error(`Unsupported contract fixture reaction: ${reaction}`);
    }
    return [
      {
        input: { operation: "add", type: reaction },
        name: "react_to_message",
      },
    ];
  }

  const skill = /^load\s+(\S+)$/u.exec(clause)?.[1];
  if (skill) return [{ input: { skill }, name: "load_skill" }];

  const attachmentUrl = /^attach\s+(https:\/\/\S+)$/u.exec(clause)?.[1];
  if (attachmentUrl) {
    return [
      {
        input: {
          attachments: [{ kind: "image", url: attachmentUrl }],
          kind: "message",
        },
        name: "send_message",
      },
    ];
  }

  const inspectedTool = /^inspect\s+(\S+)$/u.exec(clause)?.[1];
  if (inspectedTool) {
    const availability = request.tools.some(
      (tool) => tool.name === inspectedTool
    )
      ? "available"
      : "absent";
    return [
      {
        input: {
          kind: "message",
          text: `${availability}:${inspectedTool}`,
        },
        name: "send_message",
      },
    ];
  }

  const call = /^call\s+(\S+)\s+([\s\S]+)$/u.exec(clause);
  if (call?.[1] && call[2]) {
    return [{ input: JSON.parse(call[2]), name: call[1] }];
  }

  throw new Error(`Unsupported contract fixture command clause: ${clause}`);
}

function parseCall(command: string): MockModelToolCall | undefined {
  if (command.includes(";")) return undefined;
  const call = /^call\s+(\S+)\s+([\s\S]+)$/u.exec(command);
  return call?.[1] && call[2]
    ? { input: JSON.parse(call[2]), name: call[1] }
    : undefined;
}

function lastUserPrompt(
  options: Parameters<typeof fixtureDoStream>[0]
): string | undefined {
  const message = options.prompt.findLast((entry) => entry.role === "user");
  if (!message || !Array.isArray(message.content)) return undefined;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function delayFixtureStream<T>(stream: ReadableStream<T>, timeoutMs: number) {
  let cancelDelay: (() => void) | undefined;
  let reader: ReadableStreamDefaultReader<T> | undefined;
  let cancelled = false;

  return new ReadableStream<T>({
    async start(controller) {
      reader = stream.getReader();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve) => {
          cancelDelay = () => {
            if (timer !== undefined) clearTimeout(timer);
            resolve();
          };
          timer = setTimeout(resolve, timeoutMs);
        });
        if (cancelled) return;

        for (;;) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- A ReadableStream must be consumed in its ordered pull sequence.
          const next = await reader.read();
          if (next.done) break;
          controller.enqueue(next.value);
        }
        controller.close();
      } catch (cause) {
        if (!cancelled) controller.error(cause);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      cancelled = true;
      cancelDelay?.();
      await reader?.cancel(reason);
    },
  });
}

function isLanguageModelV3(model: LanguageModel): model is LanguageModelV3 {
  return languageModelV3Schema.safeParse(model).success;
}
