# Plugins: build a feature as an eve extension plus an MCP server

This document tells a coding agent how to build one plugin for this product
with no other context. A plugin is a feature that ships outside the core
repository and plugs into the agent without a change to core code. The same
package format serves two products, Jory (this repository) and Partyline (a
separate fork), and it is the unit we can sell.

Labels follow [`README.md`](README.md): **Verified** facts were exercised on
2026-09-03. **Proposed** parts are the design; nothing under a Proposed
heading exists in a repository yet.

Companion: [`PLUGIN_TESTING.md`](PLUGIN_TESTING.md) is the autonomous test
harness for the MCP server and for the plugged-in agent.

---

## 1. The decision: do not build a plugin system

**Verified.** eve already has the plugin format. Three pieces exist in the
pinned `eve@0.46.1` (`node_modules/eve/docs`):

| Piece                 | What it gives a plugin                                                                                                                                                                                                                | Doc page                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Extension package     | An npm package with `extension/{tools,skills,connections,subagents,channels,schedules,hooks,instructions.md,lib}`. The host mounts it with one file in `agent/extensions/<mount>.ts`. Every contribution gets the prefix `<mount>__`. | `extensions.md`                         |
| MCP client connection | `defineMcpClientConnection({ url, description, auth, headers, tools })`. eve is the MCP client. The model finds the tools through the built-in `connection_search` tool.                                                              | `connections/mcp.mdx`                   |
| Third-party registry  | `eve registry add @jory=https://<host>/r/{name}.json`, then `eve add @jory/<plugin>`. Shadcn registry JSON format.                                                                                                                    | `install-integrations.mdx` lines 77-190 |

The commands `eve extension init` and `eve extension build` exist in the
pinned version (`pnpm exec eve extension --help`, run 2026-09-03).

So a plugin is:

1. an **extension package** (skill, connection, optional native tools), and
2. an **MCP server** (a small HTTP service the extension's connection points at).

The host repository changes only when it mounts a plugin: one file under
`agent/extensions/`, one or two environment variables.

---

## 2. Hard limits you must design around

All four are **Verified**.

1. **The MCP server must speak Streamable HTTP or SSE over a URL.** Stdio is
   not supported (`connections/mcp.mdx` line 25). This repository already hit
   this limit with Square (`docs/SQUARE.md`). Every MCP server is a deployed
   HTTP service, never a local process.
2. **eve 0.46.1 speaks MCP protocol versions 2024-11-05 through 2025-11-25.**
   The compiled client is `node_modules/eve/dist/src/compiled/@ai-sdk/mcp/index.js`
   and lists exactly those four versions. The live MCP specification is
   revision 2026-07-28 and removed sessions and the GET stream. Build the
   server against the SDK version that implements 2025-11-25
   (`@modelcontextprotocol/sdk@1.30.0`, `LATEST_PROTOCOL_VERSION = '2025-11-25'`),
   not against the newest specification text.
3. **MCP tool results have no `toModelOutput` transform on the host side.**
   The server must return small results. A tool that returns a large payload
   must be trimmed on the server or replaced by a native tool in the
   extension (`connections/mcp.mdx`, troubleshooting section). Images and
   files must be returned as URLs, not base64. eve warns above 3 MiB for file
   parts (`tools/overview.mdx`).
4. **`tools.allow` and `tools.block` are exclusive.** Use exactly one to
   narrow what the model sees.

---

## 3. Identity contract

**Verified: what the host knows about the caller at tool time.** Read
`agent/lib/square/auth.ts:26-59` and `src/lib/access-scope.ts:19-45`.

| Field        | Value                                                                                  | Present                                                                               |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| user id      | better-auth uuid, carried as `better-auth:<uuid>` in `ctx.session.auth.current.id`     | always, once authenticated                                                            |
| workspace id | `personal:<sha256(userId)>` or a real shared workspace id, in `attributes.workspaceId` | always                                                                                |
| phone number | E.164 in `attributes.phoneNumber`                                                      | not always. Unverified iMessage senders and the local dev bypass carry no real phone. |

The phone number is the login credential and the iMessage lookup key. The uuid
is the principal. The workspace id is the tenant. The Square connection scopes
by workspace id.

The channel sets `ctx.session.auth.initiator` once at session start. Read
`ctx.session.auth.current ?? ctx.session.auth.initiator`, the same way the
Square resolver does.

**Proposed: the plugin token.** The extension's connection mints a short-lived
signed token per tool call and sends it as the bearer. The server verifies the
signature and reads the claims. The server never trusts a bare phone number.

Claims:

```
sub        user uuid            the stable identity; never changes
workspace  workspace id         the tenant; personal or shared
phone      E.164 or absent      convenience only; never a key
product    "jory" | "partyline"
plugin     mount name           one server can serve several plugins
iat, exp   exp = iat + 300 s
```

Signing: HS256 with one secret per plugin installation. The secret is the
extension config value `signingSecret` on the host side and the environment
variable `PLUGIN_SIGNING_SECRET` on the server side. For a sold plugin the
license key is this secret, so licensing and authentication are one thing.

Library: `jose` on both sides. It is not yet in this repository's
`package.json`; the extension bundles it as a normal dependency, so the host
does not install it.

### Caveats a plugin must respect

1. **Key data by `sub` or by `workspace`, and decide per plugin.** Jory data
   (a business) belongs to the workspace, because staff share one business.
   Partyline data (a person) belongs to `sub`. Write the choice in the plugin
   README.
2. **`phone` can be absent.** A tool that needs a phone number must return an
   `isError` result with a clear message, not crash.
3. **Workspace membership enforcement is a host flag.** `WORKSPACE_SCOPE_ENFORCEMENT`
   (`src/env.ts`) is off by default. The token carries what the channel
   established. When the flag is off, the host did not check membership in a
   shared workspace before the call. The plugin trusts the host signature,
   not the provenance of the claims. Do not store cross-workspace secrets in
   a plugin until the host turns the flag on.
4. **Schedules and internal runs have no user principal.** A connection with
   `principalType: "user"` fails with `reason: "principal_required"` in those
   runs (`connections/overview.mdx`). A plugin that must run from a schedule
   needs an app-scoped path with its own token claims (`sub` absent,
   `product` and `plugin` present).
5. **Tokens are cached per step.** eve resolves and caches connection tokens
   per step; they never reach the model or the history. A 300-second `exp`
   is safe. Do not set it lower than a step can take.
6. **The user id format is `better-auth:<uuid>`.** Store it verbatim. Do not
   strip the prefix; a future auth provider will use a different prefix.

---

## 4. Plugin package layout (Proposed)

One repository, `jory-plugins`, a pnpm workspace. It is separate from this
repository because Partyline consumes the same packages and because a sold
plugin needs its own release cycle.

```
jory-plugins/
  pnpm-workspace.yaml          packages: ["plugins/*/extension", "plugins/*/server", "shared/*"]
  shared/
    plugin-auth/               mint() and verify() for the token; used by both sides
    mcp-conformance/           the generic server test runner (see PLUGIN_TESTING.md)
  plugins/
    <name>/
      README.md                purpose, identity key (sub or workspace), data ownership, env vars
      extension/               the eve extension package  @jory/<name>
        package.json
        extension/
          extension.ts         defineExtension({ config: z.object({ serverUrl, signingSecret }) })
          connections/api.ts   defineMcpClientConnection; auth resolver mints the token
          skills/<name>/SKILL.md
          tools/               optional native tools (only when MCP cannot do it)
      server/                  the MCP server  @jory/<name>-server
        package.json
        src/server.ts          McpServer with tools, resources, prompts
        src/tools/<tool>.ts    one file per tool: schema + handler together
        api/mcp.ts             Vercel function entry
        test/                  contract tests (see PLUGIN_TESTING.md)
        fixtures/              deterministic data for FAKE mode
```

Rules:

- One tool per file under `src/tools/`. Keep the schema and the handler
  together, the same rule this repository applies to worker tools.
- Bare tool names. The host mount adds the prefix. Name the tool `search`,
  not `dating_search` (`extensions.md` line 44).
- No `eve` in `dependencies`. eve is a peer (`"eve": "*"`) and a dev
  dependency pinned to the host version, `0.46.1`.
- `zod` and other SDKs go in `dependencies`; `eve extension build` bundles them.

---

## 5. Build the extension package (Verified shapes)

### 5.1 Scaffold

```sh
npx eve@0.46.1 extension init <name> -y
```

Use the pinned version, not `@latest`. `npx eve@latest` resolved to `0.51.0`
on 2026-09-03 and its build manifest records `builtWithEve`. The host checks
capability metadata at build time (`extensions.md` lines 337-339). The flag
`--non-interactive` does not exist for `extension init`; `-y` suppresses
prompts.

Generated files: `extension/extension.ts`, `package.json`, `tsconfig.json`,
`AGENTS.md`, `CLAUDE.md`, `.gitignore`. `npm install` runs `prepare`, which
runs `eve extension build`, so `dist/` exists at once.

Generated `package.json` (exact, from the scaffold):

```json
{
  "name": "<name>",
  "version": "0.0.0",
  "type": "module",
  "eve": {
    "extension": { "source": "./extension", "dist": "./dist/extension" }
  },
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.mjs" },
    "./tools": {
      "types": "./dist/tools/index.d.ts",
      "default": "./dist/tools/index.mjs"
    }
  },
  "scripts": {
    "build": "eve extension build",
    "prepare": "eve extension build",
    "typecheck": "tsc"
  },
  "dependencies": { "zod": "4.5.4" },
  "devDependencies": {
    "@types/node": "24.x",
    "eve": "0.46.1",
    "typescript": "7.0.2"
  },
  "peerDependencies": { "eve": "*" },
  "engines": { "node": "24.x" }
}
```

Rename `name` to `@jory/<name>`. Only `.` and `./tools` get export subpaths.
Connections and skills do not get an importable subpath.

### 5.2 Config

```ts
// extension/extension.ts
import { defineExtension } from "eve/extension";
import { z } from "zod";

export default defineExtension({
  config: z.object({
    serverUrl: z.string().url(),
    signingSecret: z.string().min(32),
  }),
});
```

The schema must validate synchronously. Contributions read the bound config
through the extension handle: `import extension from "../extension"` then
`extension.config.serverUrl`.

### 5.3 Connection with the per-caller token

```ts
// extension/connections/api.ts
import { defineMcpClientConnection } from "eve/connections";
import { mintPluginToken } from "@jory/plugin-auth";
import extension from "../extension";

export default defineMcpClientConnection({
  url: `${extension.config.serverUrl}/mcp`,
  description:
    "Dating profiles for the current user: create, read, update, and search profiles.",
  auth: (ctx) => ({
    principalType: "user",
    getToken: async () => {
      const caller = ctx.session.auth.current ?? ctx.session.auth.initiator;
      return mintPluginToken(caller, {
        secret: extension.config.signingSecret,
        product: "jory",
        plugin: "dating",
      });
    },
  }),
  tools: { allow: ["get_profile", "upsert_profile", "search_profiles"] },
});
```

Write the `description` for the model. It is the main signal
`connection_search` uses to pick this connection (`connections/mcp.mdx`
line 25).

The resolver shape and `principalType: "user"` come from
`connections/overview.mdx` lines 86-116. `mintPluginToken` must return the
static-token shape from the same page, `{ token, expiresAt }`, with
`expiresAt` equal to the token's `exp`.

### 5.4 Skill

```md
---
description: How to help a user build and search a dating profile with the dating tools.
---

# Dating profiles

Use `dating__get_profile` before you ask the user a question; the profile may
already answer it. ...
```

A packaged skill (`skills/<name>/SKILL.md`) **must** have the `description`
frontmatter (`skills.mdx`). The skill body can name the qualified tool names
(`<mount>__<tool>`). The doc does not show an example with a connection tool;
treat this as inferred and check it in the host eval (see PLUGIN_TESTING.md,
layer 3).

### 5.5 Build and check

```sh
pnpm build        # eve extension build -> dist/extension, _manifest.json
pnpm typecheck    # tsc, must print nothing
```

Verified output of a build with one tool, one skill, and one connection:

```
dist/extension/_manifest.json
dist/extension/connections/api.mjs   (+ .d.ts)
dist/extension/extension.mjs         (+ .d.ts)
dist/extension/skills/demo/SKILL.md
dist/extension/tools/ping.mjs        (+ .d.ts)
dist/index.mjs, dist/tools/index.mjs (+ .d.ts)
```

Publish `dist/` only (`files: ["dist"]`).

---

## 6. Build the MCP server (Verified shapes)

### 6.1 Stack

| Package                           | Version verified                    | Role                                                           |
| --------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `@modelcontextprotocol/sdk`       | 1.30.0 (npm `latest` on 2026-09-03) | `McpServer`, `StreamableHTTPServerTransport`, client for tests |
| `express`                         | 5.2.1                               | HTTP listener for local runs and tests                         |
| `zod`                             | 4.5.4                               | schemas                                                        |
| `@modelcontextprotocol/inspector` | 2.5.0                               | CLI smoke                                                      |
| `vitest`                          | 5.0.0                               | contract tests                                                 |

Do not use `mcp-handler@2.x` for now. It peer-depends on
`@modelcontextprotocol/server@^2.0.0` and serves protocol 2026-07-28 natively;
the 2025-era transport that eve 0.46.1 speaks is a "legacy stateless" fallback
in that package. That path is unverified here. Revisit when the host upgrades
eve.

### 6.2 Server (verified running on 2026-09-03)

```ts
// src/server.ts
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

function buildServer() {
  const server = new McpServer({ name: "demo", version: "1.0.0" });

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echoes back the given text",
      inputSchema: { text: z.string() }, // raw zod shape, not z.object()
      outputSchema: { text: z.string() },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ text }) => ({
      content: [{ type: "text", text }],
      structuredContent: { text },
    })
  );

  server.registerResource(
    "about",
    "demo://about",
    {
      title: "About",
      description: "Static info resource",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: "This is the demo MCP server." }],
    })
  );

  server.registerPrompt(
    "greet",
    {
      title: "Greet",
      description: "Produce a greeting prompt",
      argsSchema: { name: z.string() },
    },
    async ({ name }) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: `Say hello to ${name}.` },
        },
      ],
    })
  );

  return server;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const claims = await verifyBearer(req.header("authorization")); // see 6.3
  if (!claims) {
    res.setHeader("WWW-Authenticate", "Bearer");
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  }); // stateless
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(Number(process.env.PORT) || 3999);
```

Facts checked against the installed `.d.ts`:

- `registerTool` takes a raw zod shape for `inputSchema` and `outputSchema`
  (`ZodRawShapeCompat`), not `z.object(...)`.
- `registerPrompt` uses `argsSchema`, not `inputSchema`.
- `registerResource` needs a metadata object even when empty.
- The SDK validates `structuredContent` against `outputSchema` before it
  sends the result.
- A handler that throws becomes `{ isError: true, content: [...] }` for the
  client. The model can read the message and retry.
- Stateless mode (`sessionIdGenerator: undefined`) creates one `McpServer`
  per request. This is the mode that matches Vercel functions and the
  direction of the specification.

### 6.3 Verify the token

```ts
// src/auth.ts
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.PLUGIN_SIGNING_SECRET!);

export async function verifyBearer(header: string | undefined) {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    return payload as {
      sub: string;
      workspace: string;
      phone?: string;
      product: string;
      plugin: string;
    };
  } catch {
    return undefined;
  }
}
```

Pass `claims` into `buildServer(claims)` so every tool handler receives the
caller. Never read a user id from tool input.

### 6.4 Requirements for every tool

Enumerated from the MCP specification (2025-11-25 features that the SDK
implements). Each plugin server must:

| Requirement                                                             | Level                      | Why                                                                                               |
| ----------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `description` of 1 to 3 sentences written for the model                 | MUST                       | It is the only thing the model reads to choose the tool.                                          |
| `inputSchema` with a description on every field                         | MUST                       | The host exposes the schema verbatim.                                                             |
| `outputSchema` + `structuredContent`                                    | SHOULD                     | The host eval asserts on structured fields.                                                       |
| `annotations` with all four hints set explicitly                        | MUST                       | The host approval policy can key on them later. Never leave a write tool as `readOnlyHint: true`. |
| Return `isError: true` with a human message for a caller error          | MUST                       | The model needs the message to recover. A 500 tells it nothing.                                   |
| Result text under 8 KB; files and images as URLs                        | MUST                       | Section 2, limit 3.                                                                               |
| `readOnlyHint` tools are idempotent and safe to retry                   | MUST                       | eve replays an interrupted step (`tools/overview.mdx`).                                           |
| Write tools accept an idempotency key or are naturally idempotent       | SHOULD                     | Same reason.                                                                                      |
| 401 with `WWW-Authenticate: Bearer` when the token is absent or invalid | MUST                       | Verified shape above.                                                                             |
| Reject an unexpected `Origin` header with 403                           | MUST for a deployed server | Specification requirement against DNS rebinding. The demo does not do it.                         |
| Resources for static reference data, prompts for canned flows           | MAY                        | Use when it removes a tool.                                                                       |

Skipped on purpose: sampling, elicitation, roots, completions, progress, and
logging notifications. eve's client is the consumer; none of these reach the
model through a connection. Sessions and SSE resumability are skipped because
stateless mode does not use them and the specification removed them.

### 6.5 Deploy

Each server deploys as its own Vercel project with root directory
`plugins/<name>/server`. Fluid Compute, Node.js, default timeout 300 s. The
function entry wraps the Express app:

```ts
// api/mcp.ts
import app from "../src/server";
export default app;
```

Environment variables on the server: `PLUGIN_SIGNING_SECRET`, plus provider
keys (for example `AI_GATEWAY_API_KEY`). Never the host database URL.

Not verified here: the Express-in-a-Vercel-function entry and the
`mcp-handler` alternative. Verify with a preview deploy and the layer 4 smoke
in PLUGIN_TESTING.md before the first release.

---

## 7. Mount a plugin in the host

One file:

```ts
// agent/extensions/dating.ts
import dating from "@jory/dating";
export default dating({
  serverUrl: process.env.DATING_PLUGIN_URL!,
  signingSecret: process.env.DATING_PLUGIN_SECRET!,
});
```

The filename is the namespace. The connection becomes `dating__api`, its
tools `dating__get_profile` and so on, the skill loads under the same prefix.

Add the two variables to `src/env.ts` under the existing pattern, and to
Vercel with `vercel env add`. Nothing else in core changes.

To gate a plugin per workspace later, wrap the mount's contributions with
`defineDynamic` keyed on `ctx.session.auth` (`guides/dynamic-capabilities.md`).
A dynamic tool that matches an authored name overrides it. Do not add this
until a second workspace needs a different plugin set.

Local development: mount a workspace package with `workspace:*` only when
the plugin repository and the host share one pnpm workspace. They do not.
Use `pnpm add ../jory-plugins/plugins/dating/extension` (a `file:` link) and
rebuild the extension by hand after a change. `eve dev` auto-rebuilds only
workspace members (`extensions.md`, "Use an extension in a workspace").

---

## 8. Publish and sell (Proposed)

1. Publish `@jory/<name>` to npm under a private scope. Consumers need an npm
   token. This is the paywall.
2. Host a registry: a static `registry.json` plus one JSON file per item in
   the shadcn registry format (`install-integrations.mdx` lines 51-76 for
   the exact item shape). Each item lists the npm dependency, the two env
   vars, and the mount file to write under `agent/extensions/`.
3. A buyer runs `eve registry add @jory=https://plugins.jory.app/r/{name}.json`
   then `eve add @jory/dating --non-interactive`. Exit code 2 means a
   question is pending; the NDJSON tail gives the `next.command`.
4. The license key is the signing secret. The server rejects a token signed
   with a revoked key. Revocation is a server-side list.

Validate the registry with `pnpm dlx shadcn@latest registry validate` and
build it with `pnpm dlx shadcn@latest registry build`.

---

## 9. The first plugins and their shapes

| Plugin            | Shape                                     | Identity key                                | Data                                   | Notes                                                              |
| ----------------- | ----------------------------------------- | ------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| dating-profiles   | MCP server, own database                  | `sub`                                       | own Postgres (Neon)                    | Partyline only. Photos as Blob URLs.                               |
| local-events      | MCP server, own database                  | `sub` for RSVPs, none for the event catalog | own Postgres                           | Search is `readOnlyHint`. RSVP needs an idempotency key.           |
| database          | MCP server, own database                  | `workspace`                                 | own Postgres, one schema per workspace | Jory: the business's records. Generic "tables" tool set.           |
| image-generation  | MCP server, stateless                     | `sub` for quota                             | none; output to Blob                   | Return a URL, never base64. Provider through AI Gateway.           |
| video-generation  | MCP server, stateless, long jobs          | `sub` for quota                             | job table                              | Start returns a job id; a second tool polls. 300 s limit per call. |
| image-pdf         | MCP server, stateless                     | none                                        | none                                   | Input by URL. Output by URL.                                       |
| vision-structured | MCP server, stateless                     | none                                        | none                                   | Input by URL. `outputSchema` per extractor.                        |
| phone-calls       | extension with native tools and a channel | `workspace`                                 | host                                   | A channel must run in the host process. Not an MCP server.         |

Open decision, not set yet: whether Jory-only data plugins may read the host
Postgres instead of their own database. The recommendation is own database
for every sold plugin.

---

## 10. Definition of done for one plugin

A plugin is done when all of these are true and the evidence is in the PR:

1. `pnpm typecheck` and `pnpm build` in `extension/` print no error.
2. Layer 1, 2, and 3 tests in PLUGIN_TESTING.md pass, with the result lines
   pasted in the PR body.
3. The server is deployed to a preview URL and the layer 4 smoke passes
   against it.
4. The plugin README states the identity key, the data owner, the env vars,
   and the six caveats from section 3 that apply.
5. `docs/agent-loop.html` in the host is updated when the mount adds a
   connection, tool, or skill (AGENTS.md rule).
6. The host mount PR includes the `eval:square` result line when the mount
   changes `agent/instructions.md` or a skill (AGENTS.md rule).

---

## 11. What is not verified

- eve 0.46.1 talking to an SDK 1.30.0 server end to end. Both sides list
  protocol 2025-11-25, and the SDK server passed its own client tests, but
  no eve session called a plugin tool in this session. Layer 3 in
  PLUGIN_TESTING.md is the check. Run it first.
- The Express app as a Vercel function entry.
- `eve add --non-interactive` against a self-hosted registry item.
- A skill body that names `<mount>__<tool>` and steers the model to it.
