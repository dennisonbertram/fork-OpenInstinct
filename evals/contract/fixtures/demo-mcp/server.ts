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
  | "auth-accepts-invalid-token"
  | "auth-accepts-missing-token"
  | "redirects"
  | "stalls"
  | "missing-allowed-tool"
  | "optional-uncalled-tool"
  | "missing-description"
  | "mismatched-description"
  | "changed-input-schema"
  | "invalid-input-schema"
  | "invalid-input-success"
  | "missing-annotations"
  | "mismatched-annotations"
  | "malformed-output"
  | "reordered-output"
  | "oversized-structured-output"
  | "oversized-output"
  | "unsupported-image"
  | "malformed-tool-error"
  | "http-500";

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

  if (fault === "stalls") return;
  if (fault === "redirects") {
    response.writeHead(302, { location: "/mcp" }).end();
    return;
  }

  if (
    !matchesBearerToken(request.headers.authorization, token) &&
    fault !== "auth-accepts-invalid-token" &&
    !(
      fault === "auth-accepts-missing-token" &&
      request.headers.authorization === undefined
    )
  ) {
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
          : fault === "mismatched-description"
            ? "A different description than the declared contract."
            : "Echo text through the mounted MCP connection.",
      inputSchema: echoInputSchema,
      outputSchema: { text: z.string(), marker: z.string() },
      annotations:
        fault === "missing-annotations"
          ? undefined
          : fault === "mismatched-annotations"
            ? {
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true,
                readOnlyHint: true,
              }
            : {
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
                readOnlyHint: true,
              },
    },
    async ({ text }: { text: string }) => ({
      content:
        fault === "unsupported-image"
          ? [
              {
                type: "image",
                data: "c3ludGhldGljLWltYWdl",
                mimeType: "image/png",
              },
            ]
          : [
              {
                type: "text",
                text:
                  fault === "oversized-output"
                    ? `${text}${"x".repeat(8192)}`
                    : text,
              },
            ],
      structuredContent:
        fault === "malformed-output"
          ? { text: 42 }
          : fault === "reordered-output"
            ? { marker: "synthetic", text }
            : fault === "oversized-structured-output"
              ? { marker: "synthetic", text: `${text}${"x".repeat(8192)}` }
              : { text, marker: "synthetic" },
    })
  );
  if (fault === "invalid-input-schema") echoTool.inputSchema = z.any();
  if (fault === "changed-input-schema") {
    echoTool.inputSchema = z.object({
      text: z.string().describe("A changed but still valid description"),
    });
  }
  if (fault === "invalid-input-success") {
    echoTool.inputSchema = z.object({
      text: z.any().describe("Text to echo"),
    });
  }
  if (fault !== "missing-allowed-tool")
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
      async ({ reason }) =>
        fault === "malformed-tool-error"
          ? { content: [] }
          : {
              content: [{ type: "text", text: `synthetic error: ${reason}` }],
              isError: true,
            }
    );
  if (fault === "optional-uncalled-tool") {
    server.registerTool(
      "optional",
      {
        description:
          "An optional uncalled tool outside the declared admission subset.",
        inputSchema: {
          value: z.string().describe("Synthetic optional value"),
        },
        annotations: {
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          readOnlyHint: true,
        },
      },
      async ({ value }) => ({
        content: [{ type: "text", text: `optional: ${value}` }],
      })
    );
  }

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
    const message = await readJson(request);
    if (
      fault === "http-500" &&
      "method" in message &&
      message.method === "tools/call"
    ) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "synthetic HTTP 500" }));
      await cleanup();
      return;
    }
    await transport.handleRequest(request, response, message);
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
    server.closeAllConnections();
  });
}
