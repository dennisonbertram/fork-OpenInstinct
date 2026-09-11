# Plan 013: Make unsupported browser controls truthful and recoverable

GitHub: [#162](https://github.com/dennisonbertram/fork-OpenInstinct/issues/162).

> **Executor instructions:** Preserve the conservative browser boundary. This
> plan does **not** authorize checkbox/radio clicks, generic selection controls,
> or a new approval action. A checked state alone does not prove an interaction
> is reversible: controls may autosubmit or mutate remote state. If the control
> is unsupported, report that fact and a real recovery path rather than telling
> the model to use an impossible commit action. Use a topic worktree and normal
> PR, wait for required CI/review, and merge only when required checks are green;
> paid/live/release actions need separate scope.

> **Drift check (run first):**
> `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/subagents/browser-agent agent/instructions tests/agent/subagents/browser-agent docs/agent-loop.html docs/JORY_AGENT_OPERATING_MODEL.md`
> STOP if Browser Loop’s currently installed semantic state differs from the
> tests or a proposed action cannot prove both effect classification and no
> autosubmit/remote mutation.

## Status

- **Priority:** P2
- **Effort:** M, approximately 1–2 engineering days
- **Risk:** MED
- **Depends on:** none; coordinate outcome wording with Plan 014
- **Category:** bug, DX, tests
- **Planned at:** commit `c88b8e6`, 2026-09-11

## Why this matters

Checkbox/radio controls are currently exposed as observed targets yet fail the
prompt-free reversible-role check. The old advice to use
`commit_browser_action` is not truthful because that tool only has submit,
order, send, and delete classifications. Misclassifying a control or opening a
generic click path would weaken the worker’s explicit approval boundary.

## Current state

- Action targets include `checkbox`, `radio`, and `switch`:
  `agent/subagents/browser-agent/lib/browser-action-targets.ts:4-52`.
- `interact_browser_element` permits only fill/select on text-like controls,
  tabs, and Escape; checkbox/radio fail at
  `agent/subagents/browser-agent/tools/interact_browser_element.ts:22-27,125-153`.
- `commit_browser_action` has only `submit`, `place_order`,
  `send_message`, and `delete` terms:
  `agent/subagents/browser-agent/tools/commit_browser_action.ts:44-71,113-137`.
- Raw model-facing click/key paths are blocked:
  `agent/subagents/browser-agent/tools/computer_action.ts:104-127` and
  `tests/agent/subagents/browser-agent/tools/worker-browser-semantic-boundary.test.ts:430-458`.
- Target tokens bind session/ref/frame/role/document generation:
  `agent/subagents/browser-agent/lib/browser-action-targets.ts:73-134`.

## Commands you will need

| Purpose          | Command                                                                                                                                                                                                                                                         | Expected result                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Boundary tests   | `pnpm exec vitest run tests/agent/subagents/browser-agent/tools/commit-browser-action.test.ts tests/agent/subagents/browser-agent/tools/worker-browser-semantic-boundary.test.ts tests/agent/subagents/browser-agent/tools/browser-approval-capability.test.ts` | exit 0                                                   |
| Full static gate | `pnpm check && pnpm build && git diff --check`                                                                                                                                                                                                                  | exit 0                                                   |
| Browser evidence | targeted local synthetic/browser fixture only                                                                                                                                                                                                                   | no production browser, login, purchase, or provider send |

## Scope

**In scope**

- Browser-action target descriptors, interaction error/result wording, worker
  instructions, direct boundary tests, and later diagram/canonical-doc wording.
- A documented structural classification table that says what is currently
  allowed, approval-gated, or unsupported.

**Out of scope**

- Any generic click/keypress API, coordinate action, switch/slider/tree/menu
  enablement, pretending a selection is a submit, changing approval policy, or
  live-site/credential testing.

## Steps

### 1. Capture the current RED honestly

Create a synthetic observed checkbox and radio target. Assert the current
interaction rejects it and that commit input cannot truthfully encode it. The
expected product-facing recovery is “this control is unsupported; preserve the
browser and request a user takeover or choose another supported route,” not
“use commit_browser_action.”

**Verify:** focused test fails only after the new desired error/result assertion
is added; existing raw-click denials remain green.

### 2. Implement truthful unsupported classification

Return a bounded `unsupported_control` outcome that includes the observed
control class, no page-derived sensitive text, no claim that the desired state
changed, and the actual recovery disposition. Update worker instruction wording
so it never tells the root to invoke a commit action that has no matching terms.
Keep target token/origin/frame/ownership checks and all existing allowed
controls unchanged.

**Verify:** the synthetic checkbox/radio test turns green; button/link/menu
and raw-coordinate denial tests still pass.

### 3. Gate any future broadened affordance separately

Do not implement `set_checked` or radio selection in this PR. A later,
separately reviewed proposal must first prove in the installed Browser Loop
contract that it observes a fresh target-bound state _and_ that the exact
control cannot autosubmit, navigate, or mutate remote state without a matching
approval/action classification. If it cannot prove that, preserve this plan’s
unsupported result.

**Verify:** `rg -n "set_checked|select_radio|generic click" agent/subagents/browser-agent`
returns no new implementation.

## Test plan and done criteria

- Positive: existing combobox/listbox/tab actions still use the prompt-free
  path.
- Negative: checkbox/radio, generic button/link/menu, coordinate click, and
  keyboard click remain blocked.
- Failure/recovery: unsupported outcome carries no false “committed” result and exposes only an
  already-permitted non-secret takeover/alternative path; it does not broaden
  vault setup or human-takeover policy.
- Replay: a stale target fails before browser execution; no repeated action is
  introduced.
- [ ] Recorded RED and focused tests are green.
- [ ] `pnpm check` and `git diff --check` pass.
- [ ] No browser interaction is claimed as proof beyond synthetic tests.

## STOP, rollback, and maintenance

STOP if an error/result change requires a delivery or completion-state change,
or if tests reveal that control classification is unavailable without parsing
unbounded page content. Revert only this messaging/classification PR; do not
relax browser execution. Any future new action requires its own plan, approval
truthfulness review, and explicit autosubmit/side-effect proof.

## Independently executable prompt

“Implement Plan 013 only. First capture the real synthetic unsupported-control
RED journey, then make the error/recovery truthful without adding a control
action. Preserve origin/frame/ownership/vault and approval boundaries, run every
named test plus check/build, then use normal worktree/PR/CI delivery. No live
browser, credential, provider, or deployment action is authorized.”

## Required Square gate

If implementation changes agent/instructions, pnpm eval:square is required
before handoff. Record its Results line; an unavailable paid budget blocks that
source PR and does not waive or complete this gate.
