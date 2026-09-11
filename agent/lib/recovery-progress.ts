import {
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

/** The step each disposition permits, and nothing wider. */
const nextStepFor: Readonly<Record<RecoveryDisposition, RecoveryNextStep>> = {
  awaiting: "wait",
  settled_unverified: "report",
  stopped_without_dispatch: "ask_user",
  // Never "retry". The first attempt may already have reached the world.
  uncertain_write: "report_uncertain",
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

    const dispatched = facts.some(
      (fact) => fact.evidence === "executor_receipt"
    );
    const allCompleted = settled.every(
      (task) => task.terminal?.status === "completed"
    );

    // A dispatch receipt without a clean completion leaves the world in a state
    // this session cannot confirm, and cancelling does not unsend it.
    //
    // A *completed* dispatch is not made uncertain by a later cancellation: the
    // work finished before the cancel arrived, and calling that "uncertain"
    // would be its own untruth. What cancellation forbids is claiming rollback.
    if (dispatched && !allCompleted) return "uncertain_write";
    if (allCompleted) {
      return verifiedCheckpoints.length > 0
        ? "verified_success"
        : "settled_unverified";
    }
    return "stopped_without_dispatch";
  })();

  const unknownRemainder = ((): readonly string[] => {
    switch (disposition) {
      case "uncertain_write":
        return [
          "Whether the dispatched action took effect is unknown; it was not confirmed and must not be repeated.",
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
