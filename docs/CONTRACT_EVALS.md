# Fork contract evals: pin the behavior upstream does not know about

This document is the plan for a set of evals that fail when an upstream merge
breaks a behavior only this fork cares about. It exists because the
2026-09-03 sync (PR #52) changed three such behaviors and no test went red:
upstream disabled the two built-in tools that Square depends on, moved the
iMessage reply into the `send_message` tool, and changed timestamp columns to
a native type. Each was found by a person reading logs, not by a gate.

Labels follow [`README.md`](README.md). **Verified** facts were read in the
repository on 2026-09-04. **Proposed** parts do not exist yet.

Related: [`PLUGIN_TESTING.md`](PLUGIN_TESTING.md) (layer 3 is the plugin
mount contract), [`SQUARE.md`](SQUARE.md) (the paid Square gym).

---

## 1. What exists today (Verified)

| Surface                                       | What runs                                                                                                               | Model calls                                                                  | When                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| Unit and integration tests, `pnpm check`      | 126 files, 964 tests, PGlite                                                                                            | none                                                                         | every PR (`checks.yml`)                                 |
| Playwright e2e                                | browser journeys with the phone-auth bypass                                                                             | none                                                                         | every PR                                                |
| Upstream agent evals, `evals/agent/*.eval.ts` | 8 files: routing, safety, memory, personal info, schedules, scheduled lifecycle, browser-agent delegation, conversation | real model, `AI_GATEWAY_API_KEY` required (`scripts/run-agent-evals.ts:152`) | never in CI                                             |
| Square gym, `evals/square/`                   | 12 cases against a fake Square server                                                                                   | real model plus a judge                                                      | on demand, `square-evals.yml`, `workflow_dispatch` only |

Nothing in the repository uses `mockModel` from `eve/evals`. Every eval calls
a real model. No eval runs on a pull request.

The model is chosen per step in `agent/agent.ts` by a `defineDynamic`
resolver that reads the workspace's gateway model from settings. The eval
runner authenticates through the local-dev branch of the eve channel as one
fixed principal, `better-auth:browser-benchmark`
(`agent/channels/eve.ts:45`).

Existing deterministic coverage per contract area:

- **iMessage delivery**: `tests/agent/channels/linq-message-delivery.test.ts`
  proves one `send_message` call is one bubble with its images, link
  previews, Tapback removal, approval rendering as exact plain-text replies,
  idempotency on retry, and proactive sends. `linq-inbound-auth.test.ts`
  proves unverified senders are dropped. `tests/unit/linq-channel-scope.test.ts`
  proves a duplicate inbound message starts no second turn.
- **Workspace scope**: `tests/integration/scope-enforcement.test.ts`,
  `workspace-tenancy.test.ts`, `tests/agent/channels/eve-channel-auth.test.ts`,
  `tests/agent/hooks/session-owner.test.ts`, `agent/lib/tests/principal-scope.test.ts`.
- **Square**: `agent/lib/square/tests/{auth,operations}.test.ts` (the
  read-only allow-list of 145 operations), `evals/square/tests/*` (the gym's
  own helpers).
- **Root tool surface**: `tests/unit/agent-tool-boundaries.test.ts` pins the
  exact root tool files and which are disabled, and since PR #52 records that
  `load_skill` and `connection_search` stay enabled.

What these do not prove: that the agent, as wired, reaches the Square
connection through `connection_search`, loads the skill through `load_skill`,
answers through `send_message`, and does all of that as one authenticated
workspace caller. Each unit test mocks the neighbor it depends on. Only a
session through the real agent proves the wiring, and today every such
session costs a model call.

---

## 2. The design (Proposed)

### 2.1 Two tiers

| Tier | Name                                                       | Model                | Cost | Gate                                                                    |
| ---- | ---------------------------------------------------------- | -------------------- | ---- | ----------------------------------------------------------------------- |
| 1    | Contract evals, `evals/contract/*.eval.ts`, tag `contract` | scripted `mockModel` | none | every PR, including every upstream sync PR                              |
| 2    | Behavior gyms, `evals/square/` and `evals/agent/`          | real model           | paid | on demand, before a release, and on every sync PR that touches `agent/` |

Tier 1 proves wiring. Tier 2 proves judgment. A sync PR needs tier 1 green
to merge and tier 2 pasted in the body when `agent/` changed.

### 2.2 The scripted model

`mockModel` must be the agent's `model`, so the fixture is a branch in the
existing resolver in `agent/agent.ts`, not a second agent:

```ts
// agent/agent.ts, inside the "step.started" resolver, before getGatewayModel
if (contractFixtureEnabled()) return contractFixtureModel;
```

`contractFixtureEnabled()` returns true only when `EVAL_CONTRACT_FIXTURE=1`
and the environment is local development, the same guard shape as the
phone-auth bypass in `src/env.ts`. Production never sees the fixture.

`contractFixtureModel` lives in `evals/contract/fixture-model.ts` and is a
`mockModel` callback keyed on the user message. The eval prompt is a small
command language, so one script serves every contract eval:

```
call <tool> <json>            call the tool with that input, then send the
                              result through send_message
call <tool> <json> ; react heart
load <skill>                  call load_skill with that skill name
say <text>                    send_message with exactly that text
say <text> | <text>           two send_message calls, two bubbles
```

The callback reads `lastUserMessage`, and on the first step returns
`{ toolCalls: [...] }`; when `toolResults` is non-empty it returns the
`send_message` call with the result serialized, then the text
`DELIVERY_COMPLETE`. That is the exact protocol the real instructions
require (`agent/instructions/content/role/interactive.md:57`), so the
channel code sees the same shape it sees in production.

### 2.3 Where the evals run

`pnpm eval:contract` is a new script that runs
`eve eval contract --strict --tag contract` with `EVAL_CONTRACT_FIXTURE=1`,
`WORKSPACE_SCOPE_ENFORCEMENT=enforce`, and a Compose Postgres, the same boot
`scripts/run-agent-evals.ts` uses. The fake Square server from
`evals/square/fake/` starts first, the way `scripts/eval-square.ts` starts
it. No `AI_GATEWAY_API_KEY`.

`checks.yml` gets one more job, `contract-evals`, after `checks` passes.
Budget: under 3 minutes. The judge in `evals/evals.config.ts` is unused by
tier 1; no `t.judge` call is allowed in a `contract` eval.

### 2.4 Rules for a contract eval

1. One eval proves one sentence from the contract table below. The eval
   `description` is that sentence.
2. Every assertion is a gate: `t.succeeded()`, `t.calledTool`,
   `t.notCalledTool`, `t.loadedSkill`, `t.check(..., includes(...))`,
   `t.eventsSatisfy`. No soft assertions, no judge.
3. The delivered text is read with `requireDeliveredText` from
   `evals/agent/shared.ts`, never from `t.reply`.
4. An eval that needs a second principal is out of reach today (section 4)
   and stays an integration test.

---

## 3. The contracts (Proposed)

Each row is one eval. The "Broke on" column names the 2026-09-03 finding
that motivates it, when there is one.

### 3.1 iMessage delivery

| Id                      | Contract sentence                                                                         | Drive                                             | Assert                                                                                                                     | Broke on              |
| ----------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| delivery-one-bubble     | A reply is delivered through `send_message`; the final assistant text is only the marker. | `say hi there`                                    | `calledTool("send_message", { count: 1 })`; `requireDeliveredText` equals "hi there"; `t.reply` equals `DELIVERY_COMPLETE` | gym graded the marker |
| delivery-two-bubbles    | Two `send_message` calls are two bubbles in order.                                        | `say first \| second`                             | `calledTool("send_message", { count: 2 })`; delivered text joins in order                                                  | splitter retired      |
| delivery-reaction       | A Tapback is a complete reply with no text.                                               | `say  ; react heart` (empty say)                  | `calledTool("react_to_message", { input: { operation: "add", type: "heart" } })`; `notCalledTool("send_message")`          | thanks case           |
| delivery-approval-words | A pending tool approval tells the user to reply exactly `approve` or `cancel`.            | `call gmail-send {...}` on an approval-gated tool | `eventsSatisfy`: the `input.requested` event's rendered text contains `Reply exactly "approve" or "cancel"`                | PR #51 re-port        |
| delivery-image-url      | An image result is delivered as an attachment, not as base64 text.                        | `call <tool that returns an image artifact>`      | delivered text has no `data:` prefix; the send_message input carries a file                                                | plugin rule           |
| delivery-no-markdown    | Delivered text has no Markdown headings, bullets, or bold.                                | `call square__ListCustomers {}`                   | `assertPlainTextDelivery`                                                                                                  | upstream #113         |

The Linq webhook path itself, inbound signature, duplicate claim, and
unverified senders stay in the channel unit tests. The eval target is the
eve channel; it cannot post a Linq webhook.

### 3.2 Workspace scope

| Id                           | Contract sentence                                                                                                        | Drive                                                           | Assert                                                                                        | Broke on                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------- |
| scope-caller-present         | Every tool call in a session carries the authenticated caller's workspace.                                               | `call square__ListLocations {}`                                 | `eventsSatisfy`: the connection auth resolver ran with `principalType: "user"`; `succeeded()` |                            |
| scope-connection-needs-user  | A connection with `principalType: "user"` fails closed with `principal_required` when no user principal exists.          | integration test, not an eval (needs a scheduled-run principal) | `tests/integration/scope-enforcement.test.ts` gains the case                                  |                            |
| scope-enforce-on             | The contract suite runs with `WORKSPACE_SCOPE_ENFORCEMENT=enforce` and the bootstrap membership admits the fixed caller. | any eval                                                        | the runner sets the flag; `session-owner` records the scope                                   | flag was off in every eval |
| scope-cross-workspace-denied | A caller cannot read another workspace's rows.                                                                           | integration test (two principals)                               | already `scope-enforcement.test.ts`; keep                                                     |                            |

Limit: the eval runner authenticates one fixed principal. Two-principal
contracts stay in integration tests until the local-dev channel auth accepts
a principal header for evals (section 4).

### 3.3 Square

| Id                                | Contract sentence                                                             | Drive                                       | Assert                                                                                                 | Broke on      |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- |
| square-skill-loads                | `load_skill` is enabled at the root and loads the `square` skill.             | `load square`                               | `loadedSkill("square")`                                                                                | PR #106 stubs |
| square-connection-found           | `connection_search` is enabled at the root and returns the Square connection. | `call connection_search {"query":"square"}` | `calledTool("connection_search")`; delivered text contains `square`                                    | PR #106 stubs |
| square-read-tool-works            | A Square read tool reaches the fake server as the caller and returns rows.    | `call square__ListCustomers {}`             | `calledTool("square__ListCustomers", { status: "completed" })`; delivered text contains a fixture name |               |
| square-write-tool-absent          | No Square write tool is exposed.                                              | `call square__CreateCustomer {}`            | `calledTool("square__CreateCustomer", { status: "failed" })` or the call is rejected as unknown        | allow-list    |
| square-skill-not-loaded-off-topic | The skill is not loaded for a non-Square ask.                                 | tier 2 only (model judgment)                | Square gym case                                                                                        |               |

### 3.4 Plugin mounts

These are layer 3 of [`PLUGIN_TESTING.md`](PLUGIN_TESTING.md). They live in
the plugin repository's harness host, not here, but the fork's own suite
carries one smoke so the mount mechanism itself is covered:

| Id                    | Contract sentence                                             | Drive                                                                                                       | Assert                                                                                   |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| mount-demo-tool       | A mounted extension's tool is callable as `<mount>__<tool>`.  | `call demo__ping {"name":"x"}` with `agent/extensions/demo.ts` mounted only under `EVAL_CONTRACT_FIXTURE=1` | `calledTool("demo__ping", { output: /pong x/ })`                                         |
| mount-demo-connection | A mounted MCP connection's tool is discoverable and callable. | `call demo__echo {"text":"x"}` against a local stateless server started by the runner                       | `calledTool("demo__echo", { status: "completed" })`; `structuredContent.text` equals "x" |

The demo extension is the one from `PLUGINS.md` section 5, checked in under
`evals/contract/fixtures/demo-extension/` and mounted through a dynamic
extension file so production builds never include it.

### 3.5 Root tool surface

Already a unit test (`tests/unit/agent-tool-boundaries.test.ts`). Add one
assertion: the set of built-in tools the root may disable is exactly
`agent.ts`, `bash.ts`, `read_file.ts`, `todo.ts`, `write_file.ts`, and any new
stub from upstream fails the test until a person decides.

---

## 4. Known gaps and the order to close them (Proposed)

1. **Single fixed principal in evals.** The local-dev eve channel auth
   returns one caller. Add an eval-only header, honored under
   `EVAL_CONTRACT_FIXTURE=1`, that selects a second seeded user. Until then,
   two-principal contracts stay integration tests.
2. **`mockModel` inside a `defineDynamic` resolver.** The eve docs show
   `mockModel` as a static `model:` value. Returning it from the
   `step.started` resolver is undocumented. Verify it with the first eval;
   if it fails, the fallback is a second agent directory
   (`agents/contract/agent/`), which eve 0.51 supports and eve 0.49 does not.
3. **Approval-gated evals.** `delivery-approval-words` needs an
   approval-gated tool and the `input.requested` event. Check that the eval
   runner surfaces that event through `t.events` before writing the eval.
4. **MCP fixture server in CI.** `mount-demo-connection` needs the demo server
   from `PLUGIN_TESTING.md` section 1 started by the runner. Reuse the
   fake-Square start pattern.

---

## 5. Build order (Proposed)

1. Fixture model and the `agent.ts` branch. Prove `delivery-one-bubble`
   green and prove it red by making the script skip `send_message`.
2. `pnpm eval:contract` runner and the CI job. Budget check.
3. Square rows (3.3). Then revert the two root stubs locally and watch
   `square-skill-loads` and `square-connection-found` go red. That is the
   proof the suite catches the PR #106 case.
4. Delivery rows (3.1).
5. Scope rows that need no second principal (3.2).
6. Mount rows (3.4) with the demo extension.
7. Gap 1, then move the two-principal contracts into evals.

Definition of done for the suite: every row above is green or explicitly
listed under section 4, `pnpm eval:contract` runs on every PR under 3
minutes with no model key, and the sync procedure in
[`AGENTS.md`](../AGENTS.md) names it as a required gate.

---

## 6. What was verified and what was not

| Item                                                                        | State                                                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Tables in section 1                                                         | Verified in the repository on 2026-09-04                               |
| `mockModel` callback shape, `t.calledTool` matchers, `requireDeliveredText` | Verified in `node_modules/eve/docs/evals/` and `evals/agent/shared.ts` |
| The three 2026-09-03 findings                                               | Verified in PR #52 and its gym runs                                    |
| Fixture model through `defineDynamic`                                       | Not verified (gap 2)                                                   |
| Eval access to `input.requested` events                                     | Not verified (gap 3)                                                   |
| Everything under section 2, 3, 5                                            | Proposed, nothing built                                                |
