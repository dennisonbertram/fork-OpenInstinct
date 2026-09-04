# Adding our own integrations and skills

This guide covers integrations authored and reviewed by us. Customers may
connect an account to an integration we ship; they cannot supply arbitrary MCP
server URLs, install packages, or execute their own code through this design.
Customer-managed endpoints remain future work in
[PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md#stage-2-customer-mcp-endpoints-through-a-broker).

Reviewed against the source and installed Eve 0.49.0 documentation on
2026-09-04. **Implemented** means code exists; **Verified** requires a named
execution result; **Proposed** means work remains. Historical results are not
fresh deployment evidence. See [PLUGIN_TESTING.md](PLUGIN_TESTING.md) for checks.

## 1. Choose the integration, then its packaging

An integration does not necessarily require an MCP server or a separate
repository. These pieces solve different problems:

| Piece              | Use it for                                                                                               | Current example                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Skill              | Instructions the model loads when a task calls for them; no new permissions or execution capability      | `agent/skills/square.md`, `agent/skills/email.md`                                              |
| Native Eve tool    | A bounded operation implemented with an SDK or application service, with its own validation and approval | `agent/tools/gmail.ts`                                                                         |
| OpenAPI connection | Tools generated from a provider's HTTP API specification                                                 | `agent/connections/square.ts`                                                                  |
| MCP connection     | Tools discovered from an existing, reviewed MCP HTTP endpoint                                            | Reference fixture only: `evals/contract/fixtures/demo-extension/extension/connections/echo.ts` |
| Eve extension      | A reusable package of skills, tools, connections, or other supported contributions                       | `evals/contract/fixtures/demo-extension`                                                       |

Prefer an existing reviewed registry integration or native implementation when
it fits. Use OpenAPI when the provider's specification gives us the operations
we need. Use MCP when an existing server fits, or when a capability actually
needs a separately operated tool service. Do not wrap an adequate OpenAPI
connection in a new MCP server just to call it a plugin.

Keep a product-specific integration with its existing owner. Package a
reusable optional capability as an Eve extension and mount it under
`agent/extensions/`. An extension can contain an OpenAPI connection or native
tools; an MCP server is not mandatory. The product agent currently has no
extension mounts. The reference extension is mounted only in the test harness.

Do not build a core plugin loader, registry, catalog service, or licensing
system as a prerequisite for our next integration.

### Decision: native tools first for our own product capabilities

**Accepted direction, 2026-09-04; no new feature implemented by this decision.**
When we own a capability's behavior and Eve is its only concrete consumer,
start with a small native Eve tool surface. Design tools around user tasks,
with explicit inputs, bounded results, permissions, approval, and failure
behavior. Do not start by building an MCP server or publishing a general API.
OpenAPI is an API-description format, not an OpenAI service.

| Situation                                                              | Starting choice                                | Reason to choose another approach                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| First-party feature with product-specific behavior                     | Native Eve tool                                | A real external consumer or separate service boundary needs another interface       |
| Existing provider with a suitable API specification                    | OpenAPI connection                             | Generated operations need substantial task-specific orchestration or result shaping |
| Existing reviewed MCP server that meets the task and auth requirements | MCP connection                                 | Its transport, permissions, results, or deployment do not fit this product          |
| Capability shared with a named non-Eve agent application               | Consider an MCP service                        | A conventional API may better fit the actual consumers; evaluate their contracts    |
| Capability reused across our Eve agents/apps                           | Eve extension with native tools or connections | Use MCP only if a service/protocol boundary is also needed                          |

**Why native can be less work.** Both approaches still require the feature's
business logic, data access, validation, authorization, and tests. A native
Eve tool can call the owning application service or provider SDK directly.
A newly operated MCP server additionally needs an HTTP/protocol endpoint,
credential handling across that boundary, deployment/lifecycle ownership, and
client/server integration tests. For an Eve-only feature that fits the app
runtime, avoiding those pieces can reduce initial work and maintenance.

This is an architectural judgment, not a measured effort or performance claim.
An existing MCP server may be less work than implementing its operations.
Native tools run in the application's trusted runtime; they are not an
isolation boundary. Separate compute, resource limits, release ownership, or
other operational requirements can justify a service, but a separate service
does not automatically need MCP. Choose its interface for its consumers.

**Illustrative example, not a planned feature:** a `get_daily_sales_summary`
native tool could call an owning service that handles date ranges, pagination,
and totals, then return the compact result the agent needs. The model would
not need to assemble that procedure from many general API operations. This
does not propose replacing Square's current OpenAPI connection or adding that
tool now; an existing connection can remain alongside a narrowly justified
native tool.

Keep domain behavior with its owner and avoid putting Eve session objects or
model-specific formatting into reusable business logic. Do not introduce a
second adapter, interface hierarchy, or service merely for hypothetical reuse.
If another consumer later needs access, add an API or MCP adapter around the
existing behavior and recheck authorization, identity, and error semantics at
that boundary. Reuse is possible; converting to MCP is not guaranteed to be
free or automatic.

For each proposed feature, record the user task, consumers, owning code/data,
read/write operations, auth/approval rules, result/error contract, and smallest
acceptance test. State why the selected interface fits. Choose native by
default when the only reason for MCP is that an agent will call the feature.
Select the feature before selecting new infrastructure.

## 2. Square: the existing OpenAPI example

**Implemented.** `agent/connections/square.ts` calls
`defineOpenAPIConnection`, not `defineMcpClientConnection`. It uses:

- Square's API specification pinned at
  `551af55f16fce178780e6556570973aaf660e52a`;
- `Square-Version: 2025-04-16`;
- `operations.allow: squareReadOperations` (145 operation IDs);
- `squareAuth`, using the user's Vercel Connect authorization in the normal
  application path; and
- a sandbox or production REST base URL selected by `squareBaseUrl`.

The model loads the Square skill, discovers tools through `connection_search`,
and calls names such as `square__ListCustomers`. Eve calls the REST API.
Neither discovery nor a double-underscore tool name implies MCP.

Square separately offers an MCP server. Its
[official documentation](https://developer.squareup.com/docs/mcp) describes
production-only remote access and a local sandbox option. That distinction
motivated the OpenAPI choice; it does not require us to migrate Square.
See [SQUARE.md](SQUARE.md) for recorded sandbox evidence and outstanding checks.

The read allow-list and OAuth scopes are separate controls. The 145 generated
operation IDs do not prove every operation is authorized by the eight requested
scopes or exercised by the tests. Square auth verifies workspace access and
rejects a recorded revoked installation when enforcement is enabled. The OAuth
subject is the user; a workspace-owned installation record does not establish
shared seller-account access for every workspace member.

The sandbox static-token path exists for isolated development/evals and is
rejected when either the Square environment or Vercel environment is production.
Do not copy that path as a user authorization pattern.

## 3. Skills and exact names

Eve discovers skills under the owning agent's `skills/`. Prefer a clear task
trigger in `description`. A packaged skill must have that frontmatter:

```md
---
description: Use the extension's read-only echo service without exposing its credential.
---

# Reference read-only service

Use `demo__echo__echo` to read from the reference service. The connection
supplies authorization; never put its credential in tool arguments.
```

This example corresponds to the committed reference skill at
`evals/contract/fixtures/demo-extension/extension/skills/reference/SKILL.md`.
It assumes the extension mount is named `demo`. If the mount name changes,
review literal names in skills and run the mount eval again.

| Authored resource                                             | Runtime name                        |
| ------------------------------------------------------------- | ----------------------------------- |
| `agent/skills/square.md`                                      | `square` (loaded with `load_skill`) |
| `agent/connections/square.ts`, operation `ListCustomers`      | `square__ListCustomers`             |
| Mount `demo`, native tool `ping`                              | `demo__ping`                        |
| Mount `demo`, skill `reference`                               | `demo__reference`                   |
| Mount `demo`, connection `echo`                               | `demo__echo`                        |
| Tool `echo` on that connection                                | `demo__echo__echo`                  |
| Proposed mount `dating`, connection `api`, tool `get_profile` | `dating__api__get_profile`          |

A skill guides use of already authorized tools. It cannot enforce an allow-list,
workspace boundary, or approval rule. Root and subagent skills are scoped
separately. Static skill text does not require a sandbox; access to packaged
supporting files and dynamic skills does. Preserve the root `load_skill` and
`connection_search` tools.

## 4. Smallest extension example

Use the committed fixture as the executable example rather than copying an
untested server template:

```text
evals/contract/fixtures/demo-extension/
  package.json
  extension/
    extension.ts                 validated serverUrl/serverToken configuration
    connections/echo.ts          read-only, user-scoped MCP connection
    skills/reference/SKILL.md    procedure with exact qualified tool name
    tools/ping.ts                native tool
```

The corresponding mount is
`evals/contract/mount-harness/agent/extensions/demo.ts`:

```ts
import demo from "@openinstinct/contract-demo-extension";
import { env } from "../../env";

export default demo({
  serverToken: env.CONTRACT_MCP_TOKEN,
  serverUrl: env.CONTRACT_MCP_URL,
});
```

This is a test-only mount using validated harness environment variables. A
product mount must validate its environment in `src/env.ts`, install the actual
package dependency, and configure the intended authorization. Adding a mount
can also require installation records, account-connect UI, and provider setup;
"one mount file" describes Eve composition, not the whole user journey.

The fixture's `extension/connections/echo.ts` uses `defineDynamic` on
`session.started`, a stable `instanceKey`, `principalType: "user"`, and
`tools: { allow: ["echo"] }`. It supplies one synthetic static bearer token.
That proves the wiring pattern, not per-user token minting or tenant isolation
on the MCP server. Do not deploy the fixture as a service.

For a new package, use `eve extension init <name> -y` with the host-compatible
Eve version and build with `eve extension build`. The committed fixture's
`package.json` is the local reference for exports and build scripts. Resolve
versions from the lockfile; historical scaffold versions are not an instruction
to upgrade. For packages in this pnpm workspace, use workspace dependencies.
For a separate repository, use an explicit package/file dependency and rebuild
its distribution before testing the host.

## 5. Credentials and caller scope

Use the provider's existing OAuth/connection path when it fits. A new signed
plugin token is needed only if a service we operate needs delegated caller
identity; it is not needed for every integration.

For a user's external account, set `principalType: "user"`. Resolve the caller
from `ctx.session.auth.current ?? ctx.session.auth.initiator`, validate it
through the owning scope/auth path, and check active access before obtaining
credentials. Never let the model choose the workspace, provider endpoint,
credential, or approval policy.

Current source facts:

- `src/env.ts` defaults `WORKSPACE_SCOPE_ENFORCEMENT` to `enforce`; `off` is
  rejected in production. This is a code default, not a deployment audit.
- `agent/lib/principal-scope.ts` preserves the complete principal ID, including
  `better-auth:`. It checks that such IDs match their personal workspace;
  arbitrary shared-workspace claims are not an implemented general contract.
- Phone metadata may be absent. Do not use it as the primary data key.
- A run without a user principal cannot use user-scoped connection auth.
  However, this repository's scheduled worker explicitly propagates a user
  principal (`agent/schedules/dynamic.ts`); schedules are not universally
  app-scoped. Preserve its lease and scope checks. Test each integration in
  the intended scheduled path before claiming it works there.
- Eve caches connection tokens per step. `getToken` is not a guaranteed
  once-per-tool-call hook. Its `expiresAt` is milliseconds since epoch; JWT
  `exp` is seconds, so return `expiresAt: exp * 1000` when minting a JWT.
  A fixed five-minute lifetime has not been proven sufficient for all steps.

**Proposed, only for a service we operate:** define a minimal signed claim
contract with the authenticated subject, workspace if relevant, intended
service/audience, and expiry. Validate required claims at runtime; a TypeScript
cast does not validate a token payload. Check signature, expiry and destination,
then pass verified identity into handlers and enforce data ownership there.
Test expired, missing, malformed, wrong-service, and cross-user/workspace cases.
Choose key ownership and rotation with the first service. Do not equate a
license string with caller authorization or add phone claims without a need.

## 6. MCP-specific constraints

The installed Eve MCP connection accepts a Streamable HTTP or SSE URL, not a
stdio subprocess. A local loopback HTTP server is valid for isolated tests;
HTTP transport does not mean every development server must be deployed.

The committed demo uses `@modelcontextprotocol/sdk@1.30.0` and a stateless
`StreamableHTTPServerTransport`. Keep server/client protocol compatibility
under an executable connection test when upgrading; do not assume the newest
specification or SDK matches this host.

Use exactly one of `tools.allow` or `tools.block` for MCP. OpenAPI uses
`operations.allow` or `operations.block`. Prefer an explicit reviewed allow-list.
Dynamic connections are supported by installed Eve; authenticated dynamic
entries require a stable, non-secret `instanceKey`. That capability is not
permission to accept customer-controlled endpoints.

Bound results at the service or owning tool. Eve MCP connections have no
host-side `toModelOutput` transform. An 8 KiB text budget may be a useful
per-tool target, but it is not an MCP requirement or an enforced demo limit.
Choose and test a concrete bound for the real integration. Return artifact
references through an appropriate scoped delivery path instead of large blobs.

Tool annotations describe intent; they do not enforce approval or isolation.
Configure writes with an explicit approval policy, replay/idempotency behavior,
and a result that distinguishes success, failure, and uncertain dispatch.
A read-only call need not return identical data twice; the underlying data can
change. Do not blindly retry an uncertain write.

The demo server binds only to loopback and has no general input-size limit or
production identity verifier. A deployed service needs its own authenticated,
bounded endpoint, transport/origin validation, lifecycle handling, and preview
smoke test. Hosting platform, timeout, and server entrypoint must be verified
for that service. No Express/Vercel entrypoint is proven by the current fixture.

## 7. What we need before adding the next integration

1. Specify one user task, needed reads/writes, data owner, and whether it must
   work in chat, scheduled runs, or both.
2. Inspect existing registry/native support and provider docs. Choose native,
   OpenAPI, or MCP based on the actual service, then decide if an extension is
   useful for reuse. Keep authored files with their owners.
3. Define the narrow operation set, credential source, account connection and
   revocation behavior, and approval/retry rules. Include missing-connection,
   empty-result, denied-access, and provider-error behavior.
4. Add a skill only when procedural guidance helps. Test its trigger, exact
   names, and prohibited actions rather than relying on prose for enforcement.
5. Add focused contract/auth tests; use the mount harness for an extension.
   Exercise the actual user path with designated test data before claiming
   the integration works. Follow [PLUGIN_TESTING.md](PLUGIN_TESTING.md) and
   the repository's required checks.
6. Update owning docs and `agent-loop.html` if represented runtime behavior
   changes. This documentation review adds no runtime behavior.

No new integration, Square migration, or customer installation feature is
selected by this review.

## 8. Deferred research

The earlier research proposed a separate `jory-plugins` workspace, private npm
packages, a shadcn-style Eve registry, signed service tokens, and a generic MCP
conformance runner. These remain options for demonstrated reuse/distribution
needs, not prerequisites or existing infrastructure.

Candidate ideas included profiles, local events, workspace data, image/video
generation, document/vision extraction, and phone calls. Their ownership,
transport, storage, and hosting choices must be made when a feature is selected;
a phone transport would use an Eve channel rather than an MCP wrapper.

Customer-supplied endpoints and their broker remain explicitly future work.
The product may eventually enable reviewed capabilities per agent/workspace,
but Eve supporting dynamic resolution does not mean that product UI or policy
system has been implemented.

The earlier package, registry, and scratch-server experiments remain available
in the [pre-review plugin guide](https://github.com/dennisonbertram/fork-OpenInstinct/blob/f047b5a37ff9b8aa5bc0fb723155dbecdd0402e6/docs/PLUGINS.md)
and [pre-review testing plan](https://github.com/dennisonbertram/fork-OpenInstinct/blob/f047b5a37ff9b8aa5bc0fb723155dbecdd0402e6/docs/PLUGIN_TESTING.md).
Those are historical research, including the errors corrected here, not current
implementation instructions.

## Evidence and reading

- Installed `eve/docs/README.md`, `skills.mdx`, `extensions.md`,
  `connections/overview.mdx`, `connections/openapi.mdx`,
  `connections/mcp.mdx`, and `install-integrations.mdx`.
- [Square implementation and recorded results](SQUARE.md).
- [Contract harness and its limits](CONTRACT_EVALS.md).
- [Architecture ownership](PLATFORM_ARCHITECTURE.md).
- [Integration verification](PLUGIN_TESTING.md).
