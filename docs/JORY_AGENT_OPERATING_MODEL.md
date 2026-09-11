# Jory agent operating model (proposed)

Status: **Proposed design**, dated 2026-09-11. This document describes a
future operating model; it does not claim that the runtime, schema, APIs, or
product behavior already implement it. Current implementation and dated
verification remain authoritative in the linked documents.

Related execution plans:

- [Reliable completion epic](../plans/003-reliable-completion-epic.md) (planned; [epic #152](https://github.com/dennisonbertram/fork-OpenInstinct/issues/152)).
- [Agent operating model epic](../plans/010-agent-operating-model-epic.md) (planned; [epic #153](https://github.com/dennisonbertram/fork-OpenInstinct/issues/153)).
- [Conversation evaluation specification](evaluation/README.md) (proposed
  scenarios and rubric).
- [Platform architecture](PLATFORM_ARCHITECTURE.md) (implemented ownership
  boundaries, with proposed additions clearly marked below).

## Purpose and design rule

Jory should spend model reasoning on uncertain decisions. Trusted runtime
owners should provide the bookkeeping that already has an authoritative answer:
the current objective, active constraints, identity and scope, available
capabilities, observations, approvals, execution receipts, verification
evidence, reporting obligations, and resource limits.

The model interprets and proposes. It does not promote an interpretation into
authority, a claim into a fact, or a request into permission. Existing runtime
owners remain the source of truth:

| Fact or state                                 | Authoritative owner                             | What a Jory view may contain                           |
| --------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Workspace, membership, agent revision, policy | Application services and verified request scope | A bounded projection with freshness and scope          |
| Session, task, turn, lifecycle, and steering  | Eve sessions/tasks and existing lifecycle state | Current task status and pending input                  |
| Browser ownership and page observations       | Browser worker and Kernel-owned browser state   | Safe observations, references, and evidence links      |
| Approval and commit authorization             | Existing executor/approval boundary             | Approval readiness, exact terms, and commit receipt    |
| Provider acceptance and delivery handle       | Channel adapter                                 | Provider response, idempotency status, and uncertainty |
| User facts and preferences                    | Existing scoped memory providers                | Facts with source, scope, and freshness                |
| Reusable procedures                           | Versioned authored skills and docs              | A skill reference and its preconditions                |
| Resource budgets                              | Runtime/operator controls                       | Remaining bounded allowance and stop reason            |

User constraints and a model's inferred task revision are not native approval
authority. They remain interpretations anchored to user-message references
until the existing approval/executor boundary authorizes an exact action.

A new universal database, scheduler, event lake, tool registry, or autonomous
skill marketplace is outside this proposal. Cross-session artifacts should use
existing scoped application services when they are required.

## Linked hierarchy

The proposed model is a linked hierarchy. Each layer constrains the next:

```text
verified workspace/agent revision and policy
  -> objective, constraints, and task revision
  -> scoped observations and capability readiness
  -> preparation and approval
  -> execution attempt and receipt
  -> verified outcome and open reporting obligation
  -> channel acceptance and visible result
  -> reviewed procedural improvement
```

A link carries the owner, subject, revision, scope, timestamp, and evidence
reference. A late result cannot answer a superseded objective. A new steering
instruction changes the active objective revision only for the intended task;
unrelated tasks retain their own revision and obligations.

## Completion is orthogonal

A single done boolean is insufficient. The proposed completion record keeps
these dimensions independent:

| Dimension    | Example states                                                                         | Meaning                                             |
| ------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Execution    | prepared, approved, attempted, completed, failed, unknown, cancelled, blocked, partial | What Jory or a worker did                           |
| Verification | unverified, corroborated, verified, contradicted, stale                                | What trusted evidence supports                      |
| Reporting    | owed, composed, attempted, satisfied, unresolved, superseded                           | The state of the substantive explanation obligation |
| Delivery     | not-applicable, accepted, visible, recipient-received, failed, uncertain               | What the channel/provider proves                    |

A successful report does not prove task execution. A verified task outcome does
not prove that its report arrived. Provider acceptance does not prove recipient
receipt. The report must distinguish these states and name the next action when
a state remains uncertain.

Restart duplicate suppression cannot rely only on Eve `defineState` or a call
ID. A crash after a provider write can replay the checkpoint. Task state may
remain in Eve, while delivery attempts are owned by the channel/application
boundary using a logical cohort, report revision, and physical message part.
An unattempted claim may be safely recovered by an atomic ownership check. If
the durable attempted checkpoint exists but acceptance was not recorded, the
result is unknown and there is no automatic resend until status or user
direction is available. This is a bounded delivery record, not a task engine,
general scheduler, or universal exactly-once guarantee. Multi-part reports and
the real crash windows require explicit tests.

Reactions remain appropriate for a lightweight social acknowledgment when no
substantive obligation is outstanding. If classification is uncertain, Jory
should prefer a short written response. A reaction cannot discharge a pending
completion report.

Schema validation cannot guarantee factual correctness: a complete-looking
record, valid JSON, or terminal label still needs independent evidence for the
claim being made.

## Example: approval to result

For a synthetic form submission, the intended sequence is:

1. The application binds the request to the authenticated workspace and agent
   revision. The browser worker records the exact origin, form terms, and
   channel context for the synthetic form.
2. The browser worker prepares the actual synthetic form and preview.
   Preparation does not dispatch anything.
3. The native approval boundary asks once for approval of those exact terms.
   A prose request must not be followed by a second hidden approval gate.
4. On approval, the executor revalidates scope, origin, recipient, terms,
   capability, and idempotency key immediately before dispatch.
5. The executor dispatches the approved browser action once and returns
   completed, failed, or unknown actual-result state. An unknown effect is
   never retried automatically.
6. The worker performs a read-only verification where possible. The channel
   adapter then sends Jory's report, whose provider acceptance and recipient
   receipt are tracked separately from the browser action.
7. Jory reports what was attempted, what was verified, what the provider or
   recipient evidence proves, and what remains open.
8. A material change invalidates the approval and requires a new approval.
   Cancellation does not roll back an effect already dispatched.

An approval prompt is not a delivery receipt. A valid JSON response or a
worker success label is not independent verification.

## What the agent sees and controls

The compact situation view is a typed, refreshable projection, not a full history:

- objective and objective revision;
- active constraints and user-stated preferences;
- authenticated scope, agent revision, and current task identity;
- current capability readiness, preconditions, effect class, and legal recovery;
- observations labelled observed, derived, user-stated, unknown, or stale, each
  with source and observed time;
- pending approval or user input;
- execution, verification, reporting, and delivery states;
- bounded drill-down references to evidence;
- remaining resource allowance and the reason to stop.

The agent may interpret observations, choose among already-authorized
capabilities, prepare reversible work, ask a necessary clarification, and
compose a truthful report. It may not select identity, workspace, credentials,
provider endpoint, approval policy, or an unadvertised capability. It may not
inspect secret values or place unbounded page text into parent context.

Capability descriptions must state precondition, effect class, input/output
contract, failure state, and legal recovery. The advertised operation must come
from the same policy structure checked by the executor. Unsupported controls
must be described as unsupported with the real recovery path.

## Evidence freshness and retrieval

Every observation and evidence reference should carry:

- scope and owner;
- source kind and stable identifier;
- observed-at time and source revision;
- freshness or expiry rule;
- whether it is direct, derived, user-stated, unknown, or stale;
- the claim it supports and the claim it cannot support.

Retrieval is bounded by task, source, age, size, and result count. Parent context
receives summaries and references, not raw secrets or unbounded page text.
Critical claims are corroborated against trusted tool, commit, channel, or
provider evidence. Old evidence can explain history but cannot silently prove a
new revision or deployment.

The proposed model requires an explicit evidence level for execution, model
judgment, visible UI, channel acceptance, and recipient receipt. These levels
must remain separate in evaluation reports and release notes.

The public background-terminal surface is an open design question. The
subagent.completed event emitted for a background task is a receipt, not proof
that the underlying work succeeded. Before any runtime contract treats it as a
terminal accessor, a typed authenticated runtime adapter must be proved at the
owning Eve lifecycle seam (or the smallest reviewed Eve patch must define that
seam). Until then, planning text must label terminal status as unknown or
derived from the available evidence.

## Steering, cancellation, and learning

Cancellation stops eligible future work and records the cancellation revision;
it does not undo an already dispatched side effect. New steering supersedes only
the selected objective revision and preserves unrelated tasks. Late worker
results are retained as evidence but cannot answer a newer or different
objective.

A bounded recovery sequence may retry a read when new evidence is likely. It
must not retry a write after dispatch could have reached the provider. It stops
when another attempt would add no evidence, then reports the partial result and
blocker.

Accretion is initially a reviewed engineering loop:

```text
sanitized observed failure or successful procedure
  -> small candidate recipe with preconditions and evidence
  -> synthetic regression and matched evaluation
  -> versioned authored Eve skill/doc/tool change
  -> measured reuse and explicit invalidation
```

User facts, episode summaries, and reusable procedures remain separate. Fetched
text, secret-bearing traces, and model self-claims are never promoted
automatically. There is no autonomous self-modification proposal.

## Resource and quality constraints

Resource accounting should expose tokens and cost where known, provider/browser
requests, retries, unwanted clarification or approval counts, retained-context
size, and loss of relevant constraints. Unknown values remain unknown. Runtime
counters inform planning but do not replace authoritative workspace budgets.

Context reduction and fewer tools are hypotheses to measure, not assumed
improvements. Measurements must compare matched tasks and equal task success.
The bounded PR #138 experiment found no speedup in its recorded comparison; it
is negative evidence, not a performance claim.

## Developer-agent and product Jory context

The developer agent operates in a repository and may read code, tests, plans,
and CI evidence under the repository's instructions. Its context is a
development projection: exact checkout and SHA, allowed paths, test gates,
review state, and unverified claims.

Product Jory operates for an authenticated workspace and user. Its context is a
product projection: verified identity and tenant scope, active agent revision,
conversation objective, approved capabilities, user-visible observations, and
delivery/reporting obligations. It must not inherit repository credentials,
developer-only authority, private review payloads, or assumptions from a
developer trace.

The projections may share vocabulary and evidence labels, but they do not share
authority. A developer test result can inform a product release decision only
through a reviewed, dated artifact. A product observation cannot authorize a
repository change.

Web chat, SendBlue, and a future iOS client are interaction projections of the
same server-owned task, evidence, approval, report, and delivery lifecycle.
They must not create separate mobile agent state or client-side authority.
Personalities and avatars may differ as presentation, while status facts remain
the same. For a cohort of parallel tasks, keep evidence per task and do not
force a report from the first unfinished worker. The initiating turn receives
a launch acknowledgment; a pending framework wake stays silent; a settled
framework wake sends one combined report. An explicit status request may
receive a truthful current-status report.

## Proposed interfaces and conceptual schema

The following is a conceptual contract for planning. It is **Proposed** and is
not an approved migration or public API:

```ts
type Evidence = {
  kind: "observed" | "derived" | "user-stated" | "unknown" | "stale";
  owner: string;
  scope: string;
  source: string;
  observedAt: string;
  expiresAt?: string;
  claim: string;
  ref?: string;
};

type CompletionState = {
  objectiveRevision: string;
  taskId: string;
  execution:
    | "prepared"
    | "approved"
    | "attempted"
    | "completed"
    | "failed"
    | "unknown"
    | "cancelled"
    | "blocked"
    | "partial";
  verification:
    "unverified" | "corroborated" | "verified" | "contradicted" | "stale";
  reporting:
    | "owed"
    | "composed"
    | "attempted"
    | "satisfied"
    | "unresolved"
    | "superseded";
  delivery:
    | "not-applicable"
    | "accepted"
    | "visible"
    | "recipient-received"
    | "failed"
    | "uncertain";
  evidence: Evidence[];
  openObligations: string[];
  nextAction?: string;
};
```

Implementations must extend existing completion and task types compatibly,
preserve legacy display behavior without fabricating verification, and prove
the lifecycle seams with runtime fixtures before committing to an API. Domain
failure classes should be added only when at least two real consumers need
them; useful bounded classes include invalid/stale target, authorization
needed, unsupported operation, throttled/transient read failure, uncertain
side effect, and permanent failure.

## Current code and contract pointers

These existing surfaces are the starting evidence for future implementation;
none is a completed implementation of this proposal:

- `src/lib/worker-events.ts` is a UI projection of worker events and must not
  become lifecycle authority.
- `src/lib/worker-completion.ts` owns the current bounded worker completion
  shape and is the compatibility seam for trusted result facts.
- `agent/lib/message-delivery.ts` owns the current per-turn final-delivery
  guard and must not be overloaded as cohort state.
- `agent/tools/messaging.ts` owns native text and reaction delivery behavior.
- Installed Eve task, hook, session, and state documentation defines the
  lifecycle seams that Plan 004 must probe. Hooks are observe-only; dynamic
  instructions inject context.

## Evidence owned by this design

The design direction was recorded on 2026-09-11 from the exact base
c88b8e69325439d503374bf6796befd5f37a585f. The sanitized live feedback was
observed against the production release at SHA 61b801c; this document was reviewed
against c88b8e6 and does not upgrade that dated observation into current proof.
Existing issue and PR references
remain historical until checked at a new head. The sanitized 2026-09-10 EDT
live feedback record says that actual images arrived and one approved synthetic
submit was verified; an automatic root response and the first explicit summary
question produced only a reaction, while a second explicit words request
produced a summary. This is a qualitative failure example, not a success-rate
claim, population reliability guarantee, or authorization to send more messages.

The work remains Proposed until its plans are implemented and verified with
owner files, RED and recovery cases, exact commands, issue dependencies,
paid/live gates, rollback, and stop conditions. Existing local/CI/provider
results stay in their dated source documents.

## Staged decisions and rejected ideas

Stage 1 is documentation, contract examples, and focused synthetic regressions
for completion reporting and provenance. Stage 2 can add compatible lifecycle
metadata after the owner and replay behavior are proven. Stage 3 can add
reviewed recipe reuse after matched evaluation and invalidation. Each stage must
preserve current approval, tenant, channel, and secret boundaries.

Rejected for this proposal:

- a universal event lake or scheduler;
- a model-written policy or automatic skill marketplace;
- one global done bit;
- treating provider acceptance, worker success, or JSON validity as truth;
- automatic resend after uncertain dispatch;
- arbitrary model upgrades or global prompt truncation;
- a second approval after a native approval;
- importing the unmerged PR #136 baseline or PR #138 optimization as current
  behavior.

The proposed changes do not alter agent-loop.html; the current runtime diagram
remains a diagram of implemented behavior.
