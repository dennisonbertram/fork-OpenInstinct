import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  JSONRPCMessageSchema,
  type JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const addressSchema = z.object({ port: z.number().int().positive() });

export type DemoMcpFault =
  | "missing-description"
  | "invalid-input-schema"
  | "missing-annotations"
  | "malformed-output"
  | "oversized-output";

export async function startDemoMcp({
  token,
  fault,
}: {
  token: string;
  fault?: DemoMcpFault;
}) {
  const httpServer = createServer((request, response) => {
    void handleRequest(request, response, token, fault).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            error: { code: -32603, message: "Internal server error" },
            id: null,
            jsonrpc: "2.0",
          })
        );
      }
    });
  });
  await listen(httpServer);
  const address = addressSchema.parse(httpServer.address());
  return {
    close: () => close(httpServer),
    url: `http://127.0.0.1:${String(address.port)}/mcp`,
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  fault?: DemoMcpFault
) {
  if (request.method !== "POST" || request.url !== "/mcp") {
    response.writeHead(404).end();
    return;
  }

  if (!matchesBearerToken(request.headers.authorization, token)) {
    response
      .writeHead(401, { "www-authenticate": 'Bearer realm="contract-mcp"' })
      .end();
    return;
  }

  const server = new McpServer({
    name: "openinstinct-contract-demo",
    version: "0.0.0",
  });
  const echoInputSchema = { text: z.string().describe("Text to echo") };
  const echoTool = server.registerTool(
    "echo",
    {
      description:
        fault === "missing-description"
          ? undefined
          : "Echo text through the mounted MCP connection.",
      inputSchema: echoInputSchema,
      outputSchema: { text: z.string() },
      annotations:
        fault === "missing-annotations"
          ? undefined
          : {
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
              readOnlyHint: true,
            },
    },
    async ({ text }: { text: string }) => ({
      content: [
        {
          type: "text",
          text:
            fault === "oversized-output" ? `${text}${"x".repeat(8192)}` : text,
        },
      ],
      structuredContent: fault === "malformed-output" ? { text: 42 } : { text },
    })
  );
  if (fault === "invalid-input-schema") echoTool.inputSchema = z.any();
  server.registerTool(
    "fail",
    {
      description:
        "Return a structured synthetic tool error for admission tests.",
      inputSchema: {
        reason: z.string().describe("Synthetic reason for failure"),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
    },
    async ({ reason }) => ({
      content: [{ type: "text", text: `synthetic error: ${reason}` }],
      isError: true,
    })
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await Promise.allSettled([transport.close(), server.close()]);
  };
  response.once("close", () => void cleanup());
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, await readJson(request));
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function matchesBearerToken(header: string | undefined, expected: string) {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

async function readJson(request: IncomingMessage): Promise<JSONRPCMessage> {
  let body = "";
  request.setEncoding("utf8");
  for await (const chunk of request) {
    body += z.string().parse(chunk);
  }
  const parsed: unknown = JSON.parse(body);
  return JSONRPCMessageSchema.parse(parsed);
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
    server.once("error", reject);
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
