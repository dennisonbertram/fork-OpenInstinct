import { afterEach, describe, expect, it } from "vitest";
import { startDemoMcp } from "./server";

const token = "contract-mcp-credential";
let closeServer: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
});

describe("contract MCP authorization", () => {
  it.each([
    ["a missing bearer", undefined],
    ["the wrong bearer", "Bearer wrong-contract-credential"],
  ])("rejects %s", async (_label, authorization) => {
    const server = await startDemoMcp({ token });
    closeServer = server.close;
    const headers = new Headers({ "content-type": "application/json" });
    if (authorization) headers.set("authorization", authorization);

    const response = await fetch(server.url, {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
      headers,
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });
});
