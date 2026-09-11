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
  /** Completed, and the worker's own word is the only support for it. */
  | "settled_unverified"
  /** Completed with no qualifying evidence at all, not even an assertion. */
  | "settled_without_evidence"
  /**
   * A dispatched action whose outcome this session cannot confirm. Not called a
   * write: the records show a receipt, not whether repeating it is safe.
   */
  | "uncertain_effect"
  /**
   * Some member stopped short, and no stopped member left an unconfirmed
   * dispatch. Not called "nothing was dispatched": absence of a receipt is not
   * proof of non-dispatch, and other members may have completed.
   */
  | "stopped_incomplete"
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
  settled_without_evidence: "report",
  stopped_incomplete: "ask_user",
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
      if (verifiedCheckpoints.length > 0) return "verified_success";
      // A completion with no facts at all, or only `unknown` ones, is not the
      // same as one the worker vouched for. Calling it "unverified" would hand
      // it a provenance nothing recorded.
      return facts.some((fact) => fact.evidence === "worker_assertion")
        ? "settled_unverified"
        : "settled_without_evidence";
    }
    return "stopped_incomplete";
  })();

  const unknownRemainder = ((): readonly string[] => {
    switch (disposition) {
      case "uncertain_effect":
        return [
          "An action was dispatched and its outcome was never confirmed. This session cannot establish what it changed, so it must not be repeated automatically: repeating it is safe only if it changed nothing, and that is exactly what is unknown.",
        ];
      case "settled_unverified":
        return [
          "The worker reported this as done, but nothing corroborated it, so the outcome rests on the worker's own account.",
        ];
      case "settled_without_evidence":
        return [
          "The work reported as finished without recording anything about what happened, so there is nothing to stand behind the outcome — not even the worker's own description of it.",
        ];
      case "stopped_incomplete":
        return [
          "Part of this objective stopped before finishing. No stopped part left a dispatch unconfirmed, but that is not the same as proof that nothing was dispatched, and any part that did finish is recorded separately above.",
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
