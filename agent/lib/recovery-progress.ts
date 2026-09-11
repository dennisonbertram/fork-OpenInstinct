import {
  cohortFor,
  taskRecords,
  type BoundedFact,
} from "@/agent/lib/completion-obligations";

/**
 * What a root may legally do next after background work stopped short.
 *
 * The rule worth stating first, because it is the one that protects a user: a
 * read may be retried, because repeating it only adds evidence. A write whose
 * effect is uncertain may never be retried, because the first attempt may
 * already have landed. Everything else here exists to tell those two apart
 * from the evidence actually recorded.
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
  /** An effect may already have reached the world. Never retry. */
  | "uncertain_write"
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

/**
 * Decides what may happen next for one objective.
 *
 * Implemented in the following commit; see the RED suite.
 */
export function recoveryProgress(input: {
  readonly objectiveRevision: string;
}): RecoveryProgress {
  void cohortFor;
  void taskRecords;
  void corroborated;
  return {
    disposition: "awaiting",
    nextStep: "wait",
    tasksSpent: 0,
    unknownRemainder: [],
    verifiedCheckpoints: [],
  };
}
