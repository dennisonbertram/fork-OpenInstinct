# Bounded diagnostic evidence

Status: **Partially implemented**, 2026-09-12. The bounded result contract,
local metadata reader, Vercel metadata adapter, protected journey projection,
and focused synthetic tests now exist. The `pnpm diagnose` package entry is
registered. Authorized reads verified a live owned local manifest, a bounded
local root-session/Eve sequence, the configured production alias's immutable
deployment, and one exact preview deployment. They did not attest a served
application revision, browser/report/schedule evidence, or production runtime
identity. Retention policy and production runtime verification remain incomplete.
This is not a replacement for [VERCEL.md](VERCEL.md),
[AGENT_GUIDE.md](../AGENT_GUIDE.md), or
[AGENT_DEVELOPMENT.md](../AGENT_DEVELOPMENT.md).

## Purpose and boundary

Diagnosis answers a bounded question about a known run without changing product
state or treating missing data as a success claim. It composes existing owner
records and adds only small correlation links at missing edges. It does not add
a universal event lake, scheduler, task database, generic telemetry platform,
provider client, or product-facing dashboard.

Every result binds target, exact UTC window, supplied selector, source SHA when
known, and runtime/deployment identity when known. It separates:

| State        | Question answered                                                      | Does not establish                            |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------------- |
| Execution    | Did the owner start, settle, fail, cancel, or become unknown?          | Factual correctness                           |
| Verification | What independent observation corroborated or contradicted it?          | Delivery to a recipient                       |
| Reporting    | Is a summary owed, attempted, satisfied, unresolved, or superseded?    | Provider or recipient receipt                 |
| Delivery     | Was a provider attempt accepted, failed before dispatch, or uncertain? | Recipient receipt without an explicit receipt |

Completed, health success, and an empty result are not aliases for these states.
Absence can mean disabled collection, wrong scope, retention, truncation,
inaccessible owner, emitter failure, or a crash window. It never means "did not
run."

## Current evidence and safe reads

| Owner                    | Current evidence                                         | Safe conclusion                           | Limit                                           |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------- |
| Git/worktree             | git rev-parse HEAD, git status --short, git diff --check | Checkout identity and diff validity       | No runtime/deployment proof                     |
| Bootstrap                | ./init.sh --check                                        | Prerequisites at invocation               | No app journey proof                            |
| Eve local artifacts      | eve logs ls, eve traces ls                               | Retained local artifact metadata          | Presence is not source/runtime proof            |
| Eve stream               | Authenticated session event stream                       | Owner-visible session/turn/event sequence | No Kernel, DB effect, or provider receipt proof |
| Browser trace tables     | Scoped trace/task/domain rows                            | Browser worker recorded exposed fields    | Product records, not generic safe logs          |
| Completion ledger        | Logical report-part attempted/accepted/unconfirmed state | Provider-attempt bookkeeping              | No recipient receipt or factual verification    |
| Vercel deployment/health | Immutable deployment inspection and health response      | Named deployment/route state at a time    | No channel delivery or complete journey proof   |

pnpm check, pnpm build, pnpm eval:contract,
node scripts/test-real-postgres.ts, and pnpm test:e2e are **verification, not
read-only diagnosis**. They can generate files; the last three start isolated
services, databases, or browsers. ./init.sh installs, creates local configuration
when absent, links an environment, and starts services; only --check is a
prerequisite read. Use [TESTING.md](../TESTING.md) and VERCEL.md for their
ownership.

The installed Eve CLI has local log/trace inspection, but capture depends on Eve
discovery and instrumentation. Do not assume a selected process recorded an
artifact. Default diagnosis never uses verbose traces, log dumps, raw workflow
output, or any mode that can expose prompts, responses, tools, or environment.

## Implemented command contract

Plan 022 implements the metadata-only command source with two read modes. Its
package entry is registered. Every invocation names a target and surface; `app`
is the default surface.

```text
pnpm diagnose --target local|preview|production --surface app|marketing --status
pnpm diagnose --target local|preview|production --surface app|marketing --session <id> \
  --since <UTC> --until <UTC>
```

`--status` is target status and needs no journey selector: it can establish
deployment identity before an incident yields a session. Journey diagnosis
requires exactly one known selector and UTC bounds. Restricted alternative forms
accept an identifier already held in authorized evidence; they do not list,
prefix-search, or query a provider broadly. In the command grammar,
`--deployment <immutable-deployment-id>` is required when `--target preview`.
An authenticated Eve or protected journey read additionally needs
`--cookie-file <path>` to an existing session cookie file with mode `0600`.
Its path and value never enter output, and a missing or non-authorized cookie is
the `forbidden` evidence gap rather than a credential-validity claim.

```text
pnpm diagnose --target <target> --surface <surface> --request <request-id> --since <UTC> --until <UTC>
pnpm diagnose --target <target> --surface <surface> --provider-handle <opaque-handle> --since <UTC> --until <UTC>
```

`--request` and `--provider-handle` are parsed and mutually exclusive, but have
no reader yet: each returns the explicit `cannot_determine` gap. Request and
provider-handle selection therefore do not currently execute a database or
provider query. A future provider reader must remain metadata-only and return
no body, recipient, phone number, message, or credential.
Preview requires a caller-supplied exact immutable deployment selector; it never
means “latest.” The reader reports how a production surface/environment resolved
to its deployment and leaves that identity unknown when the authorized metadata
reader cannot prove it.
Every query is ordered, hard-capped, paginated, and restricted to its UTC
window; output names page limit, pages read, and truncation.

For `--target local`, status first validates the supervisor PID/start-time/run
nonce against the current worktree. A verified manifest reports its opaque run
ID, profile, owned Compose project, exact loopback app and marketing origins and
ports, and recorded database/migration/app/Eve/marketing readiness. It also
reports current `sourceHead`, a `sourceState` with clean/dirty state, and
the manifest's `launchSourceSha`. `launchSourceSha` is startup provenance;
neither it nor current HEAD is `servedRuntimeSha`. A dirty worktree therefore
does not claim that the active server serves its current files. Basic local
status does not require an admin cookie. Admin-only runtime identity is optional
separate evidence and remains unavailable until a permitted reader can attest
it. Recorded readiness is launch metadata, not a current health probe.
Local status is complete only after the owned app and marketing children are
verified and database, migrations, Agentation (`ready` or `external`), app,
Eve, and marketing readiness are all recorded `ready`; a pending or failed
required readiness remains a named local-run gap.

All targets use one schema:

```text
DiagnosticResult {
  query: { mode: target_status | journey, target, surface, selectorKind?, selector?, since?, until?, deploymentId? }
  status: complete | partial | incomplete
  targetIdentity: TargetIdentity
  capabilities: [{ name, state: available | disabled | missing | expired | forbidden | unavailable }]
  observations: [{ owner, kind, at?, execution?, verification?, reporting?, delivery?, ref?, sourceRevision? }]
  gaps: [{ owner, reason: missing | disabled | expired | truncated | cannot_determine | forbidden | unavailable }]
  bounds: { pageLimit, pagesRead, truncated, redaction: "allowlist" }
}
```

Invalid bounds, unauthorized selection, a preview without immutable deployment,
or reader failure that makes evidence incomplete exits nonzero after printing a
safe partial result. Telemetry failure must never block a product turn; reader
failure must never appear complete.

## Target identity and deployment readiness

For preview/production, diagnosis reports non-secret identity fields separately
from capability availability and credential validity:

| Field                   | Evidence rule                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Project and environment | Project ID and environment are primary; project display name is secondary                                            |
| Deployment              | Immutable deployment ID and validated public HTTPS origin/alias, ready state, and observed time                      |
| Source                  | Declared source SHA and independently observed served runtime SHA, each match/mismatch/unknown                       |
| Runtime                 | Eve version, Next version, patch/lock identity only from an approved metadata source                                 |
| Auth                    | Validated public canonical HTTPS origin/alias declared-versus-served relationship, match/mismatch/unknown            |
| Database                | Logical database identity and pooled/direct role consistency; never emit URL, connection string, credential, or hash |
| Migration               | Expected and observed migration version/journal, match/mismatch/unknown                                              |
| Workflow                | Workflow world/version and old-session pinning state when available                                                  |
| Storage and channels    | Blob/store and connector attachment presence; metadata availability is not credential validity                       |

Installed Vercel CLI inspect JSON at version 59.6.2 exposes deployment
id/name/url/target/ready state/time/aliases/builds/context name. It does **not**
supply project ID, source SHA, or deployment metadata. Do not infer a Git SHA
from it. The local project file can have a stable project ID with a stale display
name; use the ID for identity and report name drift. Served runtime SHA remains
unknown until an explicit approved evidence source proves it.

A project/environment/alias/immutable deployment/database-role/migration/workflow
or attachment conflict is a deployment-blocking diagnostic result, not a
deployment action. It must name the conflict, evidence source, and owner. A
missing metadata capability is unknown, not invalid credentials.

## Boundary map

| Symptom                              | Owner                                   | Safe observable                                                   | Cannot conclude                                               | Next action                                                                               |
| ------------------------------------ | --------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| UI proxy/auth/tRPC fails             | Next request/auth and tRPC scope        | Route status, origin/scope decision, existing v1 request ID       | Eve turn created; tRPC has no request ID today                | Read scoped session owner; add explicit request-to-session link only if RED proves needed |
| Eve waits, stream ends, model errors | Eve durable stream                      | Event, session, turn, step, call IDs and terminal/waiting state   | Provider delivery, factual success, absence meaning no action | Inspect bounded session events and report reconnect/gap                                   |
| Child task/Kernel stuck              | Eve child task and browser/Kernel owner | Parent/child/task identity, trace status, allowed domain metadata | Page state or remote effect from task label                   | Inspect scoped browser trace; Kernel only through authorized metadata                     |
| DB/migration suspect                 | Drizzle/DB owner                        | Selected migration/version and scoped record metadata             | Data correctness, rollback safety, absent row                 | Use owning test/runbook; no invented SQL/production DB CLI                                |
| Blob/vault missing                   | Artifact/vault owner                    | Scoped metadata and availability                                  | Bytes, encrypted plaintext, deletion                          | Use artifact owner; never dump blob/encrypted fields                                      |
| Scheduled run repeats                | Scheduler/lease/cron owner              | Job/run/lease/report status and bounded error class               | Provider receipt or safe resend                               | Read lease state; uncertain delivery remains unretried                                    |
| OTP/connector/binding rejects        | Admission/binding owner                 | Enabled/disabled configuration presence and safe binding state    | Identity possession, payload, or sent OTP                     | Use channel runbook and authorized provider gate                                          |
| Provider/transport state unclear     | Channel adapter and report ledger       | Exact part state and safe provider handle                         | Recipient receipt, content, verified task result              | Report accepted/failed/uncertain separately; never auto-resend                            |

Current owner anchors:
[v1 request identity](../../src/lib/api/v1-auth.ts#L15),
[tRPC context](../../src/trpc/http-context.ts#L5),
[Eve route auth](../../agent/channels/eve.ts#L23),
[root model step](../../agent/agent.ts#L30),
[browser trace hook](../../agent/subagents/browser-agent/hooks/trace-telemetry.ts#L51),
[scoped browser reads](../../db/services/browser-traces.ts#L37),
[scheduled-run schema](../../db/schema/schedules.ts#L105), and
[report-part dispatch](../../agent/lib/report-part-dispatch.ts#L38).

## Redaction, access, and retention

Allowlist projection occurs before output. Target identity may report a stable
deployment ID and a validated public HTTPS origin: no userinfo, query,
fragment, or non-root path. Never emit private resource URLs, provider URLs,
internal DB hosts, arbitrary URLs/query strings,
headers, titles, message/task/page text, tool arguments/returns, screenshots,
workflow raw output, encrypted blobs, vault plaintext, phone numbers, tokens,
or credentials. Hashes/digests are allowed only if the existing owner already
treats them as safe metadata. Browser trace detail is a bounded raw excerpt,
not a generic diagnostic log; it may be a workspace-scoped reference but is
never copied to combined output.

A Vercel `env pull` may write the literal `[SENSITIVE]` marker when a Secret
value is unavailable to the operator. As documented for [sensitive environment
variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables),
treat that marker as redacted data: leave validation and expected-match results
unknown, do not call it malformed configuration, and do not replace or weaken
the Secret setting. Only authorized runtime evidence can validate the value.

Access is target- and owner-specific. Local reads require a verified owned
manifest; preview/production require existing operator authority. Before any
authenticated reader receives a cookie, project, deployment project, team,
environment, and origin binding must all be observed. A mismatch or unknown
means no authenticated reader fetch. Authenticated tRPC reads have a five-second
abort bound and reject redirects. Default access, retention,
deletion, and audit rules for a combined artifact are **TBD**. Decide and test
them before production promotion; do not invent a policy from existing tables.

## Current production procedure and limitation

For an authorized incident, use the Vercel dashboard or existing authorized
reader scoped to immutable deployment and UTC window, then record only approved
metadata. [VERCEL.md](VERCEL.md#migration-and-deployment) owns deployment
inspection, bounded error review, and health. There is no verified one-command,
redaction-safe production log wrapper. Do not bridge that gap with broad JSON
exports, expanded logs, raw traces, or copied provider payloads.

## Observed acceptance and remaining evidence gaps

- Synthetic local evidence links root session, child task/session, selected DB
  outcome, and delivery-part state when owners expose them.
- Unavailable, disabled, expired, forbidden, truncated, or unreadable owners
  are gaps; no empty query says did not run.
- Default normal/error output contains no forbidden field, including browser
  detail and provider metadata.
- Provider timeout is delivery uncertain, never accepted and never resent.
- Worker completed remains verification unverified without independent evidence.
- Tests prove bounds, selector exclusion, target identity conflict handling,
  partial nonzero output, provenance binding, and no reader side effect.

Focused tests cover endpoint-specific Vercel projection, null preview target
handling, runtime/control-plane mismatch, redaction, zero cookie forwarding on
a mismatched target, bounded Eve replay, redirect/timeout rejection, and scoped
journey joins. Live reads observed local status, a local session's root/Eve
metadata, production alias resolution, and an exact preview deployment. The
local journey remains incomplete where browser, report, and schedule owners have
no record; remote runtime identity remains unavailable without an existing
authorized admin session. Use individual owners, state source/deployment/window,
and leave those unknowns explicit.
