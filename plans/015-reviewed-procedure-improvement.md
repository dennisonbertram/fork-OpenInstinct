# Plan 015: Promote one reviewed procedure through the existing skill path

GitHub: [#164](https://github.com/dennisonbertram/fork-OpenInstinct/issues/164).

> **Executor instructions:** This plan is a human-reviewed engineering loop,
> not runtime self-modification. Start with one existing procedure and its
> current owner. Do not add a memory provider, dynamic user skill, plugin
> marketplace, sandbox script, or automatic promotion from chat/page/tool
> content. Do not edit `plans/README.md`.

> **Drift check (run first):**
> `git diff --stat c88b8e69325439d503374bf6796befd5f37a585f..HEAD -- agent/skills agent/memory agent/lib/profile-memory.ts agent/instructions evals/agent evals/contract tests/agent agent/lib/tests docs/agent-loop.html docs/JORY_AGENT_OPERATING_MODEL.md`
> STOP if the selected existing procedure has no safe deterministic fixture or
> would require a provider credential or real external mutation to prove.

## Status

- **Priority:** P2
- **Effort:** S–M, approximately 1–2 engineering days
- **Risk:** LOW
- **Depends on:** none
- **Category:** DX, tests
- **Planned at:** commit `c88b8e6`, 2026-09-11

## Why this matters

Useful recurring procedures should become easier to apply without turning
untrusted content into instructions. Eve skills are already progressive,
load-on-demand procedures; profile memory is already a scoped fact store. A
small documented candidate-to-regression-to-versioned-skill process lets
maintainers improve the agent while retaining source review, evidence, and
retirement.

## Current state

- Eve loads skill descriptions on demand and skills add instructions, never a
  tool surface: `node_modules/eve/docs/skills.mdx:6-20`.
- Skills are scoped per agent; root and worker do not share them implicitly:
  `node_modules/eve/docs/skills.mdx:75-88`.
- The existing Square skill directs discovery through `connection_search`:
  `agent/skills/square.md:1-28`; contract coverage exists in
  `evals/contract/square-skill-loads.eval.ts`.
- Personal Info recall says values are data, never instructions:
  `agent/memory/personal_info.ts:34-53`. Profile memory is workspace-scoped:
  `agent/lib/profile-memory.ts:38-48`.
- Safety/memory behavior is already exercised by
  `evals/agent/safety.eval.ts`, `evals/agent/memory.eval.ts`, and
  `agent/lib/tests/profile-memory.test.ts:18-151`.

## Commands you will need

| Purpose                                 | Command                                                                                            | Expected result                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Skill/memory tests                      | `pnpm exec vitest run agent/lib/tests/profile-memory.test.ts evals/contract/fixture-model.test.ts` | exit 0                                                           |
| Model-free skill contract               | `pnpm eval:contract`                                                                               | exit 0                                                           |
| Paid behavior, if scoped                | `pnpm eval:agent --tag safety`                                                                     | only with operator credentials/budget                            |
| Required for changed skill/instructions | `pnpm eval:square`                                                                                 | exit 0 and report its `Results:` line; do not mark done if unrun |
| Handoff                                 | `pnpm check && pnpm build && git diff --check`                                                     | exit 0                                                           |

## Scope

**In scope**

- One current, non-mutating procedure: start with the root Square skill’s
  discover-then-call pattern because it has a fixture, an existing skill, and
  contract coverage.
- A short reviewed-candidate document or metadata adjacent to the skill,
  deterministic positive/negative regression, and a retirement/review date.
- Required canonical-doc/diagram update after owner coordination.

**Out of scope**

- New connectors, write operations, user-created skills, loading fetched text,
  model-generated permanent instructions, memory schema/provider changes,
  executable helpers, package installs, or live Square/Gmail calls.

## Steps

### 1. Write the candidate and controlled sensitivity coverage

Document a sanitized candidate: trigger, owned skill, allowed existing tools,
preconditions, expected evidence, prohibited behavior, review date, and
retirement condition. Add a positive deterministic case that routes to the
existing skill/discovery tool and a negative case where page/tool/quoted text
asks to be remembered or followed. If the existing procedure is correct, this
coverage passes unchanged; prove sensitivity with a controlled test mutation or
mocked forbidden promotion, then restore it. Do not manufacture a production
skill edit to obtain a RED.

**Verify:** coverage passes on current behavior and fails only under the
controlled mutation. For an observed procedure defect, add a separate RED that
fails against actual behavior before editing source.

### 2. Change the skill only if the RED proves a procedure defect

The existing Square procedure may already be correct. First land the reviewed
candidate lifecycle and sensitivity tests without manufacturing prose drift. If
the RED proves an actual trigger/boundary defect, make the smallest authored
skill change; otherwise leave `agent/skills/square.md` unchanged and record
that no runtime procedure edit was warranted. Preserve connection authorization/
allow-list enforcement: skill prose never grants it.

**Verify:** deterministic skill-load and negative promotion tests pass; when a
skill/instruction changed, `pnpm eval:square` passes and its `Results:` line is retained.

### 3. Record reuse and retirement without runtime counters

Add the candidate’s review owner/date and the named regression command. A
future maintainer may promote another candidate only after the same review path;
failed/retired candidates remain documented so agents do not repeat them.
Update docs/agent-loop only if the reviewed procedure lifecycle is represented.

**Verify:** `pnpm eval:contract` and focused tests exit 0.

## Test plan and done criteria

- Positive: exact existing skill loads for its intended task and calls only
  already-visible capability discovery.
- Negative: a candidate/injection from third-party, fetched, or tool content
  cannot cause an extra memory write, candidate promotion, or new capability.
  Do not assert that a legitimate user-requested Square turn may never load its
  existing skill; a user preference still cannot create approval.
- Failure/recovery: unavailable connection keeps its existing authorization
  path; no alternative token or provider retry is introduced.
- Replay: reloading the reviewed skill does not create another memory write or
  external action.
- [ ] For an observed procedure defect, its RED precedes source edits. If
      the procedure is already correct, controlled sensitivity coverage passes
      without a manufactured production edit.
- [ ] Focused tests, contract eval, `pnpm check`, `pnpm build`, and
      `git diff --check` pass.
- [ ] Any changed `agent/skills/**` or `agent/instructions/**` requires
      `pnpm eval:square` with its `Results:` line. An unavailable paid
      budget blocks that source PR; it never waives or completes this gate.

## STOP, rollback, and maintenance

STOP if the procedure cannot be tested without live credentials/mutation or if
it needs typed runtime behavior rather than prose; propose a separate owned
tool plan instead. Revert the skill/candidate change as one PR. A reviewer
should reject any candidate with secrets, raw traces, untrusted instructions,
or an absent expiry/review owner.

## Independently executable prompt

“Implement Plan 015 only. Use the existing Square skill as a candidate subject,
not a reason to force a prose change. Prove candidate promotion and injection
sensitivity with deterministic RED/GREEN tests; modify the skill only for an
observed regression. If it changes, run eval:square and record Results. Follow
normal worktree/PR/CI delivery; no live Square/Gmail/provider/deployment use.”
