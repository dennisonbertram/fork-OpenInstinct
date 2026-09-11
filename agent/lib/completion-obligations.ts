import { defineState } from "eve/context";
import type { BackgroundTaskTerminalRecord } from "@/agent/lib/background-task-terminal";

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

export type EvidenceKind =
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

export interface TaskTerminal {
  readonly status: "completed" | "failed" | "cancelled";
  readonly facts: readonly BoundedFact[];
  /** Set when facts were dropped at the cap; the omitted facts are not inferred. */
  readonly truncatedUnknown?: true;
}

export type CohortPhase =
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

/** Phases whose obligation is unresolved and must never be evicted or retired. */
const protectedPhases: readonly CohortPhase[] = [
  "must_report",
  "delivery_pending",
  "unconfirmed",
  "blocked",
];

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
        reason: `This session already tracks ${completionCapacity.openCohorts} unfinished background cohorts, so no further background work can be started until one is reported.`,
      };
    }
  } else if (cohort.taskIds.length >= completionCapacity.tasksPerCohort) {
    return {
      admitted: false,
      reason: `This request already started ${completionCapacity.tasksPerCohort} background tasks, which is the limit for one request.`,
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
  void terminal;
  void facts;
  // Settlement is implemented in the following commit; see the RED suite.
  return { matched: false, cohortBecameReportable: false };
}

/** Cohorts that owe a truthful written report right now. */
export function reportableCohorts(): readonly CohortRecord[] {
  return [];
}

export function cohortFor(cohortId: string): CohortRecord | undefined {
  return completion.get().cohorts.find((cohort) => cohort.cohortId === cohortId);
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
  void cohortId;
  void report;
  return false;
}

/** Records whether the channel accepted the bound report attempt. */
export function settleCohortReport(cohortId: string, accepted: boolean): void {
  void cohortId;
  void accepted;
}

/** Records that a report is owed but cannot be produced, with a truthful reason. */
export function blockCohort(cohortId: string, reason: string): void {
  void cohortId;
  void reason;
}

/**
 * Marks a cohort cancelled. Already dispatched effects stay reportable: a
 * cancellation does not erase what already happened.
 */
export function cancelCohort(cohortId: string): void {
  void cohortId;
}

/**
 * Retires a cohort to a newer objective. A late terminal may still update its
 * own historical task record but can never satisfy the newer objective.
 */
export function supersedeCohort(cohortId: string): void {
  void cohortId;
}

/**
 * Retires a delivered cohort's detailed facts to one bounded summary so later
 * questions keep provenance without retaining raw worker content.
 */
export function retireCohort(cohortId: string): boolean {
  void cohortId;
  return false;
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
  output: unknown,
  options?: { readonly ownedArtifactIds?: readonly string[] }
): { readonly facts: readonly BoundedFact[]; readonly truncatedUnknown?: true } {
  void output;
  void options;
  return { facts: [] };
}

export { protectedPhases };
