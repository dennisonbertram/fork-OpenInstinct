# Plugin testing harness: prove an MCP server and its mount with no human

This document is the test plan for one plugin built by
[`PLUGINS.md`](PLUGINS.md). Every layer runs from one command, needs no
human, and needs no model provider except the optional last layer. A coding
agent can run the whole ladder and read pass or fail from exit codes.

Labels: **Verified** was run on 2026-09-04. **Proposed** is the design.

---

## 0. The ladder

| Layer            | What it proves                                                                                        | Where it runs                                       | Model calls | Gate                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------- | -------------------------------------------------- |
| 1 Contract       | This server's tools do what its own tests say                                                         | `plugins/<name>/server/test/`                       | none        | PR to the plugin repo                              |
| 2 Conformance    | The supported local Jory admission subset (the generic external runner remains proposed)              | `evals/contract/mcp-admission.ts`, pointed at a URL | none        | PR, and layer 4                                    |
| 3 Mount          | eve mounts the extension, the model can call `<mount>__<tool>`, and the reply carries the tool output | `shared/harness-host`, `eve eval` with `mockModel`  | none        | PR to the plugin repo                              |
| 4 Deployed smoke | The preview deployment answers with a real signed token                                               | layer 2 against the preview URL                     | none        | before release                                     |
| 5 Behavior gym   | A real model picks the right tool and answers well                                                    | `eve eval` with a real model, on demand             | yes, paid   | before release, on demand, like `pnpm eval:square` |

Each layer needs the one below it to be green. Stop at the first red layer.
Do not skip layer 3; it is the only place the eve-to-server seam is checked
(`PLUGINS.md` section 11).

---

## 1. Layer 1: contract tests (Verified)

Vitest spawns the real server, connects with the real SDK client over HTTP,
and asserts per tool. Verified result on the demo server: `Tests 6 passed (6)`
in 381 ms.

```ts
// test/server.test.ts
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = 3999;
const URL_STR = `http://localhost:${PORT}/mcp`;
const TOKEN = "demo-token"; // in a real plugin: mint one with @jory/plugin-auth and a test secret

let child: ChildProcess;
let client: Client;

async function waitForServer(url: string, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url, { method: "POST" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("server did not start");
}

beforeAll(async () => {
  child = spawn("npx", ["tsx", "src/server.ts"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  await waitForServer(URL_STR);
  client = new Client({ name: "test-client", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(URL_STR), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  await client.connect(transport);
}, 20_000);

afterAll(async () => {
  await client.close();
  child.kill();
});

describe("demo MCP server", () => {
  it("rejects requests without a bearer token with 401", async () => {
    const res = await fetch(URL_STR, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("lists tools with annotations", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["echo", "fail"]);
    const echo = tools.find((t) => t.name === "echo")!;
    expect(echo.annotations?.readOnlyHint).toBe(true);
  });

  it("calls echo and returns structuredContent", async () => {
    const result = await client.callTool({
      name: "echo",
      arguments: { text: "hi" },
    });
    expect(result.structuredContent).toEqual({ text: "hi" });
    expect(result.isError).toBeFalsy();
  });

  it("calls fail and gets isError: true", async () => {
    const result = await client.callTool({
      name: "fail",
      arguments: { reason: "boom" },
    });
    expect(result.isError).toBe(true);
  });

  it("reads the demo://about resource", async () => {
    const result = await client.readResource({ uri: "demo://about" });
    expect((result.contents[0] as { text: string }).text).toContain(
      "demo MCP server"
    );
  });

  it("gets the greet prompt", async () => {
    const result = await client.getPrompt({
      name: "greet",
      arguments: { name: "Ada" },
    });
    expect(JSON.stringify(result.messages)).toContain("Ada");
  });
});
```

Rules for a real plugin's layer 1:

- One `describe` per tool. Cover: the happy path, every `isError` branch,
  the caller-scoping branch (a token for user A cannot read user B's data),
  and the size rule (result text under 8 KB).
- Start the server with `PLUGIN_FAKE=1`. Provider calls (image models,
  phone APIs) return fixtures from `fixtures/`. The branch is one `if` in
  the provider call, not an interface.
- Data plugins run against a throwaway database. Use the same PGlite pattern
  as the host (`tests/integration/agents.test.ts:176-186` in this
  repository) or a `test_<uuid>` database created in `beforeAll`.

Command: `pnpm vitest run`. Exit code 0 is the gate.

---

## 2. Layer 2: supported Jory admission subset (Implemented)

The reference helper in [`evals/contract/mcp-admission.ts`](../evals/contract/mcp-admission.ts)
uses the installed `@modelcontextprotocol/sdk@1.30.0` `Client` and
`StreamableHTTPClientTransport` over Streamable HTTP. Run it with the real
fixture and inspect its machine-readable named checks with:

```sh
pnpm exec vitest run evals/contract/mcp-admission.test.ts
```

`runMcpAdmission` checks bearer admission (missing and invalid credentials),
SDK initialization and the four Jory-supported protocol versions, tool list
membership, descriptions, input/output JSON Schema compilation, complete
read/write annotations, declared metadata, structured success output, and
bounded UTF-8 text and structured output. Non-text content is outside this
subset and fails admission. Invalid inputs and explicitly supplied tool errors
must produce structured MCP errors; a protocol-level invalid-input error is
accepted only when the SDK reports `McpError` with `ErrorCode.InvalidParams`.
The target must be a loopback HTTP(S) URL, redirects are rejected, and the
helper invokes only the examples supplied by the caller; it never fuzzes or
automatically calls listed tools. A plugin repository can copy this helper and
provide synthetic `examples` plus its declared tool metadata without importing
production core.

The demo fixture includes deliberately malformed description, schema,
annotation, structured output, and oversized-output modes. Those modes are
test-only and are never enabled by the reference server's normal invocation.

### 2.1. Generic conformance runner (Proposed)

One package, `shared/mcp-conformance`, one command:

```sh
pnpm mcp-conformance --url https://<server>/mcp --token <jwt> [--fuzz 25] [--max-bytes 8192]
```

It knows nothing about the plugin. It reads `tools/list` and derives every
check from the schemas. It prints one line per check and exits non-zero on
the first failed MUST. Implementation: the SDK `Client`, `ajv` for JSON
Schema, `json-schema-faker` for inputs, about 200 lines.

Checks, in order:

| #   | Check                                                                                                                                                         | Level                                       | Derived from                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| C1  | POST without bearer returns 401 with `WWW-Authenticate: Bearer`                                                                                               | MUST                                        | PLUGINS.md 6.4                                                    |
| C2  | POST with a token signed by a wrong secret returns 401                                                                                                        | MUST                                        | identity contract                                                 |
| C3  | `initialize` succeeds and `protocolVersion` is one of `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`                                                  | MUST                                        | eve 0.49.0 client list                                            |
| C4  | `tools/list` returns at least one tool; every tool has `description` of 20 characters or more                                                                 | MUST                                        | model needs it                                                    |
| C5  | Every `inputSchema` is valid JSON Schema draft-07 (ajv compiles it) and every property has a `description`                                                    | MUST                                        | host exposes schema verbatim                                      |
| C6  | Every tool has `annotations` with all four hints present as booleans                                                                                          | MUST                                        | approval policy                                                   |
| C7  | Every tool with `outputSchema` returns `structuredContent` that validates against it on a fuzzed valid input                                                  | SHOULD                                      | SDK validates on send; this catches a missing `structuredContent` |
| C8  | Invalid input (a fuzzed input with one required field removed) returns `isError: true` or a JSON-RPC error, never an HTTP 5xx                                 | MUST                                        | model recovery                                                    |
| C9  | For every `readOnlyHint: true` tool: N fuzzed valid inputs return no HTTP 5xx and no `isError` whose text contains `TypeError`, `undefined`, or a stack frame | MUST                                        | crash detection; N from `--fuzz`                                  |
| C10 | For every `readOnlyHint: true` tool: the same input called twice returns the same `structuredContent`                                                         | SHOULD                                      | idempotency; eve replays interrupted steps                        |
| C11 | Every result's concatenated text is under `--max-bytes`                                                                                                       | MUST                                        | PLUGINS.md section 2, limit 3                                     |
| C12 | No `content` part is an `image` or `resource` blob over 64 KB                                                                                                 | MUST                                        | URLs, not base64                                                  |
| C13 | A request with `Origin: https://evil.example` returns 403                                                                                                     | MUST for a deployed URL, WARN for localhost | specification                                                     |
| C14 | p95 latency of the read-only calls under 5 s                                                                                                                  | SHOULD                                      | Fluid Compute budget and user patience                            |

Write tools (`readOnlyHint: false`) are never fuzzed. They are covered by
layer 1 only.

Verified precondition: `tools/list` from the SDK 1.30.0 server returns plain
JSON Schema draft-07 (`"$schema": "http://json-schema.org/draft-07/schema#"`
observed in the Inspector output), so C5, C7, C8, and C9 are viable without
a plugin-specific adapter. The fuzz loop itself was not run on 2026-09-03.

### Inspector one-liners (Verified)

The same checks by hand, or as a CI smoke when the runner is not built yet:

```sh
npx @modelcontextprotocol/inspector --cli --transport http --server-url http://localhost:3999/mcp \
  --header "Authorization: Bearer demo-token" --method tools/list

npx @modelcontextprotocol/inspector --cli --transport http --server-url http://localhost:3999/mcp \
  --header "Authorization: Bearer demo-token" --method tools/call --tool-name echo --tool-arg text=hello
```

Exit codes observed with `@modelcontextprotocol/inspector@2.5.0`:

| Call                                | Exit code |
| ----------------------------------- | --------- |
| `tools/call echo` (clean)           | 0         |
| `tools/call fail` (`isError: true`) | 5         |

Exit code 5 means the tool ran and reported an error. Use it as the CI signal
for "this input must fail" cases.

---

## 3. Layer 3: mount test in a harness host

**Implemented reference.** `pnpm eval:contract` builds the fixture extension
under `evals/contract/fixtures/demo-extension`, mounts it in the isolated
`evals/contract/mount-harness`, and proves a native tool, a namespaced skill,
and a user-scoped bearer-authenticated MCP read tool. The product agent never
mounts this fixture.

**Proposed per-plugin form.** A released plugin still needs its own equivalent
harness in the plugin repository:

The seam between eve and the server is the one thing layers 1 and 2 cannot
see. Test it in a tiny eve project inside the plugin repository,
`shared/harness-host`, so the product repositories stay untouched:

```
shared/harness-host/
  package.json                eve 0.49.0 (same as the host), the plugin extensions as workspace deps
  agent/
    agent.ts                  model: mockModel(script)
    instructions.md           one line
    extensions/<name>.ts      one mount per plugin, serverUrl http://127.0.0.1:<port>
  evals/
    evals.config.ts           defineEvalConfig({})  no judge
    <name>.eval.ts            one eval per plugin
  scripts/run.ts              starts each server with PLUGIN_FAKE=1, runs `eve eval`, stops them
```

The scripted model (`mockModel` from `eve/evals`, `evals/overview.mdx`
lines 63-97) calls the tool on turn one and repeats the tool output on turn
two. No provider key is needed:

```ts
// agent/agent.ts
import { defineAgent } from "eve";
import { mockModel } from "eve/evals";

export default defineAgent({
  model: mockModel({
    modelId: "plugin-harness",
    provider: "fixtures",
    respond: ({ toolResults, lastUserMessage }) => {
      if (toolResults.length === 0) {
        // The eval prompt is "call <tool> <json>".
        const [, name, json] = lastUserMessage.match(/^call (\S+) (.*)$/s)!;
        return { toolCalls: [{ name, input: JSON.parse(json) }] };
      }
      return `RESULT ${JSON.stringify(toolResults[0]?.output)}`;
    },
  }),
});
```

One eval per plugin:

```ts
// evals/dating.eval.ts
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description:
    "dating mount: the model can reach dating__get_profile through the connection",
  async test(t) {
    await t.send("call dating__get_profile {}");
    t.succeeded();
    t.calledTool("dating__get_profile", { count: 1 });
    t.check(t.reply, includes('"displayName"')); // a field from fixtures/profile.json
  },
});
```

Assertions used: `t.succeeded()`, `t.calledTool(name, { count })`, and
`t.check(t.reply, includes(...))` (`evals/assertions.mdx` lines 18-35, 86-98).
All three are gates; `eve eval` exits non-zero on failure.

What layer 3 proves, per plugin:

1. `eve extension build` output mounts in eve 0.49.0 (capability manifest
   accepted).
2. The connection resolver mints a token the server accepts.
3. eve's MCP client negotiates a protocol version with the server.
4. The tool name reaches the model as `<mount>__<tool>` and its output comes
   back through eve.
5. The skill loads: add `t.loadedSkill("<name>")` after a prompt that says
   `load <name>` and a matching branch in the script.

First run: this is the check named in `PLUGINS.md` section 11. Build the
harness host before the first plugin's server has more than the `echo`
tool, and run it against the demo server from section 1.

---

## 4. Layer 4: deployed smoke (Proposed)

After `vercel deploy` of `plugins/<name>/server`:

```sh
TOKEN=$(pnpm --filter @jory/plugin-auth mint --sub test --workspace personal:test --product jory --plugin <name>)
pnpm mcp-conformance --url https://<preview>.vercel.app/mcp --token "$TOKEN" --fuzz 5
```

C13 (Origin) is a MUST here. The preview uses the same signing secret as the
harness; production uses its own.

---

## 5. Layer 5: behavior gym (Proposed, on demand)

The same shape as the Square gym (`evals/square/cases.ts` in this
repository): a case has a prompt, the tool groups it expects, a forbidden
tool pattern, facts the reply must contain, and a tone judge. Run it with a
real model through `eve eval` in `shared/harness-host` with the model set by
an environment variable, and paste the summary line in the release PR. Cost
and cadence follow the Square rule: on demand, not per PR.

---

## 6. CI (Proposed)

Plugin repository, `checks.yml`, on every PR:

1. `pnpm -r typecheck` and `pnpm -r build`.
2. Per server package, in a matrix: `pnpm vitest run` (layer 1).
3. Per server package: start with `PLUGIN_FAKE=1`, run `mcp-conformance`
   against `http://127.0.0.1:<port>/mcp` (layer 2).
4. `pnpm --filter harness-host eval` (layer 3).

Release workflow, `workflow_dispatch`:

5. Deploy the preview, run layer 4.
6. Run layer 5 with `AI_GATEWAY_API_KEY`, upload `.eve/evals`.
7. `npm publish` and rebuild the registry index.

No secrets are needed for steps 1 to 4.

---

## 7. What is verified and what is not

| Item                                                                  | State                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Layer 1 test file above against the demo server                       | Verified, 6 of 6 tests pass                                             |
| Inspector CLI commands and exit codes 0 and 5                         | Verified                                                                |
| `tools/list` schema is JSON Schema draft-07                           | Verified by observation                                                 |
| eve 0.49.0 client supports protocol versions 2024-11-05 to 2025-11-25 | Verified in the compiled client                                         |
| `mockModel` callback shape and `t.calledTool` matcher                 | Verified in `node_modules/eve/docs/evals/`                              |
| Local Jory admission helper and malformed-fixture tests               | Verified by `pnpm exec vitest run evals/contract/mcp-admission.test.ts` |
| The generic `shared/mcp-conformance` runner                           | Not built (still proposed)                                              |
| The fuzz loop with `json-schema-faker`                                | Not run                                                                 |
| Reference harness: mount, skill load, and credentialed MCP read       | Verified by `pnpm eval:contract`                                        |
| A released plugin's own harness                                       | Not run                                                                 |
| Vercel deploy of the Express entry                                    | Not run                                                                 |
