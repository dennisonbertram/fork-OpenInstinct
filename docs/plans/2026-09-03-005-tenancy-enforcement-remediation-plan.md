---
title: Tenancy Enforcement Remediation - Plan
type: remediation
date: 2026-09-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
review_target: edab75b8c202ff59bb039a792ac8439aa10f05ca
execution: planning-only
---

# Tenancy Enforcement Remediation - Plan

## TDD Plan (Behavioral RED First)

Add and run the behavioral tests below before changing runtime code, configuration, schema, or migrations. Record the failing assertions at the reviewed SHA. A setup, compilation, or fixture failure is not an acceptable RED.

1. `src/lib/tests/env.test.ts`: production/default configuration resolves to enforcement; production rejects `off`; isolated test/local runs may opt out explicitly.
2. `tests/unit/request-scope.test.ts`: revoked, invited, missing, suspended, pending-deletion, deleted, or lookup-error scopes fail closed; active members pass; only the authenticated matching user may bootstrap an exact first-run personal workspace.
3. `tests/integration/scope-enforcement.test.ts`: two users/two workspaces cannot cross tenant boundaries; an existing workspace never synthesizes a new owner; lifecycle denial occurs before side effects.
4. `tests/unit/linq-channel-scope.test.ts` and `tests/integration/channel-conversations.test.ts`: a provider turn requires one valid server-owned line/conversation/participant/agent/revision binding; ambiguity or absence never falls back to legacy authentication.
5. `tests/agent/channels/eve-channel-auth.test.ts`: route authorization always verifies active membership and returns indistinguishable missing/foreign session behavior.
6. `tests/integration/workspace-lifecycle.test.ts` and `tests/integration/usage-audit.test.ts`: lifecycle and budget denial happen before model, browser, provider-message, storage, or connection effects; concurrent admission cannot overspend.
7. `tests/integration/platform-api-routes.test.ts`, `tests/integration/api-credentials.test.ts`, and connection-installation suites: credentials/installations are rechecked for membership, lifecycle, revocation, and tenant ownership before use.
8. `tests/integration/workspace-tenancy.test.ts`: empty, legacy, partial, orphaned, revoked-owner, and ambiguous-owner data is reconciled only when ownership is provable.

**Stop gate:** no production source edit until at least the default-admission, cross-tenant, lifecycle, and channel-binding cases have failed for the expected authorization bypass and their RED output is saved.

## Regression Testing Plan

Run the focused scope suites, then:

```bash
pnpm test:unit
pnpm test:integration
pnpm db:check
pnpm test:e2e
pnpm check
pnpm build
```

The E2E matrix covers sign-in, workspace manager, chat, vault, session history, artifacts, and settings with two identities. It proves owner bootstrap succeeds, cross-tenant reads remain indistinguishable from missing records, and revoked/suspended users receive a safe unavailable state. Shared-line/provider tests use designated staging identities and must not send production messages without separate action-time authorization.

Required artifacts: initial RED, final focused/full pass counts, migration and backfill report, redacted enforcement configuration, exact SHA/deployment identity, two-tenant acceptance matrix, denial telemetry, and rollback rehearsal. Preserve deterministic personal workspace IDs, scoped queries, owner-only operations, revocation, private artifact 404 behavior, and explicit deployment-admin paths.

## Current Defect and Architecture

`WORKSPACE_SCOPE_ENFORCEMENT` defaults to `off` in `src/env.ts:109`. That setting bypasses membership or lifecycle validation in `src/lib/request-scope.ts:18-29`, `agent/channels/eve.ts:75-91`, `agent/channels/linq.ts:348-435`, `src/lib/api/v1-auth.ts:61-83`, `src/app/artifacts/[artifactId]/route.ts:19-25`, and budget checks in `db/services/usage.ts:71-73`. `db/services/scope.ts:57-59` can also synthesize owner access for an absent workspace.

Recommended architecture:

- Production always enforces; `off` is rejected outside explicitly isolated test/local execution.
- One canonical admission boundary authenticates the principal, resolves exactly one workspace, verifies active membership/capability and lifecycle, performs narrowly controlled first-run bootstrap, fails closed on uncertainty, and returns a verified scope to downstream code.
- Deployment-admin authority remains separate from ordinary tenant membership.
- Provider turns require an active server-owned binding; phone possession or message content is never web administration authority.
- An optional `observe` mode may record would-deny decisions during preflight, but it must not grant access and must not become a production bypass.

## Product and Usability Contract

Enforcement can lock out legitimate users whose legacy workspaces have no active owner, ambiguous ownership, or stale bindings. Avoid that without weakening isolation:

- Run a read-only inventory before cutover.
- Backfill only provable ownership; route unknown cases to a repair queue.
- Allow exact personal-workspace bootstrap only for the matching authenticated user.
- Invalidate sessions/caches after membership or lifecycle repairs.
- Degrade only the affected tenant; never disable global isolation to recover one user.
- Return an actionable unavailable/reauthentication state without exposing tenant existence or internal policy details.

Ordinary active users should see no extra steps. The change affects invalid, ambiguous, suspended, or incompletely migrated access paths.

## Implementation Units

### U1. Behavioral RED and admission contract

- **Files:** the focused unit/integration suites above.
- **Acceptance:** current default/bypass behavior fails the new admission expectations for the intended reasons.

### U2. Canonical admission and bootstrap

- **Files:** `db/services/scope.ts`, `src/lib/request-scope.ts`, and `src/lib/access-scope.ts` only if verified-scope typing requires it.
- **Acceptance:** every accepted scope contains verified workspace, membership, role/capability, lifecycle, and correlation context; an absent existing authorization never creates implicit ownership.

### U3. Configuration contract

- **Files:** `src/env.ts`, `.env.example`, test configuration, and `docs/operations/VERCEL.md`.
- **Acceptance:** production cannot boot with `off`; isolated eval/test behavior is explicit and separate.

### U4. Entrypoints and lineage

- **Files:** Eve and Linq channels, `src/lib/api/v1-auth.ts`, artifact route, protected context, session-owner hooks, and worker lineage.
- **Acceptance:** web, Eve, API, worker, provider, and artifact entrypoints consume a verified scope and stop before side effects on denial.

### U5. Lifecycle, budget, bindings, and installations

- **Files:** `db/services/usage.ts`, browser/model/provider/storage chokepoints, channel-conversation service, Google/Square installation resolvers.
- **Acceptance:** lifecycle and budget are checked before cost/external effects; provider ambiguity fails closed; revoked and foreign installations never reach token retrieval.

### U6. Additive reconciliation and rollout

- **Files:** schema plus generated migration only if reconciliation needs durable state; tenancy migration tests and operations docs.
- **Acceptance:** all existing workspaces have a trusted owner or an explicit repair-blocked status; no data is silently reassigned or deleted.

## Migration and Rollout

1. Inventory owners, memberships, lifecycle values, orphaned scoped rows, stale bindings, and connection installations. Take a backup.
2. Add backward-compatible state needed for reconciliation. Preserve valid owners; never reverse-map a hash or choose an arbitrary user.
3. Exercise would-deny telemetry in an isolated preview, logging only decision category, operation class, correlation ID, and opaque tenant identifier.
4. Enforce in isolated staging with separate database, Blob, Kernel, and connectors; run the two-tenant matrix.
5. Explicitly set production to `enforce`, deploy the reviewed SHA/migration set, and verify readiness and authorized acceptance paths.

Rollback is code-only across additive schema. Repair bad membership/lifecycle data or return an isolated deployment to observe mode; do not set shared production to `off`, delete authorization/audit data, or unwind encryption state.

## Observability, Privacy, and Stop Conditions

Track bounded allow/deny/bootstrap/lifecycle/budget/binding/installation events. Never log phone numbers, messages, provider tokens, OAuth payloads, vault data, screenshots, or credentials. Alert on non-enforcing production configuration, lookup errors, ambiguous ownership, binding rejection spikes, and inconsistent decisions across entrypoints.

Stop if any required RED is absent, ownership remains ambiguous, a lookup failure grants access, a provider turn starts without a binding, expensive work precedes budget admission, entrypoints disagree, or deployment evidence does not match the reviewed SHA and migrations.

## Rejected Alternatives and Residual Risk

Reject keeping the default off, trusting deterministic user hashes as authorization, arbitrary implicit-owner creation, tenant-specific bypasses, RLS as the only control, fail-open budget errors, provider/message inference, or removing the flag before data preflight. Residual provider availability, installation ownership semantics, quota concurrency, and deployment-admin power remain separate risks and require explicit contracts.
