import { afterEach, describe, expect, it } from "vitest";
import { runMcpAdmission, type AdmissionExample } from "./mcp-admission";
import { startDemoMcp, type DemoMcpFault } from "./fixtures/demo-mcp/server";

const token = "contract-mcp-credential";
const examples: readonly AdmissionExample[] = [
  {
    name: "echo valid",
    tool: "echo",
    input: { text: "synthetic hello" },
    expectedStructuredContent: { text: "synthetic hello" },
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

async function run(fault?: DemoMcpFault) {
  const server = await startDemoMcp({ token, fault });
  closeServer = server.close;
  return runMcpAdmission({
    url: server.url,
    token,
    examples,
    declaredTools: {
      echo: {
        description: "Echo text through the mounted MCP connection.",
        annotations: {
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          readOnlyHint: true,
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
      },
    },
    maxOutputBytes: 8192,
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
    ["input schema", "invalid-input-schema", "schema.echo.input"],
    ["annotations", "missing-annotations", "tools.echo.annotations"],
    ["structured output", "malformed-output", "example.echo-valid"],
    ["output size", "oversized-output", "bounds.echo-valid"],
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
});
