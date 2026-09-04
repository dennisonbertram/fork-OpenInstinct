# Testing our integrations and extension mounts

Companion to [PLUGINS.md](PLUGINS.md). Choose checks for the integration we
actually build: native tool, OpenAPI connection, MCP connection, or extension.
A skill-only change does not need an MCP server, and an OpenAPI integration
does not need MCP conformance tests.

Reviewed against committed source on 2026-09-04. This document distinguishes
runnable checks from proposed infrastructure. A passing local test is not a
provider, OAuth refresh, or deployment result.

## 1. Existing checks and what they establish

| Check                | Implemented scope                                       | Limit                                                               |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm check`         | Lint, types, Vitest, formatting, Knip, boundaries       | Does not contact real Square to prove an account works              |
| `pnpm build`         | Next/Eve application build                              | Does not deploy or exercise provider credentials                    |
| `pnpm eval:contract` | Model-free product wiring plus isolated extension mount | Synthetic caller, fake Square, loopback MCP; no real-model judgment |
| `pnpm eval:square`   | Real-model Square behavior against designated fake data | Not live OAuth, token refresh, or real seller API verification      |
| `pnpm test:e2e`      | Repository browser journeys                             | Only the flows explicitly covered by the tests                      |

The Checks workflow runs checks, contract evals, and E2E. The repository also
requires a build before handoff. Run paid Square evals for the paths named in
AGENTS.md; documentation-only edits do not trigger that path rule. For an
integration behavior change, run the focused regression first and then the
required repository gates. Include the exact result and any skips or failures
in the PR, rather than treating a command's existence as verification.

## 2. Maintained MCP and extension example

Run from the repository root:

```sh
pnpm eval:contract
```

The supervisor `scripts/run-contract-evals.ts` starts an isolated database,
fake Square, and loopback MCP server, builds the fixture extension, runs the
product and mount evals, and tears down its services. It removes `AI_GATEWAY_API_KEY` and `VERCEL_OIDC_TOKEN` from the child
environment and uses a scripted model. Docker and
the repository dependencies are prerequisites; it needs no model-provider key.
See [CONTRACT_EVALS.md](CONTRACT_EVALS.md) for the complete contract matrix.

Use these maintained source files rather than a second inline harness:

| File under `evals/contract/`                                  | Purpose                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `fixtures/demo-mcp/server.ts`                                 | Stateless SDK HTTP server with a fixed synthetic bearer and an `echo` tool                         |
| `fixtures/demo-mcp/server.test.ts`                            | Missing/wrong bearer requests return 401 with a Bearer challenge                                   |
| `fixtures/demo-extension/extension/extension.ts`              | Validated mount configuration                                                                      |
| `fixtures/demo-extension/extension/connections/echo.ts`       | User-scoped dynamic MCP connection with a stable `instanceKey` and read allow-list                 |
| `fixtures/demo-extension/extension/skills/reference/SKILL.md` | Namespaced skill with the actual remote tool name                                                  |
| `mount-harness/agent/extensions/demo.ts`                      | Mounts the built package                                                                           |
| `mount-harness/agent/channels/eve.ts`                         | Establishes the synthetic authenticated user                                                       |
| `mount-harness/agent/agent.ts`                                | Scripted model that discovers a connection before calling its tool and checks credential exclusion |
| `mount-harness/evals/mount-demo-connection.eval.ts`           | Asserts discovery, successful `demo__echo__echo`, output, and no credential in the reply           |
| `mount-harness/evals/mount-demo-skill.eval.ts`                | Asserts `load_skill` loads `demo__reference`                                                       |
| `mount-harness/evals/mount-demo-tool.eval.ts`                 | Asserts native `demo__ping` execution                                                              |

A mount test needs the authenticated channel and discovery step as well as the
package and model. Calling a remote tool directly in a scripted model before
it has been discovered is not an equivalent test.

The fixture proves user-scoped Eve auth configuration and bearer transport.
Its server receives one fixed test credential, not a JWT with user/workspace
claims. It does **not** prove signed-token minting, expiry, refresh, revocation,
server-side tenant isolation, arbitrary resources/prompts, write approvals, or
a deployed service. Its echo input/output and request body are not generally
size-bounded. Keep it isolated; do not use it as a deployable server template.

The guides previously recorded six tests against a scratch Express demo and
Inspector exit codes on 2026-09-03. Those are historical research observations,
not results from this committed fixture. The maintained server unit file has
two authorization cases; tool execution is checked by the mount eval. Use fresh
command output for current counts and outcomes.

## 3. Minimum tests for the next integration

### Native tool or OpenAPI connection

Test the owning boundary with designated fixtures:

- A real task's successful request and bounded response, including the exact
  operation/path, required headers, and credential source.
- Missing authorization, revoked installation, wrong owner/workspace, and
  missing provider configuration. Confirm denial occurs before provider access.
- Empty results, provider errors, pagination where relevant, and malformed input.
- Disallowed operations absent or denied. A read-only contract includes an
  attempted write; HTTP method alone is not a complete permission policy.
- For writes, approval before dispatch, duplicate/replay handling, and an
  uncertain outcome that does not claim success or trigger a blind retry.

Square's existing references are `agent/lib/square/tests/auth.test.ts`,
`agent/lib/square/tests/operations.test.ts`,
`tests/integration/connection-installations.test.ts`, and the Square rows in
`evals/contract/`. Native Gmail tools demonstrate explicit send approval in
`agent/tools/gmail.ts`; use the owning tests when working on that path.

### Skill or extension

Test the skill's trigger and exact loaded name, relevant allowed tool call,
and an unsupported request/refusal. A scripted skill-load assertion proves
wiring, not that a real model will follow every instruction. Use a behavior
case when task judgment changes; follow the Square eval rule where applicable.

For an extension, build the package and test the installed distribution through
an isolated Eve mount, including connection discovery and auth. Test the
actual mount name used by the product; literals in skill text do not become
correct merely because the capability namespace changes.

### MCP service we operate

Add real HTTP client/server tests to the service's own repository/package.
Test protocol initialization, discovery, allowed calls and structured output,
invalid input, missing/invalid credentials, and clean shutdown. With delegated
identity, include expired/malformed/wrong-audience tokens and two principals
attempting to access each other's data. An echo with one shared token is not
that test.

Set explicit request/result bounds and test them. Validate supported transports
and origins for the intended deployment. Test write operations only against
controlled fixtures with explicit expected effects and replay behavior.
Tool annotations and JSON Schema alone cannot prove these properties.

## 4. Real user-path acceptance

Before claiming an integration works, exercise its designated provider test
account: connect it, ask the supported question, inspect the actual tool call
and result, then test the missing/revoked connection path. Use synthetic or
explicitly designated test data. Do not log credentials or vault contents.

Check the intended channel. Web chat success does not prove iMessage delivery.
If scheduled use is required, exercise the scheduled caller/lease path too.
If writes are in scope, verify approval and resulting provider state.

For a separately hosted MCP service, deploy a preview and repeat authenticated
discovery and a bounded real call. Verify the actual server entrypoint,
transport, timeout, shutdown/lifecycle behavior, and authorization. The local
Node HTTP fixture does not prove an Express export or Vercel function works.
Follow the [operations runbook](operations/VERCEL.md) for deployment changes.
Token refresh must be tested or explicitly listed as unverified.

## 5. Optional future conformance runner

**Proposed; not built.** The earlier research suggested a generic runner that
reads `tools/list`, validates schemas, checks authentication and size bounds,
and fuzzes read-only inputs. It is not a prerequisite for our next integration.
Start with the explicit tests above and extract shared checks only when several
services need them.

If built, distinguish MCP requirements from our own policy (description
quality, annotation completeness, text budget, latency target). Negotiate a
supported protocol with the actual installed client instead of hard-coding an
assumed latest version. Validate the schema dialect actually advertised.

Schema-valid inputs may still lack valid domain IDs or business prerequisites.
A generic fuzzer cannot infer these or establish caller isolation. Fuzz only
controlled test data; do not trust a third-party `readOnlyHint` as authorization
to call arbitrary tools. Never fuzz writes against live accounts.

Repeated reads may return different data without violating idempotence. Test
absence of unintended effects separately from output determinism. Derive no
latency claim without a measured sample, environment, and budget. No universal
runner size estimate or fixed five-second SLO has been established here.

## 6. Evidence to retain

For a change, record source SHA, commands/results, test environment, which
provider/channel paths were exercised, and remaining unknowns. Keep these
separate:

- source inspection;
- deterministic local checks;
- real-model behavior;
- live provider and deployed-service verification.

A new integration is ready only for the scope actually exercised. Registry
publishing, licensing, a separate plugin monorepo, and customer-supplied servers
remain deferred and are not part of this test plan's immediate implementation.
