# Plan 004: Prove and consume an authenticated background-task terminal result

GitHub: [#154](https://github.com/dennisonbertram/fork-OpenInstinct/issues/154).

> **Executor instructions:** Start with the public Eve API probe. Do not implement root completion state, parse a `Background task` message, or derive authority from `meta.id` before this plan passes. If the probe fails, draft and test the bounded version-matched patch described below; normal maintainer review is required before merge. Stop if neither route can provide the typed contract.
>
> **Drift check (run first):** `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/lib/background-task-terminal.ts agent/agent.ts agent/subagents/browser-agent/agent.ts src/lib/worker-completion.ts src/lib/worker-events.ts tests/unit/background-task-terminal-adapter.test.ts tests/unit/eve-patch-boundary.test.ts patches/eve@0.49.0.patch pnpm-workspace.yaml pnpm-lock.yaml docs/EVE_PATCHES.md`

## Status

- **Priority:** P1
- **Effort:** M public API path; L only if a narrow registered Eve patch is needed
- **Risk:** HIGH
- **Depends on:** none (read Plan 003 for vocabulary; the adapter probe is independently executable)
- **Category:** tech-debt
- **Planned at:** `c88b8e69325439d503374bf6796befd5f37a585f`, 2026-09-11

## Why this matters

The root needs a typed, authenticated terminal result before it can register a durable reporting obligation. Current UI projection code parses human-readable worker notifications, but that text can also appear in conversation history and cannot safely establish task completion. A public framework seam may already expose what is needed; this plan proves that before adding an adapter.

## Current state

- `agent/agent.ts:17-21` enables `experimental.tasks`.
- `agent/subagents/browser-agent/agent.ts:10-29` declares the browser worker and its structured output; `src/lib/worker-completion.ts:4-35` validates its completion shape.
- `src/lib/worker-events.ts:181-210` parses `Background task … Result:` for a UI projection. It is not lifecycle authority and is explicitly out of scope for reuse.
- `node_modules/eve/docs/subagents/index.mdx:170-172` exposes parent `subagent.called`/`subagent.completed` control events, while detailed child activity belongs to the child stream.
- `node_modules/eve/docs/guides/hooks.md:29-30` states hooks are observe-only and cannot inject model context. The channel handler runs before hooks and dynamic resolution, so a hook cannot be used to force a completion summary.
- `node_modules/eve/docs/concepts/sessions-runs-and-streaming.md:131-147` makes event IDs safe for stream ingestion but explicitly not retry/semantic idempotency authority.

The installed runtime’s private `dist/src/tasks/delivery-context.js:1-20` shows that it already has a task index with `taskId`, `createdByTurnId`, terminal status, and terminal output. Private implementation is evidence for the probe, not an application API.

## Commands and environment

| Purpose                     | Command                                                                | Expected result                                        |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| inspect public contract     | `sed -n '160,190p' node_modules/eve/docs/subagents/index.mdx`          | parent/child stream contract visible                   |
| focused deterministic probe | `pnpm test:app -- tests/unit/background-task-terminal-adapter.test.ts` | RED before adapter; green only after typed data exists |
| contract gate               | `pnpm eval:contract -- --mount-only --timeout 30000`                   | exit 0 after integration                               |
| final repository checks     | `pnpm check && pnpm build && git diff --check`                         | all exit 0                                             |

Do not run a browser benchmark, live message, provider send, or migration. Dependency installation is permitted only for the isolated patch probe and clean-install verification described below. Changing `agent/agent.ts` triggers `pnpm eval:square`; retain its `Results:` line. If its approved budget is unavailable, the affected source PR remains blocked rather than bypassing the gate.

## Scope

**In scope:** `agent/lib/background-task-terminal.ts`; `agent/agent.ts` (the root `defineDynamic` registration boundary); `tests/unit/background-task-terminal-adapter.test.ts`; and a fixture local to that test; and, only when the public probe fails, `patches/eve@0.49.0.patch`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `docs/EVE_PATCHES.md`, and `tests/unit/eve-patch-boundary.test.ts`. The conditional patch may expose only a typed read-only task-terminal projection from Eve’s existing task index through its public context export.

The current patch register is `docs/EVE_PATCHES.md:1-57`; `pnpm-workspace.yaml` registers `eve@0.49.0: patches/eve@0.49.0.patch`; and `tests/unit/eve-patch-boundary.test.ts:6-62` forbids unregistered hunk growth. Add the new hunk, path, proof, removal gate, and owner there before regenerating the package patch. The upstream repository remains read-only: record release tracking only, never propose an upstream push.

**Out of scope:** `src/lib/worker-events.ts`, UI trace parsing, channel delivery, `defineState` obligation storage, all instructions, scheduled reporting, changes to worker tools, any generic event store, or a direct dependency on Eve private `dist/` files.

## Steps

### 1. Characterize the supported terminal boundary before source edits

Create a synthetic declared worker whose structured result is fixed, contains no page/secret data, and is dispatched in the background. Register the proposed adapter only through `agent/agent.ts` at the existing root `defineDynamic` lifecycle boundary; do not add an `agent/hooks` subscriber or a stream-text parser. Capture only event names and typed public fields from the parent and child test surfaces. Run the test first with an assertion that the root can receive a terminal record containing: task ID, parent turn ID, child session ID, stable worker call or task identity, terminal status, and typed output.

**RED oracle:** current public surface lacks one or more required fields, or the only candidate is a rendered `Background task` string. Record which field is absent; do not change production code yet.

### 2. Decide the adapter route

If the probe exposes a supported terminal event/accessor with all required fields at that root registration boundary, create a thin application adapter that validates it and rejects mismatched identity. If not, draft and test the smallest registered Eve `0.49.0` patch that exports a read-only typed terminal projection from the existing task index to the root integration point. The patch must carry task ID, parent turn, child session, terminal status, and structured output; it must not publish raw child stream history or modify task delivery prompts.

**STOP:** no compatible local Eve source, any required data is only formatted text, no stable identity exists, the patch changes retry semantics, or the change would become a generic task API. Report the probe output and proposed upstream boundary.

### 3. Make identity and replay tests executable

Add focused cases for one successful terminal result, one terminal failure, a user message that exactly resembles the old background notification, a duplicate stream ingestion of the same event, and an interrupted-step retry whose event ID changes while logical coordinates repeat. The test must prove the adapter trusts the typed terminal only and yields one semantic terminal record per actual task identity.

**Verify:** `pnpm test:app -- tests/unit/background-task-terminal-adapter.test.ts` passes; the notification-shaped user text produces zero terminal records.

## Test plan

| ID    | Setup                                | Expected result                                        |
| ----- | ------------------------------------ | ------------------------------------------------------ |
| TA-01 | background worker fixed success      | one typed terminal with complete identity/output       |
| TA-02 | fixed failure/cancelled result       | typed terminal status; no fabricated success           |
| TA-03 | user text imitates notification      | no terminal record                                     |
| TA-04 | same event re-read                   | idempotent ingestion only                              |
| TA-05 | interrupted-step retry/new `meta.id` | semantic identity prevents a duplicate terminal effect |
| TA-06 | child session mismatch               | reject/ignore terminal record                          |

Follow `tests/agent/subagents/browser-agent/tools/*contract*.test.ts` mocking conventions; mock at imported boundaries, never add production reset hooks.

## Done criteria

- [ ] A supported typed terminal record or narrowly reviewed Eve adapter exists.
- [ ] The record carries root parent, worker/task, child session, status, and typed output identity.
- [ ] No implementation reads `src/lib/worker-events.ts` text or relies on `meta.id` alone for semantic once-only behavior.
- [ ] TA-01 through TA-06 pass; `pnpm check`, `pnpm build`, `pnpm eval:contract`, `pnpm eval:square` (because `agent/agent.ts` is in scope), and `git diff --check` pass.

## Maintenance notes

Plan 005 is the only consumer that may persist this terminal projection into a root completion envelope. Keep the adapter small and version-local; framework upgrades must rerun TA-01 through TA-05 before retaining compatibility claims.

## Executor prompt

Work only on the typed terminal adapter described here. Read the installed Eve subagent, state, streaming, and hooks docs before relying on a framework API. Begin with TA-01 through TA-05 as a synthetic probe and retain the raw RED result. Do not parse UI notification text, use event IDs as semantic identity, expose child history, send externally, or expand an Eve patch beyond the read-only terminal projection. When the public probe is RED, use the conditional patch workflow within its boundary; stop only if neither the public API nor that bounded patch can provide the required typed contract.

## Conditional patch workflow

If and only if the public probe is RED, first preserve the existing `patches/eve@0.49.0.patch` contract: run an isolated unpatched Eve copy/probe to establish the added-hunk RED without changing the workspace mapping, then run `pnpm patch eve@0.49.0` with the registered patch applied. Inspect the extracted tree and regenerated combined diff to confirm every existing hunk remains before adding only the equivalents of `dist/src/tasks/delivery-context.js`, `dist/src/public/context/index.js`, and `dist/src/public/context/index.d.ts` required for the read-only projection. Save the combined diff back to `patches/eve@0.49.0.patch`; do not use `--ignore-existing`.

Update the explicit hunk list/assertions in `tests/unit/eve-patch-boundary.test.ts`, the register and removal gate in `docs/EVE_PATCHES.md`, and the patch reference/hash produced in `pnpm-workspace.yaml`/`pnpm-lock.yaml`. A clean install is permitted only to verify the patch applies and the existing plus new boundary tests pass. Draft/test this bounded patch, then use normal maintainer review before merge. Never patch `node_modules` in place, widen a channel route, modify the runtime’s cohort instruction, or propose an upstream write from this fork.
