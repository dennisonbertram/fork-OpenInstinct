---
title: Repository Guardrails Remediation - Plan
type: remediation
date: 2026-09-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
review_target: edab75b8c202ff59bb039a792ac8439aa10f05ca
execution: planning-only
---

# Repository Guardrails Remediation - Plan

## TDD Plan (Behavioral RED First)

Add a repository-contract test before restoring documentation or changing workflow YAML. Run it and record a RED showing the current failure at the intended assertions.

Proposed test owner: `tests/unit/repository-contract.test.ts`.

Required scenarios:

1. `AGENTS.md` contains the fork-only target, relevant documentation-first rule, test-tier/validation gates, secret and tenant boundaries, architecture-diagram maintenance rule, and the `Square evals: on demand` section.
2. Every local Markdown path named by `AGENTS.md`, `.github/workflows/square-evals.yml`, and the Square runbooks exists in the committed tree.
3. The Square trigger list names the source areas that can alter Square behavior and the required pre-PR command/evidence.
4. The credential-presence shell check reads `AI_GATEWAY_API_KEY` from the step environment; the GitHub expression is not embedded inside shell source.
5. The workflow remains explicitly on demand unless a separate product decision changes its cost/gating policy.

**Stop gate:** do not modify `AGENTS.md`, workflow files, or runbooks until scenarios 1, 2, and 4 fail for their intended contract violations. Do not accept a parser/setup failure as RED.

## Regression Testing Plan

- Run the new contract test alone, then `pnpm test:unit`.
- Run `actionlint .github/workflows/checks.yml .github/workflows/square-evals.yml`.
- Run `pnpm check` and `pnpm build`.
- Inspect the rendered Markdown links and confirm all relative targets resolve from a clean checkout.
- Trigger the Square workflow on the implementation branch only if workflow behavior changes; verify the missing-secret failure is clear and a credentialed run reaches the eval command without printing the credential.
- Record that Square remains an on-demand, model-backed evaluation; ordinary PR CI does not prove Square reply quality.

## Problem and Impact

At the review target, `AGENTS.md` contains only the feedback-log pointer. PR #40 removed the larger repository engineering contract: fork targeting, architecture ownership, test tiers, validation gates, secret/tenant rules, and diagram maintenance. PR #41 committed the formerly missing feedback document, so that particular link is no longer dangling, but it did not restore the removed contract.

The Square workflow and two runbooks also state that `AGENTS.md` owns the trigger list, while no such section exists. This is a process regression: it can make future changes less safe or cause an intended evaluation to be skipped. It is not evidence that runtime authentication, tenancy code, or product approvals were removed.

## Recommended Remediation

1. Restore the previous repository contract from the parent of PR #40.
2. Preserve the new feedback-log and attachment guidance rather than reverting it.
3. Add a concise `Square evals: on demand` section naming when to run `pnpm eval:square` or the GitHub workflow and what result belongs in the PR.
4. Pass `AI_GATEWAY_API_KEY` into the credential-check step through `env`, then check the ordinary shell variable.
5. Add the repository-contract test so a future wholesale deletion or dangling cross-reference is a normal CI failure.

## Product and Usability Effect

There is no intended user-facing behavior change. Developers and coding agents regain explicit boundaries; Square-related PRs gain a clear, selective evaluation step. Keeping the evaluation on demand avoids imposing its model cost and runtime on unrelated changes.

## Implementation Units

### U1. Contract RED

- **Files:** `tests/unit/repository-contract.test.ts`.
- **Acceptance:** the test fails on missing contract headings and unsafe workflow secret interpolation at the review target.

### U2. Restore and merge the handbook

- **Files:** `AGENTS.md`.
- **Acceptance:** prior safety/architecture content and current feedback guidance coexist; fork and validation rules are unambiguous; Square triggers are present.

### U3. Harden workflow secret handling

- **Files:** `.github/workflows/square-evals.yml`.
- **Acceptance:** shell source contains no direct secret expression; missing-secret behavior remains explicit; the secret is not logged.

### U4. Cross-reference and clean-checkout proof

- **Files:** only runbooks whose wording must match the restored heading.
- **Acceptance:** all referenced files/headings exist in the committed tree, actionlint passes, and the contract test is GREEN.

## Stop Conditions and Residual Risk

Stop if restoring the previous file conflicts with a newer explicit repository policy; resolve the policy rather than choosing silently. The contract test should assert durable headings and safety clauses, not the entire file byte-for-byte, so legitimate documentation edits remain easy.
