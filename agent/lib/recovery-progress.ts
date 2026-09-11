import {
  taskRecords,
  type BoundedFact,
} from "@/agent/lib/completion-obligations";

/**
 * What a root may legally do next after background work stopped short.
 *
 * The rule worth stating first, because it is the one that protects a user: an
 * action that was dispatched but never confirmed must not be repeated
 * automatically. Repeating it is safe only if it changed nothing, and that is
 * precisely what is unknown.
 *
 * These records do not say whether a dispatched action read or wrote, so this
 * does not claim to know. Treating an unconfirmed effect as unrepeatable is the
 * conservative reading, and it is stated as uncertainty about the effect rather
 * than as a finding that a write occurred.
 *
 * This reads the completion records and decides. It does not retry anything,
 * re-deliver anything, or invent a taxonomy of errors: a disposition is only
 * claimed when the recorded evidence supports it.
 */

/** Dispositions derivable from what the completion records actually carry. */
type RecoveryDisposition =
  /** Every member settled and at least one claim is corroborated. */
  | "verified_success"
  /** Members settled, but nothing stronger than the worker's own word. */
  | "settled_unverified"
  /**
   * A dispatched action whose outcome this session cannot confirm. Not called a
   * write: the records show a receipt, not whether repeating it is safe.
   */
  | "uncertain_effect"
  /** It stopped without evidence that anything was dispatched. */
  | "stopped_without_dispatch"
  /** Still running; there is nothing to recover yet. */
  | "awaiting";

/** The single next step this disposition permits. */
type RecoveryNextStep =
  /** Say what happened; the work is done. */
  | "report"
  /** Say what is known and that the outcome is unknown. Do not act again. */
  | "report_uncertain"
  /** Ask the user; a machine cannot decide this one. */
  | "ask_user"
  /** Nothing yet. */
  | "wait";

export interface RecoveryProgress {
  readonly disposition: RecoveryDisposition;
  readonly nextStep: RecoveryNextStep;
  /** Claims corroborated by something better than the worker's own word. */
  readonly verifiedCheckpoints: readonly string[];
  /** What stopped short, stated as unknown rather than guessed. */
  readonly unknownRemainder: readonly string[];
  /** How many tasks this objective spent, settled or not. */
  readonly tasksSpent: number;
}

function corroborated(fact: BoundedFact) {
  return fact.evidence === "observed" || fact.evidence === "executor_receipt";
}

/** The step each disposition permits, and nothing wider. */
const nextStepFor: Readonly<Record<RecoveryDisposition, RecoveryNextStep>> = {
  awaiting: "wait",
  settled_unverified: "report",
  stopped_without_dispatch: "ask_user",
  // Never "retry". The first attempt may already have reached the world.
  uncertain_effect: "report_uncertain",
  verified_success: "report",
};

/** Decides what may happen next for one objective. */
export function recoveryProgress(input: {
  readonly objectiveRevision: string;
}): RecoveryProgress {
  const tasks = taskRecords(input.objectiveRevision);
  const settled = tasks.filter((task) => task.terminal !== undefined);
  const facts = settled.flatMap((task) => task.terminal?.facts ?? []);
  const verifiedCheckpoints = facts
    .filter((fact) => corroborated(fact))
    .map((fact) => fact.claim);

  const disposition = ((): RecoveryDisposition => {
    // Nothing to recover until every member has reported. Deciding earlier is
    // how a premature account of a half-finished objective gets written.
    if (tasks.length === 0 || settled.length !== tasks.length)
      return "awaiting";

    // Judged per task, then aggregated. Comparing a receipt against the whole
    // cohort's status let one task's failure relabel another task's completed,
    // corroborated dispatch as uncertain.
    const uncertain = settled.some(
      (task) =>
        task.terminal?.status !== "completed" &&
        (task.terminal?.facts ?? []).some(
          (fact) => fact.evidence === "executor_receipt"
        )
    );
    if (uncertain) return "uncertain_effect";

    const allCompleted = settled.every(
      (task) => task.terminal?.status === "completed"
    );
    if (allCompleted) {
      return verifiedCheckpoints.length > 0
        ? "verified_success"
        : "settled_unverified";
    }
    return "stopped_without_dispatch";
  })();

  const unknownRemainder = ((): readonly string[] => {
    switch (disposition) {
      case "uncertain_effect":
        return [
          "An action was dispatched and its outcome was never confirmed. This session cannot establish what it changed, so it must not be repeated automatically: repeating it is safe only if it changed nothing, and that is exactly what is unknown.",
        ];
      case "settled_unverified":
        return [
          "The worker reported success, but nothing corroborated it, so the outcome is not corroborated evidence.",
        ];
      case "stopped_without_dispatch":
        return [
          "The objective stopped before anything was dispatched, so what remains is undone rather than uncertain.",
        ];
      default:
        return [];
    }
  })();

  return {
    disposition,
    nextStep: nextStepFor[disposition],
    tasksSpent: tasks.length,
    unknownRemainder,
    verifiedCheckpoints,
  };
}
