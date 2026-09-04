import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAcceptedInvalidInputError,
  runMcpAdmission,
  type AdmissionExample,
  type AdmissionToolContract,
} from "./mcp-admission";
import { startDemoMcp, type DemoMcpFault } from "./fixtures/demo-mcp/server";

const token = "contract-mcp-credential";
const examples: readonly AdmissionExample[] = [
  {
    name: "echo valid",
    tool: "echo",
    input: { text: "synthetic hello" },
    expectedStructuredContent: {
      text: "synthetic hello",
      marker: "synthetic",
    },
    invalidInput: { text: 42 },
  },
  {
    name: "fail structured error",
    tool: "fail",
    input: { reason: "synthetic failure" },
    expectError: true,
  },
];

let closeServer: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
});

async function run(
  fault?: DemoMcpFault,
  options: {
    examples?: readonly AdmissionExample[];
    requestTimeoutMs?: number;
    includeOptionalContract?: boolean;
  } = {}
) {
  const server = await startDemoMcp({ token, fault });
  closeServer = server.close;
  const baseDeclaredTools = {
    echo: {
      description: "Echo text through the mounted MCP connection.",
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to echo" },
        },
        required: ["text"],
        $schema: "http://json-schema.org/draft-07/schema#",
      },
      outputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          marker: { type: "string" },
        },
        required: ["text", "marker"],
        $schema: "http://json-schema.org/draft-07/schema#",
        additionalProperties: false,
      },
    },
    fail: {
      description:
        "Return a structured synthetic tool error for admission tests.",
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Synthetic reason for failure",
          },
        },
        required: ["reason"],
        $schema: "http://json-schema.org/draft-07/schema#",
      },
    },
  } satisfies Record<string, AdmissionToolContract>;
  const declaredTools = options.includeOptionalContract
    ? {
        ...baseDeclaredTools,
        optional: {
          description:
            "An optional uncalled tool outside the declared admission subset.",
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
          },
          inputSchema: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: "Synthetic optional value",
              },
            },
            required: ["value"],
            $schema: "http://json-schema.org/draft-07/schema#",
          },
        },
      }
    : baseDeclaredTools;
  return runMcpAdmission({
    url: server.url,
    token,
    examples: options.examples ?? examples,
    declaredTools,
    maxOutputBytes: 8192,
    requestTimeoutMs: options.requestTimeoutMs,
  });
}

describe("MCP admission subset", () => {
  it("uses the real SDK over HTTP for explicit valid, invalid, and error examples", async () => {
    const result = await run();

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "auth.missing-token",
        "auth.invalid-token",
        "protocol.initialize",
        "tools.list",
        "example.echo-valid",
        "example.echo-valid.invalid-input",
        "example.fail-structured-error",
        "bounds.echo-valid",
      ])
    );
  });

  it.each([
    ["description", "missing-description", "tools.echo.description"],
    ["description mismatch", "mismatched-description", "tools.echo.contract"],
    ["changed valid schema", "changed-input-schema", "tools.echo.contract"],
    ["input schema", "invalid-input-schema", "schema.echo.input"],
    [
      "invalid input success",
      "invalid-input-success",
      "schema.echo.input.echo-valid.invalid",
    ],
    ["annotations", "missing-annotations", "tools.echo.annotations"],
    ["annotation mismatch", "mismatched-annotations", "tools.echo.contract"],
    ["structured output", "malformed-output", "example.echo-valid"],
    ["output size", "oversized-output", "bounds.echo-valid"],
    [
      "structured output size",
      "oversized-structured-output",
      "bounds.echo-valid.structured-content",
    ],
    [
      "unsupported content",
      "unsupported-image",
      "bounds.echo-valid.content-type",
    ],
    [
      "malformed tool error",
      "malformed-tool-error",
      "example.fail-structured-error.error-shape",
    ],
    ["HTTP 500", "http-500", "example.echo-valid.invalid-input"],
    [
      "accepted invalid credential",
      "auth-accepts-invalid-token",
      "auth.invalid-token",
    ],
    [
      "accepted missing credential",
      "auth-accepts-missing-token",
      "auth.missing-token",
    ],
    ["redirect", "redirects", "auth.missing-token"],
    ["missing allowed tool", "missing-allowed-tool", "tools.list"],
  ] as const)(
    "rejects a server with a malformed %s",
    async (_label, fault, checkName) => {
      const result = await run(fault);

      expect(result.ok).toBe(false);
      expect(result.checks.find((check) => check.name === checkName)?.ok).toBe(
        false
      );
    }
  );

  it("compares equivalent structured objects independent of key order", async () => {
    const result = await run("reordered-output");

    expect(result.ok).toBe(true);
  });

  it("allows a declared listed tool when it is not explicitly called", async () => {
    const result = await run("optional-uncalled-tool", {
      includeOptionalContract: true,
    });

    expect(result.ok).toBe(true);
    expect(result.tools).toContain("optional");
    expect(
      result.checks.some((check) => check.name.startsWith("example.optional"))
    ).toBe(false);
  });

  it("rejects an undeclared listed tool even when it is not called", async () => {
    const result = await run("optional-uncalled-tool");

    expect(result.ok).toBe(false);
    expect(
      result.checks.find((check) => check.name === "tools.optional.contract")
        ?.ok
    ).toBe(false);
  });

  it("requires at least one explicit example", async () => {
    const result = await run(undefined, { examples: [] });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "tools.list")?.ok).toBe(
      false
    );
  });

  it("requires every declared tool to appear even without an example", async () => {
    const server = await startDemoMcp({ token });
    closeServer = server.close;
    const result = await runMcpAdmission({
      url: server.url,
      token,
      examples: examples.filter((example) => example.tool === "echo"),
      declaredTools: {
        echo: {
          description: "Echo text through the mounted MCP connection.",
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
          },
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string", description: "Text to echo" },
            },
            required: ["text"],
            $schema: "http://json-schema.org/draft-07/schema#",
          },
          outputSchema: {
            type: "object",
            properties: {
              text: { type: "string" },
              marker: { type: "string" },
            },
            required: ["text", "marker"],
            $schema: "http://json-schema.org/draft-07/schema#",
            additionalProperties: false,
          },
        },
        absent: {
          description: "A declared tool that the fixture must return.",
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
          },
          inputSchema: { type: "object", properties: {} },
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(
      result.checks.find((check) => check.name === "tools.absent.declared")?.ok
    ).toBe(false);
  });

  it("bounds stalled local auth probes", async () => {
    const started = Date.now();
    const result = await run("stalls", { requestTimeoutMs: 25 });

    expect(result.ok).toBe(false);
    expect(
      result.checks.find((check) => check.name === "auth.missing-token")?.ok
    ).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("requires a declared contract for every example tool", async () => {
    const server = await startDemoMcp({ token });
    closeServer = server.close;
    const result = await runMcpAdmission({
      url: server.url,
      token,
      examples,
      declaredTools: {},
    });

    expect(result.ok).toBe(false);
    expect(
      result.checks.find((check) => check.name === "tools.echo.contract")?.ok
    ).toBe(false);
  });

  it("rejects a network failure rather than accepting it as an invalid-input error", async () => {
    const result = await runMcpAdmission({
      url: "http://127.0.0.1:9/mcp",
      token,
      examples,
      declaredTools: {},
    });

    expect(result.ok).toBe(false);
    expect(
      result.checks.find((check) => check.name === "protocol.initialize")?.ok
    ).toBe(false);
  });

  it("rejects non-loopback targets before making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await runMcpAdmission({
      url: "http://192.0.2.1/mcp",
      token,
      examples,
      declaredTools: {},
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual([
      {
        name: "target.loopback",
        ok: false,
        detail: "admission accepts only local loopback HTTP(S) endpoints",
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("accepts only the SDK InvalidParams code for protocol invalid-input errors", () => {
    expect(
      isAcceptedInvalidInputError(
        new McpError(ErrorCode.InvalidParams, "synthetic invalid input")
      )
    ).toBe(true);
    expect(
      isAcceptedInvalidInputError(
        new McpError(ErrorCode.InternalError, "synthetic server failure")
      )
    ).toBe(false);
    expect(isAcceptedInvalidInputError(new Error("fetch failed"))).toBe(false);
    expect(isAcceptedInvalidInputError(new Error("HTTP 500"))).toBe(false);
    expect(isAcceptedInvalidInputError({ code: ErrorCode.InvalidParams })).toBe(
      false
    );
  });
});
