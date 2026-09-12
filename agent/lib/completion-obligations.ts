import { defineState } from "eve/context";
import {
  findCompletionReportPartsForCohorts,
  type CompletionReportPartRecord,
} from "@/db/services/completion-report-attempts";
import {
  backgroundTaskMembers,
  backgroundTaskTerminals,
  type BackgroundTaskTerminalRecord,
} from "@/agent/lib/background-task-terminal";
import { taskCompletionOutputSchema } from "@/lib/worker-completion";

/**
 * Root-session record of what background work was admitted, what it produced,
 * and whether a completion report is owed.
 *
 * Three separations are deliberate. Execution (did a task settle) comes only
 * from Plan 004's typed terminal. Verification (is a claim supported) is a
 * per-fact provenance label, and a worker's own success label is never more
 * than `worker_assertion`. Reporting (is a summary owed, delivered, or
 * unconfirmed) is this module's cohort phase, and a provider accepting a send
 * is not a recipient reading it.
 *
 * State lives in the root Eve session only. It never crosses a subagent
 * boundary and is not a task database: capacity is bounded, and a resolved,
 * reported cohort retires to one digest rather than growing without limit.
 */

type EvidenceKind =
  | "observed"
  | "executor_receipt"
  | "worker_assertion"
  | "unknown";

export interface BoundedFact {
  readonly claim: string;
  readonly evidence: EvidenceKind;
  /** Scoped reference to an artifact owned by this root session, when one exists. */
  readonly reference?: string;
}

interface TaskTerminal {
  readonly status: "completed" | "failed" | "cancelled";
  readonly facts: readonly BoundedFact[];
  /** Set when facts were dropped at the cap; the omitted facts are not inferred. */
  readonly truncatedUnknown?: true;
}

type CohortPhase =
  | "awaiting_terminal"
  | "must_report"
  | "delivery_pending"
  | "delivered"
  | "unconfirmed"
  | "blocked"
  | "cancelled"
  | "superseded";

export interface TaskRecord {
  readonly taskId: string;
  readonly parentTurnId: string;
  readonly objectiveRevision: string;
  /**
   * The child session and turn that ran this task. Unknown until it settles:
   * a pending task index entry carries no child identity, so these are
   * recorded from the terminal rather than expected in advance.
   */
  readonly workerSessionId?: string;
  readonly workerTurnId?: string;
  readonly terminal?: TaskTerminal;
}

export interface CohortReport {
  readonly turnId: string;
  readonly callId: string;
}

export interface CohortRecord {
  readonly cohortId: string;
  readonly objectiveRevision: string;
  readonly taskIds: readonly string[];
  readonly phase: CohortPhase;
  readonly report?: CohortReport;
  /**
   * Which attempt at this cohort's summary the current report is. Zero for the
   * first. A later turn asking again is a new revision rather than a retry, so
   * the durable claim for its parts cannot collide with an earlier attempt that
   * may already have reached a provider.
   */
  readonly reportRevision: number;
  readonly blockedReason?: string;
}

export interface RetiredCohortSummary {
  readonly cohortId: string;
  readonly objectiveRevision: string;
  readonly outcome: "completed" | "failed" | "cancelled" | "mixed";
  readonly reportState: "delivered" | "unconfirmed";
  readonly report?: CohortReport;
  /** One short line per task: identity, terminal status, strongest evidence kind. */
  readonly evidenceDigest: readonly string[];
}

export const completionCapacity = {
  openCohorts: 8,
  tasksPerCohort: 8,
  factsPerTask: 8,
  retiredSummaries: 32,
} as const;

interface CompletionState {
  readonly tasks: readonly TaskRecord[];
  readonly cohorts: readonly CohortRecord[];
  readonly retired: readonly RetiredCohortSummary[];
  /** Records whether the one safe legacy recovery pass has run for this session. */
  readonly recovery?:
    | { readonly kind: "pending"; readonly taskIds: readonly string[] }
    | { readonly kind: "complete" };
}

const completion = defineState<CompletionState>(
  "completion.obligations",
  () => ({ tasks: [], cohorts: [], retired: [] })
);

function isDeliveryPart(part: string) {
  return (
    part === "text" || part === "attachment" || part.startsWith("media-send:")
  );
}

function isVariableMediaPart(part: string) {
  return part.startsWith("media-upload:") || part.startsWith("media-send:");
}

function bundledDeliveryPartKey(
  part: CompletionReportPartRecord
): string | undefined {
  if (part.bundleId === undefined || part.bundleCount === undefined)
    return undefined;
  return `${part.bundleId}\u0000${part.physicalPart}`;
}

export type AdmissionResult =
  | { readonly admitted: true; readonly cohortId: string }
  | { readonly admitted: false; readonly reason: string };

function isOpen(cohort: CohortRecord) {
  return cohort.phase !== "delivered" && cohort.phase !== "superseded";
}

/**
 * Admits one background task before its worker is dispatched.
 *
 * The caller must refuse to dispatch when admission fails: a task that already
 * ran but was never admitted would settle with nobody owing its report.
 */
export function admitTask(input: {
  taskId: string;
  parentTurnId: string;
  objectiveRevision: string;
}): AdmissionResult {
  const state = completion.get();
  const existing = state.tasks.find((task) => task.taskId === input.taskId);
  if (existing) return { admitted: true, cohortId: existing.parentTurnId };

  const cohort = state.cohorts.find(
    (candidate) => candidate.cohortId === input.parentTurnId
  );

  if (cohort === undefined) {
    const openCohorts = state.cohorts.filter(isOpen).length;
    if (openCohorts >= completionCapacity.openCohorts) {
      return {
        admitted: false,
        reason: `This session already tracks ${String(completionCapacity.openCohorts)} unfinished background cohorts, so no further background work can be started until one is reported.`,
      };
    }
  } else if (cohort.taskIds.length >= completionCapacity.tasksPerCohort) {
    return {
      admitted: false,
      reason: `This request already started ${String(completionCapacity.tasksPerCohort)} background tasks, which is the limit for one request.`,
    };
  } else if (!isOpen(cohort) || cohort.phase === "cancelled") {
    return {
      admitted: false,
      reason: `The cohort for this request is already ${cohort.phase} and cannot take another task.`,
    };
  }

  completion.update((current) => ({
    ...current,
    tasks: [
      ...current.tasks,
      {
        taskId: input.taskId,
        parentTurnId: input.parentTurnId,
        objectiveRevision: input.objectiveRevision,
      },
    ],
    cohorts:
      cohort === undefined
        ? [
            ...current.cohorts,
            {
              cohortId: input.parentTurnId,
              objectiveRevision: input.objectiveRevision,
              taskIds: [input.taskId],
              phase: "awaiting_terminal" as const,
              reportRevision: 0,
            },
          ]
        : current.cohorts.map((candidate) =>
            candidate.cohortId === input.parentTurnId
              ? { ...candidate, taskIds: [...candidate.taskIds, input.taskId] }
              : candidate
          ),
  }));

  return { admitted: true, cohortId: input.parentTurnId };
}

export interface TerminalOutcome {
  /** Whether a tracked task matched the terminal's typed identity. */
  readonly matched: boolean;
  /** Whether this terminal is what made an owed report newly known. */
  readonly cohortBecameReportable: boolean;
}

/**
 * Promotes one Plan 004 typed terminal onto the task it identifies.
 *
 * Identity must match on task, worker session, and parent turn. Facts carry
 * their own provenance; this function never upgrades a worker's claim.
 */
export function recordTerminal(
  terminal: BackgroundTaskTerminalRecord,
  facts: readonly BoundedFact[]
): TerminalOutcome {
  let outcome: TerminalOutcome = {
    matched: false,
    cohortBecameReportable: false,
  };

  completion.update((current) => {
    const task = current.tasks.find(
      (candidate) => candidate.taskId === terminal.taskId
    );
    const cohort = current.cohorts.find(
      (candidate) => candidate.cohortId === task?.parentTurnId
    );
    // Identity is task plus parent turn, the two things known at admission.
    // The child session is not a third check: it does not exist until the task
    // settles, so it arrives here as evidence and is recorded below. Eve's own
    // index schema already refines that a cached terminal view matches its
    // entry, and the adapter rejects a terminal whose identity disagrees with
    // the task that owns it.
    if (
      task === undefined ||
      cohort === undefined ||
      task.parentTurnId !== terminal.parentTurnId
    ) {
      return current;
    }

    const settled = {
      ...task,
      workerSessionId: terminal.childSessionId,
      workerTurnId: terminal.childTurnId,
      terminal: { status: terminal.status, ...bound(facts) },
    };
    const tasks = current.tasks.map((candidate) =>
      candidate.taskId === task.taskId ? settled : candidate
    );
    // The phase guard is what makes this once-only: the cohort leaves
    // `awaiting_terminal` on the terminal that completes the set, so a replayed
    // or late terminal can never announce the obligation a second time.
    const becameReportable =
      cohort.phase === "awaiting_terminal" &&
      cohort.taskIds.every((taskId) =>
        tasks.some(
          (candidate) =>
            candidate.taskId === taskId && candidate.terminal !== undefined
        )
      );

    outcome = { matched: true, cohortBecameReportable: becameReportable };
    return {
      ...current,
      tasks,
      cohorts: becameReportable
        ? current.cohorts.map((candidate) =>
            candidate.cohortId === cohort.cohortId
              ? { ...candidate, phase: "must_report" as const }
              : candidate
          )
        : current.cohorts,
    };
  });

  return outcome;
}

/**
 * Cohorts that owe a truthful written report right now.
 *
 * A cancelled cohort still qualifies when some task retained evidence of an
 * effect that actually reached the world; a cancellation does not unsend it.
 * A cohort whose report is already bound, delivered, superseded, or still
 * awaiting a member never qualifies.
 */
export function reportableCohorts(): readonly CohortRecord[] {
  const state = completion.get();
  return state.cohorts.filter((cohort) => {
    if (cohort.phase === "must_report") return true;
    if (cohort.phase !== "cancelled") return false;
    return state.tasks.some(
      (task) =>
        cohort.taskIds.includes(task.taskId) &&
        (task.terminal?.facts ?? []).some(
          (candidate) =>
            candidate.evidence === "observed" ||
            candidate.evidence === "executor_receipt"
        )
    );
  });
}

/** Every cohort this session holds, for a read-only projection over them. */
export function allCohorts(): readonly CohortRecord[] {
  return completion.get().cohorts;
}

export function cohortFor(cohortId: string): CohortRecord | undefined {
  return completion
    .get()
    .cohorts.find((cohort) => cohort.cohortId === cohortId);
}

export function taskRecords(cohortId: string): readonly TaskRecord[] {
  return completion
    .get()
    .tasks.filter((task) => task.parentTurnId === cohortId);
}

export function retiredSummaries(): readonly RetiredCohortSummary[] {
  return completion.get().retired;
}

/**
 * Whether one cohort accepts this attempt, and what it becomes if it does.
 *
 * Decides without writing, so several cohorts can be judged together and the
 * whole set either applied or abandoned. A cohort that accepts without changing
 * -- the same call re-announcing an attempt it already holds -- returns no
 * replacement, which is how a rollback avoids inventing a phase for it.
 */
function cohortAfterBinding(
  cohort: CohortRecord | undefined,
  report: CohortReport,
  owedNow: ReadonlySet<string>
) {
  const refuses = { accepts: false, next: undefined };
  if (cohort === undefined) return refuses;

  if (cohort.phase === "delivery_pending") {
    // The same attempt may re-announce itself; a second attempt in the same
    // turn may not take an obligation another call already holds. Either way
    // there is nothing to write.
    return {
      accepts:
        cohort.report?.turnId === report.turnId &&
        cohort.report.callId === report.callId,
      next: undefined,
    };
  }

  const owed =
    owedNow.has(cohort.cohortId) ||
    // An uncertain write is never resent inside its own turn. A later turn is
    // the user asking again, which is a new obligation rather than a retry.
    (cohort.phase === "unconfirmed" && cohort.report?.turnId !== report.turnId);
  if (!owed) return refuses;

  // A different known report turn is a new attempt even when an intervening
  // lifecycle change moved the cohort out of `unconfirmed`. Recovered
  // unconfirmed cohorts have no prior turn metadata, but their durable
  // revision still reserves the old physical effect, so they advance too.
  const priorTurn = cohort.report?.turnId;
  const isNewAttempt =
    (priorTurn !== undefined && priorTurn !== report.turnId) ||
    (cohort.phase === "unconfirmed" && priorTurn === undefined);
  return {
    accepts: true,
    next: {
      ...cohort,
      phase: "delivery_pending" as const,
      report,
      reportRevision: isNewAttempt
        ? cohort.reportRevision + 1
        : cohort.reportRevision,
    },
  };
}

/**
 * Binds one report attempt to every named cohort, or to none of them.
 *
 * All or nothing, in one state update. A partial bind would discharge a cohort's
 * obligation with a message the caller is about to refuse to send, leaving
 * settled work with no report and nothing owed to produce one.
 *
 * Nothing is written when any cohort refuses, which matters more than it looks:
 * an earlier version bound each cohort in turn and undid the earlier ones by
 * setting them back to `must_report`. That guessed at their prior phase. A
 * cohort can be bound out of `unconfirmed`, and one already held by this same
 * call is accepted without being changed at all, so "put it back to owing a
 * report" silently rewrote states that were never owed.
 *
 * Returns the cohorts now bound to this attempt. An empty result means the
 * caller must not treat this send as the summary.
 */
export function bindCohortReports(
  cohortIds: readonly string[],
  report: CohortReport
): readonly string[] {
  let boundCohorts: readonly string[] = [];

  completion.update((current) => {
    const owedNow = new Set(
      reportableCohorts().map((candidate) => candidate.cohortId)
    );
    const replacements = new Map<string, CohortRecord>();
    for (const cohortId of cohortIds) {
      const decision = cohortAfterBinding(
        current.cohorts.find((candidate) => candidate.cohortId === cohortId),
        report,
        owedNow
      );
      if (!decision.accepts) return current;
      if (decision.next) replacements.set(cohortId, decision.next);
    }

    boundCohorts = cohortIds;
    return {
      ...current,
      cohorts: current.cohorts.map(
        (candidate) => replacements.get(candidate.cohortId) ?? candidate
      ),
    };
  });

  return boundCohorts;
}

/**
 * Binds one report attempt to a cohort. Returns false when the cohort owes no
 * report, or when a different attempt already holds the obligation.
 */
export function beginCohortReport(
  cohortId: string,
  report: CohortReport
): boolean {
  return bindCohortReports([cohortId], report).length > 0;
}

/**
 * The cohort whose report attempt is exactly this turn and call.
 *
 * Both parts must match. A result carrying another call's id belongs to another
 * attempt, and settling this cohort from it would record an outcome this report
 * never had.
 */
export function cohortForReportAttempt(
  report: CohortReport
): CohortRecord | undefined {
  return completion
    .get()
    .cohorts.find(
      (candidate) =>
        candidate.report?.turnId === report.turnId &&
        candidate.report.callId === report.callId
    );
}

/**
 * Every cohort whose report attempt holds this call.
 *
 * A call id identifies one tool call, and one call can answer several owed
 * cohorts at once, so this returns all of them.
 * This exists because the per-turn delivery record holds only the most recent
 * attempt: once a later turn replaces it, an earlier turn's provider result can
 * no longer find the obligation it owns through that record.
 */
export function cohortsForReportCall(callId: string): readonly CohortRecord[] {
  return completion
    .get()
    .cohorts.filter((candidate) => candidate.report?.callId === callId);
}

/**
 * Returns every cohort this call bound to owing a report again.
 *
 * For the one case that knows the send never happened: the budget check rejects
 * before anything is dispatched, so no part was claimed and no message left. The
 * cohort must go back to owing a summary rather than be recorded as delivered
 * (the user never got it) or as unconfirmed (that means a send may have arrived
 * and must not be repeated, which would strand the obligation for good).
 *
 * Only for a caller that can prove nothing was dispatched. Anything uncertain
 * belongs in `unconfirmed`, where it is never resent automatically.
 */
export function abandonBoundReport(callId: string): void {
  for (const cohort of cohortsForReportCall(callId)) {
    if (cohort.phase !== "delivery_pending") continue;
    completion.update((current) => ({
      ...current,
      cohorts: current.cohorts.map((candidate) =>
        candidate.cohortId === cohort.cohortId
          ? { ...candidate, phase: "must_report" as const, report: undefined }
          : candidate
      ),
    }));
  }
}

/** Records whether the channel accepted the bound report attempt. */
export function settleCohortReport(cohortId: string, accepted: boolean): void {
  setPhase(cohortId, accepted ? "delivered" : "unconfirmed", {
    from: ["delivery_pending"],
  });
}

/** Records that a report is owed but cannot be produced, with a truthful reason. */
export function blockCohort(cohortId: string, reason: string): void {
  setPhase(cohortId, "blocked", { reason });
}

/**
 * Marks a cohort cancelled. Already dispatched effects stay reportable: a
 * cancellation does not erase what already happened.
 */
export function cancelCohort(cohortId: string): void {
  setPhase(cohortId, "cancelled");
}

/**
 * Retires a cohort to a newer objective. A late terminal may still update its
 * own historical task record but can never satisfy the newer objective.
 */
export function supersedeCohort(cohortId: string): void {
  setPhase(cohortId, "superseded");
}

/**
 * Moves one cohort's phase.
 *
 * `delivered` is always terminal: a report the user already received cannot be
 * downgraded by something that happens afterwards. `from` narrows a transition
 * to the phases it is defined for.
 */
function setPhase(
  cohortId: string,
  phase: CohortPhase,
  options?: { readonly from?: readonly CohortPhase[]; readonly reason?: string }
): void {
  completion.update((current) => {
    const cohort = current.cohorts.find(
      (candidate) => candidate.cohortId === cohortId
    );
    if (cohort === undefined || cohort.phase === "delivered") return current;
    if (options?.from !== undefined && !options.from.includes(cohort.phase)) {
      return current;
    }
    const moved: CohortRecord = { ...cohort, phase };
    return {
      ...current,
      cohorts: current.cohorts.map((candidate) =>
        candidate.cohortId === cohortId
          ? options?.reason === undefined
            ? moved
            : { ...moved, blockedReason: options.reason }
          : candidate
      ),
    };
  });
}

const evidenceStrength: readonly EvidenceKind[] = [
  "observed",
  "executor_receipt",
  "worker_assertion",
  "unknown",
];

function strongestEvidence(facts: readonly BoundedFact[]): EvidenceKind {
  return (
    evidenceStrength.find((kind) =>
      facts.some((candidate) => candidate.evidence === kind)
    ) ?? "unknown"
  );
}

/**
 * Retires a delivered cohort's detailed facts to one bounded summary so later
 * questions keep provenance without retaining raw worker content.
 *
 * Only a delivered cohort may retire. Every unresolved obligation, and every
 * cohort whose effect is still outstanding, is kept in full instead.
 */
export function retireCohort(cohortId: string): boolean {
  let retired = false;

  completion.update((current) => {
    const cohort = current.cohorts.find(
      (candidate) => candidate.cohortId === cohortId
    );
    if (cohort?.phase !== "delivered") return current;

    const tasks = current.tasks.filter(
      (task) => task.parentTurnId === cohortId
    );
    // A task may join a cohort that already owes a report, so a delivered
    // cohort can still hold a member that never reported. Retiring it would
    // drop that member's record and summarise the cohort as though every task
    // had finished. Keep it in full until the straggler settles.
    const terminals = tasks.flatMap((task) =>
      task.terminal === undefined ? [] : [task.terminal.status]
    );
    if (terminals.length !== tasks.length) return current;

    const statuses = new Set(terminals);
    const outcome =
      statuses.size === 1 ? ([...statuses][0] ?? "mixed") : ("mixed" as const);

    const summary: RetiredCohortSummary = {
      cohortId,
      objectiveRevision: cohort.objectiveRevision,
      outcome,
      reportState: "delivered",
      report: cohort.report,
      // Every task here has a terminal, or the guard above kept the cohort.
      evidenceDigest: tasks.flatMap((task) =>
        task.terminal === undefined
          ? []
          : [
              `${task.taskId}: ${task.terminal.status}, strongest evidence ${strongestEvidence(task.terminal.facts)}${task.terminal.truncatedUnknown === true ? ", some facts truncated" : ""}`,
            ]
      ),
    };

    retired = true;
    const kept = [...current.retired, summary];
    return {
      tasks: current.tasks.filter((task) => task.parentTurnId !== cohortId),
      cohorts: current.cohorts.filter(
        (candidate) => candidate.cohortId !== cohortId
      ),
      // At the cap the oldest fully reported summary goes; a later question
      // about it must say the evidence is no longer retained.
      retired: kept.slice(-completionCapacity.retiredSummaries),
    };
  });

  return retired;
}

function bound(facts: readonly BoundedFact[]): {
  readonly facts: readonly BoundedFact[];
  readonly truncatedUnknown?: true;
} {
  return facts.length <= completionCapacity.factsPerTask
    ? { facts }
    : {
        facts: facts.slice(0, completionCapacity.factsPerTask),
        truncatedUnknown: true,
      };
}

/**
 * Classifies a worker's terminal output into bounded facts with provenance.
 *
 * A worker's own `status` and prose are `worker_assertion` and nothing more.
 * An image artifact the root session owns corroborates an `observed` fact. A
 * payload this code cannot classify yields one explicit `unknown` fact rather
 * than a fabricated result, which is how legacy records stay displayable
 * without being upgraded to verified.
 */
export function factsFromWorkerCompletion(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- this IS the parsing boundary: a worker's terminal output arrives unvalidated and is run through taskCompletionOutputSchema immediately below.
  output: unknown,
  options?: { readonly ownedArtifactIds?: readonly string[] }
) {
  const parsed = taskCompletionOutputSchema.safeParse(output);
  if (!parsed.success) {
    return bound([
      {
        claim:
          "The worker returned a result this root could not classify, so nothing about it is verified.",
        evidence: "unknown",
      },
    ]);
  }

  const owned = new Set(options?.ownedArtifactIds ?? []);
  return bound([
    { claim: parsed.data.message, evidence: "worker_assertion" },
    ...parsed.data.images
      .filter((image) => owned.has(image.id))
      .map((image) => ({
        claim: image.label,
        evidence: "observed" as const,
        reference: image.id,
      })),
  ]);
}

/**
 * Brings this session's obligation records in line with what the framework
 * says about its background tasks.
 *
 * Called once per root step. Admission and terminal promotion are both
 * idempotent, so repeating this is free and a replayed step cannot double
 * count.
 *
 * Facts are deliberately conservative here: no artifact ownership is supplied,
 * so a worker's images stay `worker_assertion` rather than being promoted to
 * `observed`. Under-claiming is the safe direction; a caller that can verify
 * the root session owns an artifact may classify it more strongly.
 */
export async function reconcileBackgroundTasks(input?: {
  readonly workspaceId: string;
  readonly rootSessionId: string;
}): Promise<void> {
  const before = completion.get();
  if (before.recovery === undefined) {
    // Only an empty slot is reconstructed history. Existing state is already
    // an admission record and must retain its ordinary reporting lifecycle.
    completion.update((current) =>
      current.tasks.length === 0 && current.cohorts.length === 0
        ? {
            ...current,
            recovery: {
              kind: "pending" as const,
              taskIds: backgroundTaskMembers().map((member) => member.taskId),
            },
          }
        : { ...current, recovery: { kind: "complete" as const } }
    );
  }
  for (const member of backgroundTaskMembers()) {
    admitTask({
      taskId: member.taskId,
      parentTurnId: member.parentTurnId,
      // A cohort is its parent turn, so that turn identifies the objective the
      // task was started for. Detecting a *newer* objective is steering, which
      // Plan 008 owns.
      objectiveRevision: member.parentTurnId,
    });
  }

  for (const terminal of backgroundTaskTerminals()) {
    recordTerminal(terminal, factsFromWorkerCompletion(terminal.output).facts);
  }

  const recovery = completion.get().recovery;
  if (input === undefined || recovery?.kind !== "pending") return;
  const taskIds = new Set(recovery.taskIds);
  const cohorts = completion
    .get()
    .cohorts.filter(
      (cohort) =>
        cohort.phase === "must_report" &&
        cohort.taskIds.some((taskId) => taskIds.has(taskId))
    );
  const parts = await findCompletionReportPartsForCohorts({
    cohortIds: cohorts.map((cohort) => cohort.cohortId),
    rootSessionId: input.rootSessionId,
    workspaceId: input.workspaceId,
  });
  // No durable part exists for this reconstructed batch. It may be the first
  // normal task terminal after a state loss, so preserve its ordinary owed
  // report rather than silently converting it into historical uncertainty.
  if (parts.length === 0) {
    completion.update((current) => ({
      ...current,
      recovery: { kind: "complete" as const },
    }));
    return;
  }
  const latestRevision = new Map<string, number>();
  for (const part of parts) {
    const prior = latestRevision.get(part.cohortId);
    if (prior === undefined || part.reportRevision > prior)
      latestRevision.set(part.cohortId, part.reportRevision);
  }

  // A bundled row represents one member of one physical effect. Credit it only
  // when the durable rows show the exact complete roster accepted that effect.
  // This rejects partial, inconsistent, or mixed-state bundles without trying
  // to infer whether a provider may have received the omitted members.
  const bundledDeliveryParts = new Map<string, (typeof parts)[number][]>();
  for (const part of parts) {
    if (!isDeliveryPart(part.physicalPart)) continue;
    const key = bundledDeliveryPartKey(part);
    if (key === undefined) continue;
    const group = bundledDeliveryParts.get(key) ?? [];
    group.push(part);
    bundledDeliveryParts.set(key, group);
  }
  const completeAcceptedBundleParts = new Set<string>();
  for (const [key, group] of bundledDeliveryParts) {
    const count = group[0]?.bundleCount;
    const members = new Set(
      group.map(
        (part) => `${part.cohortId}\u0000${String(part.reportRevision)}`
      )
    );
    if (
      count !== undefined &&
      Number.isSafeInteger(count) &&
      count > 0 &&
      group.length === count &&
      members.size === count &&
      group.every(
        (part) => part.bundleCount === count && part.state === "accepted"
      )
    )
      completeAcceptedBundleParts.add(key);
  }

  const delivered = new Set<string>();
  for (const cohort of cohorts) {
    const revision = latestRevision.get(cohort.cohortId);
    if (revision === undefined) continue;
    const partsForRevision = parts.filter(
      (part) =>
        part.cohortId === cohort.cohortId && part.reportRevision === revision
    );
    const deliveryParts = partsForRevision.filter((part) =>
      isDeliveryPart(part.physicalPart)
    );
    // SendBlue sends each media item separately. The ledger records accepted
    // effects per item, but has no durable media-count or final-item marker,
    // so it cannot prove a recovered subset was the entire user-visible set.
    const hasUnboundedMediaRoster = partsForRevision.some((part) =>
      isVariableMediaPart(part.physicalPart)
    );
    const allDeliveryPartsAccepted = deliveryParts.every((part) => {
      if (part.state !== "accepted") return false;
      if (part.bundleId === undefined && part.bundleCount === undefined)
        return true;
      const bundleKey = bundledDeliveryPartKey(part);
      return (
        bundleKey !== undefined && completeAcceptedBundleParts.has(bundleKey)
      );
    });
    if (
      deliveryParts.length > 0 &&
      allDeliveryPartsAccepted &&
      !hasUnboundedMediaRoster
    )
      delivered.add(cohort.cohortId);
  }
  completion.update((current) => ({
    ...current,
    recovery: { kind: "complete" as const },
    cohorts: current.cohorts.map((cohort) => {
      if (!cohorts.some((candidate) => candidate.cohortId === cohort.cohortId))
        return cohort;
      // A legacy row names one cohort only. It cannot prove its old physical
      // message covered a sibling, so missing or uncertain siblings stay
      // unconfirmed and never force a fresh unrelated user reply.
      return {
        ...cohort,
        reportRevision:
          latestRevision.get(cohort.cohortId) ?? cohort.reportRevision,
        phase: delivered.has(cohort.cohortId)
          ? ("delivered" as const)
          : ("unconfirmed" as const),
      };
    }),
  }));
}
