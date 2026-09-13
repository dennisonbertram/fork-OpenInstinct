# Plan 022: Add bounded cross-boundary diagnostic evidence

Status: **Partially implemented**. Written against
7875a08348adf2d567120e7e7f3d803b101aa45a on 2026-09-12. The bounded source,
package registration, synthetic tests, and bounded local/remote CLI reads
exist. A verified owned local fixture manifest status read is complete for its
recorded readiness evidence, and a signed synthetic local session read returned
root-session and Eve lifecycle metadata. Exact preview and production deployment
reads resolved safe control-plane identity. These reads do not attest served
runtime source, browser/report/schedule evidence, or a remote runtime identity.
The first
test attempt failed because the newly named diagnostic modules did not yet
exist; that import failure was not a behavioural RED. The later focused
regressions exercise parser, redaction, scoped owner joins, alias resolution,
null preview target handling, target-bound cookie forwarding, and bounded Eve
and tRPC metadata reads. It does not authorize a deployment, provider effect,
database write, or live effect.

## Outcome

Implement a metadata-only reader for local, preview, and production with one
bounded output schema. `target status` names a target and surface before a
journey is known. `journey diagnosis` also supplies exact UTC bounds and one
known selector. The result joins existing identities first, reports explicit
gaps, and adds minimal typed correlation links only at demonstrated missing
edges.

The contract is [DIAGNOSTICS.md](../docs/operations/DIAGNOSTICS.md). This is a
thin composition of current Eve, app, database, Kernel, channel, and deployment
owners. Do not create an event lake, scheduler, global task state, generic
telemetry platform, provider-content archive, or dashboard.

## Drift check and dependencies

Before source work, inspect current changes to agent/channels/eve.ts,
agent/channels/linq.ts, agent/channels/sendblue.ts,
agent/subagents/browser-agent/hooks/trace-telemetry.ts,
db/services/browser-traces.ts, db/services/completion-report-attempts.ts,
db/services/scheduled-agent-jobs.ts, src/lib/api/v1-auth.ts,
src/trpc/http-context.ts, scripts, and DIAGNOSTICS.md.

Stop and reconcile if Plans 017, 019, or 020 already provide the same run
manifest, selector, target-identity report, or operator reader. Consume their
evidence instead of duplicating lifecycle, verification, or deployment logic.
Read [AGENT_DEVELOPMENT.md](../docs/AGENT_DEVELOPMENT.md),
[TESTING.md](../docs/TESTING.md), [DEVELOPMENT.md](../docs/operations/DEVELOPMENT.md)
when present, and [VERCEL.md](../docs/operations/VERCEL.md). Agree the
production target-identity contract with the Plan 024 owner before source work.

## Current state and constraints

- Eve sessions provide event/session/turn identities; web status is derived,
  not lifecycle authority.
- Browser traces are workspace-scoped persistent product evidence and include
  bounded raw task/tool/result excerpts. Default developer output cannot copy
  them.
- Completion report attempts own part state and provider-handle metadata.
  Accepted means provider acceptance only; uncertain forbids automatic resend.
- v1 has request IDs while tRPC has origin/scope only. Any request/session link
  must be explicit and cannot introduce a global state owner.
- Agent Runs are disabled. Workflow timing is off by default and process-global.
  Neither becomes a required sink.
- Vercel inspect JSON does not prove project ID, source SHA, or served runtime
  SHA. Stable ID outranks a project display name; conflicting names are reported,
  not silently normalized.

## Scope

**In scope**

- DIAGNOSTICS.md, this plan, a pnpm diagnose script with `--target` and
  `--surface app|marketing` (default `app`), and a bounded
  implementation under scripts/diagnostics/.
- Owner-local metadata readers for Git/run manifest, local Eve evidence, scoped
  browser/scheduled/report references, and preview/production capability state.
- Minimal typed correlation metadata at a proven edge, binding source SHA,
  environment, selector, timestamp, owner, and evidence reference.
- Target identity projection: project/environment/deployment/alias relationship,
  declared versus served source/runtime, canonical auth relationship, logical DB
  role, migration, workflow, storage, and connector attachment state. A public
  canonical or immutable HTTPS origin is allowed only without userinfo, query,
  fragment, or non-root path; private provider/resource/database URLs are not.
- Unit and synthetic integration coverage.

**Out of scope**

- Business tools, Kernel execution, provider dispatch, auth-policy changes,
  unrelated migrations, retention machinery, UI work, production SQL, broad
  Vercel exports, generalized telemetry, or a live effect.

## Required pre-implementation RED

This requirement was missed before the first source edits. The initial failure
was an import-resolution failure, not evidence of prior behaviour. The focused
regressions listed below now protect the implemented behaviour, but they do not
retroactively establish a behavioural RED against the exact base revision.

1. Add parser/serializer tests that fail because pnpm diagnose does not exist
   and no current schema expresses target status versus journey diagnosis,
   partial/incomplete plus execution,
   verification, reporting, and delivery separately.
2. Add synthetic metadata fixtures: root with child task; omitted owner;
   expired/truncated page; accepted and uncertain report parts; target identity
   match; project-name drift; preview without exact immutable deployment; and
   deployment/database/migration mismatch. No
   fixture contains message, URL, tool payload, secret, provider body, or DB URL.
3. Prove the RED tests reject combined selectors, invalid/non-UTC bounds,
   unbounded pages, browser detail, raw workflow data, and did_not_run inferred
   from missing evidence.

Do not edit an owner until RED identifies a missing join that no existing owner
can safely provide.

## Steps

### 1. Contract and safe reader seam

Add scripts/diagnostics/contract.ts for mode, selector, target/surface, bounded
result, capability, gap, state, and TargetIdentity schemas. Add
scripts/diagnostics/index.ts and the package wrapper as the pnpm diagnose entry
point.

Every invocation requires `--target local|preview|production` and
`--surface app|marketing`; `app` defaults. Target status has no session
requirement. Journey diagnosis requires exactly one session/request/provider-
handle selector and both UTC bounds. Preview requires an exact immutable
deployment selector, never `latest`. It prints safe partial result before a
nonzero incomplete exit. It never writes a run record, starts services,
migrates, operates Kernel/browser, opens a provider connection, or acts on a
deployment.

An Eve stream or protected journey query uses an existing authenticated session
cookie from a mode-`0600` `--cookie-file`; it never uses a Vercel token as app
authentication. The file path and cookie value are not serialized.

**Verify:** parser RED becomes GREEN; invalid input exits nonzero without an
observation payload.

### 2. Local readers and existing identities

Add scripts/diagnostics/local.ts and owner-local pure projectors. They consume
only supplied fixtures or bounded metadata interfaces: Git SHA, Plan 023
manifest reference when present, Eve local metadata, browser/schedule/report
references, and gaps. They do not parse workflow raw output, encrypted blob,
browser trace detail, Eve verbose trace, or result body.

If Eve local artifact format/discovery is unavailable, return cannot_determine,
not a fabricated absence.

**Verify:** synthetic root-child-report lineage yields stable owner references;
disabled/missing artifact becomes a gap.

### 3. Proven minimal correlation links

Use session, turn, child-session, task, scheduled-run, report-part, workspace,
deployment, and v1 request identities first. If RED proves a missing edge, add
the smallest typed envelope at producer/consumer boundary with owner, source
revision, environment, safe IDs, time, state, and evidence reference.

Expected candidates are src/lib/api/v1-auth.ts, src/trpc/http-context.ts,
agent/channels/eve.ts, and existing browser/channel services. Do not add a table
or generic service unless two actual owners cannot exchange a typed reference;
stop for design review then.

**Verify:** changed SHA, environment, deployment, or session yields mismatch/gap
instead of a cross-run join.

### 4. Preview/production identity and capability adapters

Add scripts/diagnostics/read-target.ts. It shares the local schema and uses only
approved metadata readers. Preview accepts an exact immutable deployment
selector, not an implicit newest deployment.
`readTarget` returns per-surface, per-environment metadata without a session;
`diagnoseJourney` adds the selector and UTC window. Report actual proof level
for each target identity field: match, mismatch, or unknown. Project/display-
name disagreement must name the stable project ID and drift, not choose by name.

The implemented adapter uses endpoint-specific projections: project identity,
configured production alias resolution, and exact immutable deployment metadata
are parsed separately because identically named Vercel fields can have different
shapes. A null deployment `target` is preview only for a caller-supplied exact
preview deployment; an absent target remains unknown. It never wraps raw Vercel
logs JSON. Request and provider-handle selectors remain parsed-but-unimplemented
and return `cannot_determine` without a database or provider query.

**Verify:** target fixtures serialize same schema; unavailable authority and
provider adapters are partial nonzero with no network effect; declared SHA and
served runtime remain independently unknown until evidence exists.

### 5. Redaction, pagination, and failure isolation

Allowlist before serialization. Cap every owner and expose page limit/pages
read/truncation. One reader failure becomes a named gap without suppressing
independent observations. A complete result requires requested capable owners
to succeed. Required target conflicts are deployment-blocking diagnostics, not
actions.

**Verify:** forbidden-field injection never reaches output; reader failure keeps
other evidence but exits incomplete/nonzero.

## Proposed files and ownership

| Path                                        | Owner                     | Change                                              |
| ------------------------------------------- | ------------------------- | --------------------------------------------------- |
| package.json                                | developer tooling         | Add diagnose script after implementation exists     |
| scripts/diagnostics/contract.ts             | developer tooling         | Schema, bounds, serializer, TargetIdentity          |
| scripts/diagnostics/index.ts                | developer tooling         | Parser, orchestration, exit contract                |
| scripts/diagnostics/local.ts                | local evidence owners     | Metadata-only local adapters                        |
| scripts/diagnostics/read-target.ts          | diagnostic evidence owner | Target identity and bounded Vercel metadata reader  |
| tests/unit/diagnostics-contract.test.ts     | developer tooling         | RED/GREEN parser, bounds, redaction, identity tests |
| tests/integration/diagnostics-local.test.ts | local evidence owners     | Synthetic lineage and failure isolation             |
| Minimal proven edge file only               | producing/consuming owner | Typed correlation reference; no global state        |

## Acceptance and integrated proof

- Every command names exact target and surface; preview names an immutable
  deployment selector. Target status works without a session; journey diagnosis
  requires one selector and bounded UTC window. Both use one output schema.
- Synthetic lineage binds source SHA, environment, case/runtime identity, root
  session, child task/session, and report part where each exists.
- Target identity reports project ID/environment/deployment/alias/source/runtime
  auth/DB/migration/workflow/storage/channel evidence as match/mismatch/unknown.
  It never emits secrets, private URLs, connection strings, database hashes, or
  raw provider data. Validated public HTTPS root origins and declared source SHA
  are explicit allowlisted exceptions.
- Missing, disabled, expired, truncated, forbidden, and unreadable evidence
  keeps its reason. Empty never means no action did not occur.
- Completed worker is not verified; provider acceptance is not recipient receipt;
  uncertain delivery never automatically resends.
- Every reader has no writes, startup, migration, browser/Kernel, provider,
  deployment, or paid-model side effect. Telemetry failure never blocks product.
- Redaction precedes output: no private URL/query/header/title/message/task/page/tool,
  raw workflow, vault/blob, recipient, or secret data. Validated public HTTPS
  root origins are the explicit exception.
- Run focused tests, pnpm check, pnpm build, and git diff --check. These are
  verification, not read-only diagnosis. Service-owning integration tests stay
  separate from no-side-effect proof.

## Stop conditions and maintenance

Stop if a reader needs raw content, unbounded provider/Vercel/database query,
new global durable state, a fake retention policy, or a live effect. Stop if
source/runtime/deployment provenance cannot bind to a claimed result. Record the
gap and use the owner runbook.

Retention, deletion, default access, and audit behavior are **TBD**. Define and
test them before production promotion without expanding into broad compliance
work. Eve artifacts, channel contracts, Vercel output, database schema, and
Plan 021/023/024 changes require contract/fixture refresh.
