import {
  mockModel,
  type MockModelRequest,
  type MockModelResponse,
  type MockModelToolCall,
} from "eve/evals";

const deliveryTools = new Set(["react_to_message", "send_message"]);
const reactionTypes = new Set([
  "exclamation",
  "heart",
  "laugh",
  "question",
  "thumbs_down",
  "thumbs_up",
]);

export const contractFixtureModel = mockModel({
  modelId: "contract-fixture",
  provider: "openinstinct-contract-fixtures",
  respond: contractFixtureResponse,
});

export function contractFixtureResponse(
  request: MockModelRequest
): MockModelResponse | string {
  const command = request.lastUserMessage?.trim();
  if (!command) throw new Error("Contract fixture requires a command.");

  if (request.toolResults.some((result) => deliveryTools.has(result.name))) {
    return "DELIVERY_COMPLETE";
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
