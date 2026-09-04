/* oxlint-disable eslint/no-await-in-loop, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-parameters -- This test-only adapter inspects intentionally dynamic MCP wire JSON and serially exercises the one negotiated client session. */

import { isDeepStrictEqual } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  SUPPORTED_PROTOCOL_VERSIONS,
  type CallToolResult,
  CallToolResultSchema,
  ErrorCode,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";

const ADMITTED_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
]);

export interface AdmissionExample {
  name: string;
  tool: string;
  input: Record<string, unknown>;
  invalidInput?: Record<string, unknown>;
  expectedStructuredContent?: Record<string, unknown>;
  expectError?: boolean;
}

export interface AdmissionToolContract {
  description: string;
  annotations: {
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
    readOnlyHint: boolean;
  };
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

interface AdmissionCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface McpAdmissionResult {
  ok: boolean;
  checks: AdmissionCheck[];
  protocolVersion?: string;
  tools?: string[];
}

export interface McpAdmissionOptions {
  url: string;
  token: string;
  examples: readonly AdmissionExample[];
  declaredTools: Readonly<Record<string, AdmissionToolContract>>;
  maxOutputBytes?: number;
  requestTimeoutMs?: number;
}

/**
 * Runs the supported, deliberately bounded Jory MCP admission subset.
 *
 * This helper never discovers calls from schemas: only `examples` are invoked.
 * Write tools are therefore safe to include only when a caller explicitly
 * supplies a synthetic example for them.
 */
export async function runMcpAdmission({
  url,
  token,
  examples,
  declaredTools,
  maxOutputBytes = 8 * 1024,
  requestTimeoutMs = 5_000,
}: McpAdmissionOptions): Promise<McpAdmissionResult> {
  const checks: AdmissionCheck[] = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    const entry: AdmissionCheck = { name, ok };
    if (detail) entry.detail = detail;
    checks.push(entry);
  };

  if (!isLoopbackUrl(url)) {
    check(
      "target.loopback",
      false,
      "admission accepts only local loopback HTTP(S) endpoints"
    );
    return { ok: false, checks };
  }
  check("target.loopback", true, "local loopback endpoint");

  const authOk = await checkUnauthorizedRequests(
    url,
    token,
    check,
    requestTimeoutMs
  );
  if (!authOk) {
    check(
      "protocol.initialize",
      false,
      "authorization probes did not establish the required bearer boundary"
    );
    return { ok: false, checks };
  }

  const client = new Client({ name: "jory-mcp-admission", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    },
  });

  let tools: Tool[] = [];
  try {
    await client.connect(transport);
    const protocolVersion = transport.protocolVersion;
    check(
      "protocol.initialize",
      typeof protocolVersion === "string" &&
        ADMITTED_PROTOCOL_VERSIONS.has(protocolVersion) &&
        SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion),
      protocolVersion
        ? `negotiated ${protocolVersion}`
        : "server did not report a protocol version"
    );

    const listed = await client.listTools();
    tools = listed.tools;
    check(
      "tools.list",
      tools.length > 0 &&
        examples.length > 0 &&
        Object.keys(declaredTools).every((name) =>
          tools.some((tool) => tool.name === name)
        ) &&
        examples.every((example) =>
          tools.some((tool) => tool.name === example.tool)
        ),
      tools.length > 0
        ? examples.length > 0
          ? `listed ${String(tools.length)} tool(s)`
          : "at least one explicit synthetic example is required"
        : "server listed no tools"
    );

    for (const [name] of Object.entries(declaredTools)) {
      check(
        `tools.${name}.declared`,
        tools.some((tool) => tool.name === name),
        "declared tool was not returned by tools/list"
      );
    }

    const validator = new AjvJsonSchemaValidator();
    for (const tool of tools) {
      check(
        `tools.${tool.name}.description`,
        typeof tool.description === "string" &&
          tool.description.trim().length >= 20,
        "tool description must be at least 20 characters"
      );
      check(
        `tools.${tool.name}.annotations`,
        hasCompleteAnnotations(tool),
        "readOnlyHint, destructiveHint, idempotentHint, and openWorldHint must be booleans"
      );
      const declared = declaredTools[tool.name];
      check(
        `tools.${tool.name}.contract`,
        declared !== undefined &&
          tool.description === declared.description &&
          annotationsEqual(tool, declared.annotations) &&
          deepEqual(tool.inputSchema, declared.inputSchema) &&
          optionalSchemaEqual(tool.outputSchema, declared.outputSchema),
        declared
          ? "listed description, annotations, or schemas differ from the declared contract"
          : "no declared contract was supplied for this listed tool"
      );
      checkSchema(
        validator,
        `schema.${tool.name}.input`,
        tool.inputSchema,
        check,
        true,
        examples
          .filter((example) => example.tool === tool.name)
          .flatMap((example) => Object.keys(example.input))
      );
      if (tool.outputSchema) {
        checkSchema(
          validator,
          `schema.${tool.name}.output`,
          tool.outputSchema,
          check,
          false
        );
      }
      validateInputExamples(tool, examples, validator, check);
    }

    for (const example of examples) {
      check(
        `tools.${example.tool}.contract-declared`,
        declaredTools[example.tool] !== undefined,
        "every invoked example must have a declared tool contract"
      );
    }

    for (const example of examples) {
      const tool = tools.find((candidate) => candidate.name === example.tool);
      if (!tool) {
        check(
          `example.${slug(example.name)}`,
          false,
          `tool ${example.tool} was not listed`
        );
        continue;
      }

      const validName = `example.${slug(example.name)}`;
      let result: CallToolResult | undefined;
      try {
        result = await callTool(client, {
          name: example.tool,
          arguments: example.input,
        });
        const isExpectedError =
          Boolean(example.expectError) === Boolean(result.isError);
        check(
          validName,
          isExpectedError,
          result.isError ? "tool returned isError" : "tool returned success"
        );

        if (example.expectError) {
          check(
            `${validName}.error-shape`,
            result.isError === true && result.content.length > 0,
            "tool errors must be structured MCP results with content"
          );
        } else if (example.expectedStructuredContent) {
          check(
            `${validName}.structured-output`,
            deepEqual(
              result.structuredContent,
              example.expectedStructuredContent
            ),
            "structuredContent did not match the expected synthetic result"
          );
        }
      } catch (error) {
        check(validName, false, errorMessage(error));
      }
      if (result) {
        checkOutputSize(
          validName.replace("example.", "bounds."),
          result,
          maxOutputBytes,
          check
        );
      } else {
        check(
          `bounds.${slug(example.name)}`,
          false,
          "no result was available to check output bounds"
        );
      }

      if (example.invalidInput) {
        const invalidName = `${validName}.invalid-input`;
        try {
          const invalidResult = await callTool(client, {
            name: example.tool,
            arguments: example.invalidInput,
          });
          check(
            invalidName,
            invalidResult.isError === true,
            invalidResult.isError
              ? "invalid input returned a structured error"
              : "invalid input unexpectedly succeeded"
          );
          checkOutputSize(
            `${invalidName}.bounds`,
            invalidResult,
            maxOutputBytes,
            check
          );
        } catch (error) {
          check(
            invalidName,
            isAcceptedInvalidInputError(error),
            isAcceptedInvalidInputError(error)
              ? "JSON-RPC InvalidParams error"
              : `invalid input failed with an unexpected error: ${errorMessage(error)}`
          );
        }
      }
    }
  } catch (error) {
    check("protocol.initialize", false, errorMessage(error));
  } finally {
    await client.close().catch(() => undefined);
  }

  return {
    ok: checks.every((candidate) => candidate.ok),
    checks,
    protocolVersion: transport.protocolVersion,
    tools: tools.map((tool) => tool.name),
  };
}

async function callTool(
  client: Client,
  params: { name: string; arguments: Record<string, unknown> }
): Promise<CallToolResult> {
  const result = await client.callTool(params, CallToolResultSchema);
  if ("toolResult" in result) {
    throw new Error("task result is outside the supported admission subset");
  }
  return result;
}

async function checkUnauthorizedRequests(
  url: string,
  token: string,
  check: (name: string, ok: boolean, detail?: string) => void,
  requestTimeoutMs: number
): Promise<boolean> {
  let authOk = true;
  const body = JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" });
  for (const [name, authorization] of [
    ["auth.missing-token", undefined],
    ["auth.invalid-token", "Bearer invalid-contract-credential"],
  ] as const) {
    try {
      const headers = new Headers({ "content-type": "application/json" });
      if (authorization) headers.set("authorization", authorization);
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const accepted =
        response.status === 401 &&
        response.headers.get("www-authenticate")?.includes("Bearer") === true;
      check(
        name,
        accepted,
        `expected 401 with WWW-Authenticate: Bearer, got ${String(response.status)}`
      );
      authOk = authOk && accepted;
    } catch (error) {
      check(name, false, errorMessage(error));
      authOk = false;
    }
  }
  if (token.length === 0) {
    check(
      "auth.credential",
      false,
      "an explicit synthetic credential is required"
    );
    authOk = false;
  }
  return authOk;
}

function validateInputExamples(
  tool: Tool,
  examples: readonly AdmissionExample[],
  validator: AjvJsonSchemaValidator,
  check: (name: string, ok: boolean, detail?: string) => void
) {
  try {
    const validate = validator.getValidator(tool.inputSchema);
    for (const example of examples.filter(
      (candidate) => candidate.tool === tool.name
    )) {
      const validResult = validate(example.input);
      check(
        `schema.${tool.name}.input.${slug(example.name)}.valid`,
        validResult.valid,
        validResult.valid
          ? "explicit valid example matches inputSchema"
          : validResult.errorMessage
      );
      if (example.invalidInput) {
        const invalidResult = validate(example.invalidInput);
        check(
          `schema.${tool.name}.input.${slug(example.name)}.invalid`,
          !invalidResult.valid,
          invalidResult.valid
            ? "explicit invalid example unexpectedly matches inputSchema"
            : "explicit invalid example is rejected by inputSchema"
        );
      }
    }
  } catch (error) {
    check(
      `schema.${tool.name}.input.examples`,
      false,
      `could not validate explicit examples: ${errorMessage(error)}`
    );
  }
}

function checkSchema(
  validator: AjvJsonSchemaValidator,
  name: string,
  schema: Record<string, unknown>,
  check: (name: string, ok: boolean, detail?: string) => void,
  requirePropertyDescriptions: boolean,
  requiredProperties: readonly string[] = []
) {
  try {
    // SAFETY: the MCP SDK has parsed this object as a tool schema before it reaches this adapter.
    validator.getValidator(schema);
    const properties = schema.properties;
    const propertiesHaveDescriptions =
      !requirePropertyDescriptions ||
      (isRecord(properties) &&
        Object.entries(properties).every(
          ([, property]) =>
            isRecord(property) && typeof property.description === "string"
        ) &&
        requiredProperties.every(
          (property) => isRecord(properties) && property in properties
        ));
    check(
      name,
      schema.type === "object" && propertiesHaveDescriptions,
      propertiesHaveDescriptions
        ? "JSON Schema compiled"
        : "schema shape or input descriptions/properties are invalid"
    );
  } catch (error) {
    check(name, false, `invalid JSON Schema: ${errorMessage(error)}`);
  }
}

function checkOutputSize(
  name: string,
  result: CallToolResult,
  maxOutputBytes: number,
  check: (name: string, ok: boolean, detail?: string) => void
) {
  const unsupportedPart = result.content.find((part) => part.type !== "text");
  check(
    `${name}.content-type`,
    unsupportedPart === undefined,
    unsupportedPart
      ? `unsupported ${unsupportedPart.type} content part; this subset admits text only`
      : "all content parts are text"
  );
  const textBytes = result.content.reduce((size, part) => {
    if (part.type !== "text") return size;
    return size + Buffer.byteLength(part.text, "utf8");
  }, 0);
  check(
    name,
    textBytes <= maxOutputBytes,
    `text content is ${String(textBytes)} bytes (limit ${String(maxOutputBytes)})`
  );
  const structuredBytes = Buffer.byteLength(
    JSON.stringify(result.structuredContent ?? {}),
    "utf8"
  );
  check(
    `${name}.structured-content`,
    structuredBytes <= maxOutputBytes,
    `structured content is ${String(structuredBytes)} bytes (limit ${String(maxOutputBytes)})`
  );
}

function hasCompleteAnnotations(tool: Tool) {
  const annotations = tool.annotations;
  return (
    annotations !== undefined &&
    typeof annotations.readOnlyHint === "boolean" &&
    typeof annotations.destructiveHint === "boolean" &&
    typeof annotations.idempotentHint === "boolean" &&
    typeof annotations.openWorldHint === "boolean"
  );
}

function annotationsEqual(
  tool: Tool,
  expected: AdmissionToolContract["annotations"]
) {
  const annotations = tool.annotations;
  if (!annotations) return false;
  return (
    annotations.destructiveHint === expected.destructiveHint &&
    annotations.idempotentHint === expected.idempotentHint &&
    annotations.openWorldHint === expected.openWorldHint &&
    annotations.readOnlyHint === expected.readOnlyHint
  );
}

function optionalSchemaEqual(
  actual: Record<string, unknown> | undefined,
  expected: Record<string, unknown> | undefined
) {
  return expected === undefined
    ? actual === undefined
    : actual !== undefined && deepEqual(actual, expected);
}

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown) {
  return isDeepStrictEqual(left, right);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isAcceptedInvalidInputError(error: unknown) {
  // oxlint-disable-next-line typescript/no-unsafe-enum-comparison -- McpError exposes the JSON-RPC code as a number while ErrorCode is the SDK's documented enum.
  return error instanceof McpError && error.code === ErrorCode.InvalidParams;
}

function isLoopbackUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1")
    );
  } catch {
    return false;
  }
}
