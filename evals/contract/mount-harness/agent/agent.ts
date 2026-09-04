import { defineAgent, defineDynamic } from "eve";
import {
  mockModel,
  type MockModelRequest,
  type MockModelResponse,
} from "eve/evals";
import { env } from "../env";

export default defineAgent({
  model: defineDynamic({
    events: {
      "step.started": () => ({
        model: mountFixtureModel,
        modelContextWindowTokens: 128_000,
      }),
    },
  }),
});

const mountFixtureModel = mockModel({
  modelId: "mount-fixture",
  provider: "openinstinct-contract-fixtures",
  respond: respond,
});

function respond(request: MockModelRequest): MockModelResponse | string {
  if (JSON.stringify(request).includes(env.CONTRACT_MCP_TOKEN)) {
    throw new Error("The connection credential reached the model request.");
  }

  const command = request.lastUserMessage?.trim() ?? "";
  const skill = /^load\s+(\S+)$/u.exec(command)?.[1];
  if (skill) {
    if (request.toolResults.length > 0) return "SKILL LOADED";
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
    return `RESULT ${JSON.stringify(lastResult?.output)}`;
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
