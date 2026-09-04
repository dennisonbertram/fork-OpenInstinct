---
title: Architecture Review Remediation Program - Plan
type: remediation
date: 2026-09-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
review_target: edab75b8c202ff59bb039a792ac8439aa10f05ca
execution: planning-only
---

# Architecture Review Remediation Program - Plan

## TDD Plan (Behavioral RED First)

No production source may be edited for a slice until that slice's named behavioral test has been added, run, and recorded failing for the intended reason. A compile failure, missing fixture, or unrelated test failure is not an acceptable RED.

1. **Phase 0 — repository guardrails:** prove that the repository contract and Square eval trigger list can disappear while the current checks remain green.
2. **Phase 1 — secure browser boundary:** prove model-readable secret extraction, cross-origin frame fill, and execution of an unapproved consequential action through the real worker tool boundary.
3. **Phase 2 — tenancy enforcement:** prove that a request which lacks valid membership, lifecycle, budget, or channel/workspace binding is admitted when enforcement configuration is absent.
4. **Phase 3A — idempotency:** prove that a crash between reservation and finalization permanently poisons a key.
5. **Phase 3B — webhook safety and delivery:** prove DNS-resolved private targets are accepted, and prove a slow HTTP request holds the delivery database claim open.
6. **Phase 3C — vault bulk behavior:** prove retry duplication or partial import and the per-item secret-presence query fan-out.

Each linked workstream plan owns exact test files, fixtures, assertions, and its RED evidence. Implementation begins one slice at a time only after review of that evidence.

## Regression Testing Plan

Every slice must pass its narrow test first, then the affected tier, then the repository gates. Later phases also rerun the completed earlier phase suites.

| Gate        | Required proof                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Narrow      | Named RED becomes GREEN without weakening the assertion                                                      |
| Unit        | `pnpm test:unit`                                                                                             |
| Integration | `pnpm test:integration` for database, request admission, webhook, idempotency, and vault service changes     |
| Browser     | `pnpm test:e2e` plus a realistic worker smoke for browser-boundary changes                                   |
| Static      | `pnpm check` and `pnpm build`                                                                                |
| Migration   | Upgrade from the previous schema, rerun idempotently, and exercise interrupted/restarted work                |
| CI          | Required jobs green at the exact implementation SHA; artifacts retained for browser/eval suites              |
| Rollout     | Configuration, metrics, rollback criteria, and operator evidence recorded separately from local test success |

Regression proof must include the exact SHA, commands, pass counts, skipped tests, environment/configuration, and any provider or browser limitations. Local success is not deployment proof.

## Goal and Scope

Remediate the architecture review without bundling unrelated product work or making ordinary tasks harder. The program covers four bounded plans:

- [Repository Guardrails Remediation](2026-09-03-003-repository-guardrails-remediation-plan.md)
- [Secure Browser Boundary Remediation](2026-09-03-004-secure-browser-boundary-remediation-plan.md)
- [Tenancy Enforcement Remediation](2026-09-03-005-tenancy-enforcement-remediation-plan.md)
- [Data and Delivery Reliability Remediation](2026-09-03-006-data-delivery-reliability-remediation-plan.md)

This plan does not authorize source implementation, deployment, configuration changes, data migrations, or enabling flags.

## Architecture Sequence

```text
Phase 0: restore engineering guardrails
    |
    +--> Phase 1: secure browser execution boundary
    |
    +--> Phase 2: tenancy admission rollout
    |
    +--> Phase 3A: idempotency leases
         Phase 3B: webhook claim/send/finalize + DNS pinning
         Phase 3C: atomic/idempotent vault bulk operations
```

Phase 0 is first because the remaining work relies on the missing repository validation contract. Phases 1 and 2 have the highest security/isolation value. The Phase 3 slices may proceed independently after their individual schema and rollback reviews; they must not be collapsed into one migration.

## Product and Usability Contract

- Routine, reversible browsing remains autonomous.
- One explicit approval covers one already-described consequential action; implementation must not introduce approval for every click or a second payment confirmation.
- Tenant enforcement must not silently create access. A staged audit and backfill identifies legitimate users before fail-closed enforcement.
- Retried API calls and imports become predictable rather than duplicating or remaining blocked forever.
- Webhook hardening may reject unsafe or ambiguous destinations, but valid public HTTPS endpoints retain the same registration and delivery contract.
- Errors must say what the user or operator can safely do next without exposing secrets, resolved IPs tied to private infrastructure, or tenant data.

## Program Acceptance Criteria

- Every workstream begins with an observed behavioral RED and has separately reviewed regression coverage.
- Security decisions are enforced at runtime boundaries, not only in model instructions.
- Schema changes are additive first, backward-compatible during rollout, and have a tested rollback or forward-recovery procedure.
- No plan claims production remediation until code, migrations, CI, configuration, rollout, and live-safe evidence all exist.
- The final UX review confirms that safe paths did not gain unnecessary prompts, retries, or lockouts.

## Stop Conditions

Stop a slice if the review target changes before its RED is captured, if the test cannot exercise the real failing boundary, if a migration lacks recovery proof, if rollout requires unapproved production access, or if the proposed fix moves secret/tenant decisions back into prompt text.

## Delivery Strategy

Use one issue-linked pull request per independently reversible slice. Do not merge phases merely to reduce PR count. Each PR body should include RED evidence, GREEN evidence, preserved user behavior, migration/flag state, exact SHA, and remaining rollout gates.
