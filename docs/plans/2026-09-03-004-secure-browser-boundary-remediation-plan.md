---
title: Secure Browser Boundary Remediation - Plan
type: remediation
date: 2026-09-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
review_target: edab75b8c202ff59bb039a792ac8439aa10f05ca
validated_instruction_branch: d95c69999cab7973baa9c17a47eda0ecd70b950b
execution: planning-only
---

# Secure Browser Boundary Remediation - Plan

## TDD Plan (Behavioral RED First)

Add and run all three behavioral tests before editing production source, manifests, migrations, or runtime instructions. Save command, SHA, test name, and failing assertion. A compile, fixture, or harness error is not an acceptable RED.

### 1. Secret extraction after opaque autofill

Modify `tests/agent/subagents/worker/tools/worker-browser-tools.test.ts` and add `worker-browser-semantic-boundary.test.ts`.

- Fill a fake owned browser with a sentinel vault secret.
- Attempt `inputValue()`, DOM `value`, body HTML, encoded values, snapshot/text/action value extraction, and clipboard extraction through the current model-facing tools.
- Prove the current surface accepts or returns the sentinel.
- Future assertion: no secret reaches model output, traces, logs, screenshots, or task history.

Use a fake Browser Loop execution result and Kernel recorder; preserve real worker-scope and owned-session checks.

### 2. Cross-origin frame autofill

Modify `agent/subagents/worker/lib/autofill/tests/vault-autofill.test.ts` and add `frame-authorization.test.ts`.

- Top page: `https://merchant.example/checkout`.
- Same-origin frame: `https://merchant.example/payment`.
- Cross-origin focused frame: `https://evil.example/capture`.
- Prove the current CDP path scans the cross-origin frame and invokes `Autofill.trigger`.
- Future assertions: same-origin works; cross-origin requires exact authorization; frame navigation invalidates it; opaque/extension/data/missing origins fail closed; login binding uses the authorized frame origin.

### 3. Consequential action without runtime approval

Modify worker browser contract tests and add `browser-approval-capability.test.ts`.

- Read-only snapshot/text/find/wait remains available without approval.
- Prove submit, place-order, send-message, destructive click, or Enter-submit currently reaches Kernel without runtime authority.
- A model-authored `approved: true` and page prompt injection are rejected.
- A server-issued capability bound to actor/workspace, root and worker sessions, browser, origin/frame, action class, material terms digest, expiry, and nonce permits exactly the approved action.
- Replay, expiry, wrong target/session, changed item/quantity/option, and increased total fail before Kernel. A lower total remains valid under the current product policy.

**Stop gate:** no production edit until all three REDs are observed and accepted by review.

## Regression Testing Plan

Unit coverage: origin normalization/frame filtering, login/frame binding, safe filled/empty projection, approval canonicalization/digest, expiry/replay/revocation/concurrency, action classification, and nested/encoded trace redaction.

Integration coverage: fake Kernel/CDP proves only authorized frame/session IDs receive autofill, blocked actions make zero mutation calls, capability consumption is atomic, ownership remains workspace-scoped, and no sentinel secret persists in trace/audit rows.

Add `tests/e2e/browser-security.spec.ts` with deterministic same- and cross-origin checkout frames, secret inputs, prompt injection, review, place-order, and send controls. Prove safe browsing needs no approval; vault values stay opaque; approval is requested once with material terms; changed terms re-prompt; denial parks the browser.

After automated tests, run the local real path with `agent-browser`: inspect interactive snapshots, console, errors, relevant network requests, and server logs. Retain Playwright traces/screenshots and a Kernel/CDP command log.

```bash
pnpm exec vitest run tests/agent/subagents/worker/tools/worker-browser-tools.test.ts tests/agent/subagents/worker/tools/worker-browser-semantic-boundary.test.ts tests/agent/subagents/worker/tools/browser-approval-capability.test.ts agent/subagents/worker/lib/autofill/tests/vault-autofill.test.ts agent/subagents/worker/lib/autofill/tests/frame-authorization.test.ts
pnpm test:unit
pnpm test:integration
pnpm test:e2e -- tests/e2e/browser-security.spec.ts
pnpm check
pnpm build
```

Preserve opaque handles, writable-profile requirements for login autofill, exact login-origin binding, focused-form classification, session ownership, timeout/ref bounds, screenshot masking, and temporary-image cleanup.

## Current Defects

- `agent/subagents/worker/tools/fill_from_vault.ts:80-103` securely materializes and injects claims, but the later browser surface is unchanged.
- `semantic_browser.ts:19-26`, `:50-88`, and `:97-109` expose arbitrary Playwright, constrain only timeout/shape, and forward returned values to the model.
- Screenshot masking protects pixels only; it does not protect DOM, accessibility values, Playwright results, clipboard data, or traces.
- `autofill/native.ts:145-181`, `:234-261`, and `:373-410` validates the top-level origin but scans flattened frames and can trigger autofill in the selected frame.
- Approval exists in `agent/instructions.md:20-21` as model guidance, while `computer_action.ts:92-190` and the semantic adapter execute without a server-side approval check.
- Trace compaction truncates but does not provide a confidentiality boundary before user-visible task history.

## Recommended Architecture

Create a two-plane boundary.

### Safe observation and preparation

Replace arbitrary model-authored Playwright/evaluate with a curated browser broker. Allow structural snapshots, visible non-sensitive text, find, bounded waits, navigation, scrolling, safe ref-based preparation, and opaque native vault fill. Return only allow-listed structure: origin/title, labels/roles, non-sensitive text, field presence/focus/required/filled state, and action status.

Do not expose arbitrary script results, raw HTML/objects, field values, clipboard, cookies/storage, stdout/stderr, or page-generated files. Trusted server-authored Playwright may remain behind concrete tools such as image capture; it is not a model programming surface.

### Capability-gated commit

Classify submit/purchase/message/destructive actions and submit-equivalent keys as consequential. Issue a durable opaque capability only after human approval of normalized material terms. Store a token hash and bind it to workspace/actor, root and worker sessions, browser, exact origin/frame identity, action class, terms digest, expiry, maximum uses, nonce, and revocation state. Validate and atomically consume it immediately before Kernel execution.

One capability covers the bounded approved transaction—including payment fill and final submit—so users are not prompted for every click. Reapproval occurs only when a material term changes or the total increases.

## Product and Usability Contract

- Routine reversible browsing, login setup checks, ordinary form preparation, review screens, and authentication challenges do not gain transaction prompts.
- The approval is human-facing and states merchant, item, quantity, selected option, and total—not internal tool names.
- A blocked frame/action leaves the browser available and explains the safe next step without exposing credentials.
- Uncertain consequential outcomes are reported as uncertain and are never automatically replayed.

The main usability cost is removal of arbitrary Playwright flexibility. Curated compound operations and structural results should preserve ordinary task speed while making confidentiality and approval enforceable.

## Implementation Units

### U0. RED-only harness

- **Files:** the three new suites and named existing suites.
- **Acceptance:** three intended failures recorded; no production change.

### U1. Secret-safe browser broker and trace projection

- **Files:** semantic browser adapter, a concrete worker browser safe-output module, computer/image tools as needed, trace timeline/telemetry, boundary tests, worker instructions.
- **Acceptance:** arbitrary model Playwright/evaluate and secret-capable result paths are absent; ordinary non-secret tasks still work; no sentinel persists anywhere model/user-visible.

### U2. Frame authorization

- **Files:** autofill native/provider/service, new frame-authorization owner, fill tool, CDP tests.
- **Acceptance:** exact same-origin default; explicit exact cross-origin authorization; origin/loader rechecked immediately before injection; navigation invalidates; unauthorized claims are not materialized.

### U3. Commit broker and approval validation

- **Files:** computer/semantic tools, new concrete commit tool, worker approval module, root/worker instructions, boundary tests.
- **Acceptance:** every consequential Kernel call requires a valid server-issued capability; model text/booleans, prompt injection, replay, expiry, and changed terms fail closed.

### U4. Durable approval state

- **Files:** additive approval-capability schema and generated migration, database service/tests, lifecycle cleanup.
- **Acceptance:** token hashes only; atomic consume/revoke; empty/legacy/restart/mixed-version migration fixtures pass; no secrets, DOM, code, or payment details are stored.

### U5. Human approval UX and full-story verification

- **Files:** reuse existing Eve approval transport and chat rendering seams; agent-loop diagram must be updated for agent-path changes.
- **Acceptance:** one clear action approves the bounded transaction; hidden details and tool names stay hidden; changed terms visibly require reapproval.

## Rollout, Observability, and Stop Conditions

Canary on safe test workspaces, enforce safe output and approval for all new browser sessions, and drain/revoke legacy unrestricted sessions. Compatibility flags must be validated in `src/env.ts`, narrowly scoped, and removed after migration; vulnerable execution must not remain enabled merely for telemetry.

Record action class, allow/block reason, normalized origin where permitted, capability digest prefix, correlation/session IDs, timing, approval latency, and retries. Never record vault claims, field values, DOM/HTML, clipboard, cookies/storage, arbitrary Playwright code, secrets, or tokenized query strings.

Stop if any sentinel leaks, unauthorized frame receives autofill, consequential action reaches Kernel without a valid capability, terms are not rebound immediately before commit, duplicate consumption is possible, the real Kernel smoke is unavailable, or only static/unit evidence exists.

## Dependencies, Residual Risk, and Rejected Alternatives

Before implementation, verify installed Eve approval/resume contracts from its local docs and test real Kernel OOPIF/same-process frame behavior. A remote site may render a secret as ordinary text, so opaque-fill mode may need stricter text projection. Human-approved actions can still be externally uncertain; profile persistence and 3-D Secure/CAPTCHA/passkey takeover remain separate concerns.

Reject prompt-only approval, secret-string regexes, screenshot-only masking, post-hoc arbitrary-output redaction, client-only approval, state-mutation metadata as authority, blanket cross-origin frame trust, and per-click prompting.
