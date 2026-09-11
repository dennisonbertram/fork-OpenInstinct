import { defineState } from "eve/context";
import type { BackgroundTaskTerminalRecord } from "@/agent/lib/background-task-terminal";
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
  readonly workerCallId: string;
  readonly workerSessionId: string;
  readonly parentTurnId: string;
  readonly objectiveRevision: string;
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
}

const completion = defineState<CompletionState>(
  "completion.obligations",
  () => ({ tasks: [], cohorts: [], retired: [] })
);

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
  workerCallId: string;
  workerSessionId: string;
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
        workerCallId: input.workerCallId,
        workerSessionId: input.workerSessionId,
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
    if (
      task === undefined ||
      cohort === undefined ||
      task.parentTurnId !== terminal.parentTurnId ||
      task.workerSessionId !== terminal.childSessionId
    ) {
      return current;
    }

    const settled = {
      ...task,
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
 * Binds one report attempt to a cohort. Returns false when the cohort owes no
 * report, or when a different attempt already holds the obligation.
 */
export function beginCohortReport(
  cohortId: string,
  report: CohortReport
): boolean {
  let didBind = false;

  completion.update((current) => {
    const cohort = current.cohorts.find(
      (candidate) => candidate.cohortId === cohortId
    );
    if (cohort === undefined) return current;

    if (cohort.phase === "delivery_pending") {
      // The same attempt may re-announce itself; a second attempt in the same
      // turn may not take an obligation another call already holds.
      didBind =
        cohort.report?.turnId === report.turnId &&
        cohort.report.callId === report.callId;
      return current;
    }

    const owed =
      reportableCohorts().some(
        (candidate) => candidate.cohortId === cohortId
      ) ||
      // An uncertain write is never resent inside its own turn. A later turn is
      // the user asking again, which is a new obligation rather than a retry.
      (cohort.phase === "unconfirmed" &&
        cohort.report?.turnId !== report.turnId);
    if (!owed) return current;

    didBind = true;
    return {
      ...current,
      cohorts: current.cohorts.map((candidate) =>
        candidate.cohortId === cohortId
          ? { ...candidate, phase: "delivery_pending" as const, report }
          : candidate
      ),
    };
  });

  return didBind;
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
