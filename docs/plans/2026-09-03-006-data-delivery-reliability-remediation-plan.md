---
title: Data and Delivery Reliability Remediation - Plan
type: remediation
date: 2026-09-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
review_target: edab75b8c202ff59bb039a792ac8439aa10f05ca
execution: planning-only
---

# Data and Delivery Reliability Remediation - Plan

## TDD Plan (Behavioral RED First)

Add and run the tests below at the reviewed SHA before editing production source, routes, schema, or migrations. Save the failing assertions. A fixture, compile, or harness failure is not an acceptable RED.

### API idempotency

Extend `tests/integration/platform-api-routes.test.ts`:

- An aged unfinished reservation becomes safely reclaimable rather than returning permanent `409`.
- An active reservation still conflicts deterministically.
- A fault after resource creation but before finalization recovers without duplicating the resource.
- A completed request replays the original resource/status.
- Two concurrent stale reclaimers produce one winner and one conflict/replay, never two resources.

### Webhook SSRF and delivery claims

Extend `tests/integration/webhooks.test.ts` and add a pure IP-classification unit suite if useful:

- Mock DNS so loopback, RFC1918, link-local, metadata, mapped-private IPv6, mixed public/private answers, DNS errors, and timeouts all fail closed before fetch.
- Rebinding fixture: registration resolves public, delivery resolves private; no network request occurs.
- A blocked fetch does not prevent endpoint administration or another worker from claiming a different delivery.
- Timeout, abort, thrown fetch, and crash-after-claim recover after lease expiry without a permanently stuck delivery.

### Vault bulk behavior

Add `tests/integration/vault-import.test.ts`:

- Failure on item two leaves zero metadata/secret rows.
- Retry with the same batch identity creates one record per logical item.
- Malformed input fails before writes and cross-workspace retries cannot collide.
- Reading N vault records performs one batched secret-presence query, not N.

**Stop gate:** do not edit production source until one intended RED is captured for each of idempotency recovery, DNS/rebinding protection, out-of-transaction delivery, and atomic/idempotent vault import.

## Regression Testing Plan

- Unit: lease transitions, reclaim decisions, IP classification including IPv6/mapped forms, batch identity, and batched secret mapping.
- PGlite integration: stale/active/crash/concurrent API calls; webhook DNS, redirect, retry, lock, and recovery; vault rollback, retry, isolation, and query count; migration idempotence.
- Real PostgreSQL: run concurrency and lock suites with `REAL_PG=1`; PGlite is not proof of `FOR UPDATE SKIP LOCKED`, transaction visibility, or production locking.
- E2E: authenticated API replay and vault import success/failure/retry UI; webhook administration only if exposed in the product.
- Provider/live-safe: local webhook receiver and fake DNS only. No production destinations, provider mutations, or secrets without separate authorization.

Commands:

```bash
pnpm exec vitest run tests/integration/platform-api-routes.test.ts tests/integration/webhooks.test.ts tests/integration/vault-import.test.ts
pnpm test:unit
pnpm test:integration
REAL_PG=1 pnpm exec vitest run tests/integration/platform-api-routes.test.ts tests/integration/webhooks.test.ts tests/integration/vault-import.test.ts
pnpm test:e2e
pnpm db:check
pnpm check
pnpm build
```

Record RED/GREEN output, pass counts, database engine/version, migration set, exact SHA, lock/concurrency timing, fault injection used, and skipped live gates.

## Current Defects and Recommendations

### 1. API idempotency

The reservation schema at `db/schema/application.ts:661` has no lease/state, and reserve/create/finalize are split across `src/lib/api/v1-auth.ts:159` and API routes. An unfinished row can block a key forever.

Prefer a transactionally atomic reserve/create/finalize path for database-local resource creation. Add lease/claim state only to recover historical or operations that cannot be one transaction. Persist a request fingerprint and original outcome; never blindly delete stale rows because the resource may already exist.

### 2. Webhook SSRF

`db/services/webhooks.ts:531` documents hostname-only validation. DNS preflight alone still permits time-of-check/time-of-use rebinding.

Use a validated/pinned egress client or controlled proxy that resolves all A/AAAA answers, rejects any non-public address, and guarantees that the actual socket connects to an approved address while preserving HTTPS hostname/SNI validation. Keep redirects disabled and revalidate every attempt.

### 3. Webhook transaction duration

External fetch currently occurs inside the transaction/row-lock scope at `db/services/webhooks.ts:222`.

Claim a delivery in a short transaction with a unique claim token and expiry, commit, send outside the transaction, then finalize with compare-and-set on the token. Recover expired claims. Delivery remains at-least-once; stable event IDs and receiver deduplication are required.

### 4. Vault bulk import and reads

The import loop in `src/trpc/router.ts:551` is sequential and non-transactional; `db/services/vault.ts:66` calls secret-presence lookup once per record.

Validate the whole batch first, write it in one transaction, and record a workspace-scoped import-batch idempotency key. Replace per-record presence checks with one set query. Do not substitute `Promise.all`, which is neither atomic nor retry-safe.

## Product and Usability Contract

- Active duplicate API calls retain a deterministic conflict/retry signal; stale/crashed calls recover; completed calls replay; duplicates are never created.
- Valid public HTTPS webhooks retain registration and delivery behavior. Unsafe or ambiguous destinations fail with an actionable message that does not reveal resolver/IP internals.
- Slow webhook receivers cannot block endpoint administration or unrelated deliveries.
- Vault import is clearly all-or-nothing and retry-safe. Validation identifies row-level input problems before writing, while runtime failure leaves the batch unchanged.
- Import and webhook errors never expose secrets, CSV content, payload bodies, query strings, full URLs, DNS answers, or credentials.

These changes generally reduce user friction. The visible tradeoffs are that unsafe webhook endpoints are rejected and an atomic import may wait longer before declaring success; progress UI and precise validation make those boundaries understandable.

## Implementation Slices

### U1. API idempotency recovery

- **Files:** idempotency schema/migration, a concrete owning service or `src/lib/api/v1-auth.ts`, affected API routes, integration tests.
- **Acceptance:** active conflict, completed replay, stale reclaim, crash recovery, and real-Postgres race all produce at most one resource.

### U2. DNS-pinned webhook egress

- **Files:** narrowly owned resolver/egress boundary, webhook service, tests; add a dependency only if the platform cannot guarantee connection pinning.
- **Acceptance:** private/mixed/error/rebinding cases never contact a destination; public HTTPS delivery still works.

### U3. Short webhook claim/send/finalize

- **Files:** additive delivery-claim migration, webhook service, cron/admin drain tests.
- **Acceptance:** no external fetch runs in a database transaction; unrelated claims/admin updates proceed; expired claims recover; retry/dead-letter semantics remain.

### U4. Atomic and idempotent vault batches

- **Files:** additive import-batch migration, vault service, tRPC route, import UI status/error copy, integration/E2E tests.
- **Acceptance:** item-two failure leaves zero writes, a retry does not duplicate, tenant keys are isolated, and N-item reads use one presence query.

Keep these migrations separate and independently deployable.

## Migration, Rollout, and Rollback

- Add nullable claim/lease/batch fields first and deploy backward-compatible readers/writers.
- Audit unfinished idempotency rows before reclaiming them.
- Pause/drain webhook workers before changing claim semantics; canary the new worker path after lock/lease telemetry exists.
- Preserve old columns and rows during rollback. Prefer forward recovery; do not use destructive production down migrations.
- If a staged flag is needed, use it briefly for legacy idempotency recovery, webhook worker canarying, or vault batch cohorts. Correctness must become unconditional and divergent paths must be retired.
- A 3,000-item vault transaction may be heavy. Measure it; only adopt chunked/resumable semantics if the product explicitly accepts partial progress and a durable resume contract.

## Observability and Stop Conditions

Measure aggregate reservation age/reclaims/finalization errors, DNS rejects/errors/rebinds, webhook fetch/claim/lock/lease recovery, and vault batch duration/rollback/replay/query count. Use opaque tenant identifiers; never label metrics with keys, secrets, URLs, payloads, or IPs.

Stop if a RED cannot be reproduced, recovery can duplicate a resource, SSRF proof does not bind the actual connection, real Postgres shows fetch under locks, vault faults leave partial rows, migrations fail representative upgrades, or testing would require production destinations/secrets.

## Rejected Alternatives and Residual Risk

Reject blind stale-row deletion, lease-only idempotency when database-local work can be atomic, DNS preflight as the final SSRF control, redirects, network calls inside transactions, and concurrent non-transactional vault writes. A webhook crash after remote success but before local finalization can still redeliver; stable event IDs and receiver deduplication remain part of the public contract.
