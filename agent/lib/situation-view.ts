import { parkedApprovals } from "@/agent/lib/approval-identity";
import {
  allCohorts,
  cohortFor,
  reportableCohorts,
  taskRecords,
  type BoundedFact,
  type CohortRecord,
} from "@/agent/lib/completion-obligations";

/**
 * A short, read-only account of where the current request stands.
 *
 * This exists so the root and a worker can see the current objective, what is
 * known, and what is owed without reconstructing it from conversation history.
 * It is a projection of records other modules own: the completion obligations
 * own task, cohort and report state, and nothing here mutates them.
 *
 * It guides a plan. It never authorises an action. In particular an approval
 * cannot originate here — the only approval this reports is one a typed record
 * already holds, and no claim text, however confident, becomes authority by
 * appearing in it.
 *
 * Claim text is bounded here so an unbounded worker message or page excerpt
 * cannot flow through a projection that is supposed to be short. Bounding is not
 * redaction: this reads text other code already recorded, so it cannot promise
 * that text holds no secret. Keeping secrets out of a fact claim, and out of a
 * caller-supplied constraint, is the job of whoever writes them.
 */

/** Where a constraint came from, which is what decides how much it binds. */
type ConstraintSource = "user" | "policy" | "inferred";

export interface SituationConstraint {
  readonly text: string;
  readonly source: ConstraintSource;
}

interface SituationEvidence {
  /** The objective this fact belongs to, so prior evidence stays attributable. */
  readonly cohortId: string;
  readonly taskId: string;
  readonly claim: string;
  readonly evidence: BoundedFact["evidence"];
  /** A scoped reference to something this session owns, when one exists. */
  readonly reference?: string;
}

export interface SituationView {
  /**
   * The objective this turn is working on, as the completion records label
   * it. Taken from the cohort record when one exists, since the record is the
   * thing completion-obligations itself stamped; the caller's own label is
   * used only as a fallback when this turn started no work and there is no
   * record to defer to.
   */
  readonly objectiveRevision: string;
  /** The cohort for that objective, absent when this turn started no work. */
  readonly cohort?: CohortRecord;
  readonly constraints: readonly SituationConstraint[];
  /** Evidence for the current objective. */
  readonly evidence: readonly SituationEvidence[];
  /**
   * Evidence from other objectives, kept visible but never presented as the
   * current one. A late result from a superseded objective lands here.
   */
  readonly priorEvidence: readonly SituationEvidence[];
  /** Whether a written summary is owed, and for which cohort. */
  readonly reportOwedFor: readonly string[];
  /**
   * Native approvals this turn's work is waiting on: which task is parked and
   * which request it is parked on, and nothing else.
   *
   * Deliberately not what was asked. The approval's material terms are held as
   * a compared fingerprint elsewhere, and neither the terms nor the fingerprint
   * belong in a plan-guiding projection -- an approval cannot originate here.
   */
  readonly pendingInput: readonly PendingInputReference[];
}

/** One outstanding native question, named but not described. */
interface PendingInputReference {
  readonly requestId: string;
  readonly taskId: string;
}

/** Every cohort this session holds other than the current turn's. */
function otherCohorts(turnId: string): readonly CohortRecord[] {
  return allCohorts().filter((candidate) => candidate.cohortId !== turnId);
}

/** The most claim text a projection will carry for one fact. */
const maximumClaimLength = 400;

function boundClaim(claim: string) {
  return claim.length <= maximumClaimLength
    ? claim
    : `${claim.slice(0, maximumClaimLength)}…`;
}

function evidenceFrom(cohortId: string): readonly SituationEvidence[] {
  return taskRecords(cohortId).flatMap((task) =>
    (task.terminal?.facts ?? []).map((fact) => ({
      claim: boundClaim(fact.claim),
      cohortId,
      evidence: fact.evidence,
      reference: fact.reference,
      taskId: task.taskId,
    }))
  );
}

/**
 * Projects the situation for one objective revision.
 *
 * The revision is supplied by the caller from the active turn rather than
 * guessed here, because ordering turns is the runtime's business and a
 * projection that invented its own notion of "newest" would be a second source
 * of truth.
 */
export function situationView(input: {
  readonly turnId: string;
  readonly objectiveRevision: string;
  readonly constraints?: readonly SituationConstraint[];
}): SituationView {
  const cohort = cohortFor(input.turnId);
  const owed = reportableCohorts();
  const current = {
    constraints: input.constraints ?? [],
    // Current evidence is exactly the cohort this turn owns. A record from
    // another turn cannot reach this list, however recently it arrived.
    evidence: cohort === undefined ? [] : evidenceFrom(cohort.cohortId),
    // The record's own label wins when a record exists; the caller's label is
    // used only when this turn started no work and there is no record.
    objectiveRevision: cohort?.objectiveRevision ?? input.objectiveRevision,
    // Everything else, kept so a later question can still be answered, and kept
    // separate so it can never be mistaken for this objective's outcome.
    priorEvidence: otherCohorts(input.turnId).flatMap((candidate) =>
      evidenceFrom(candidate.cohortId)
    ),
    // Scoped to this turn's cohort. Another turn's parked question is that
    // turn's business, and presenting it here would invite answering it.
    pendingInput: parkedApprovals()
      .filter((approval) => approval.cohortId === input.turnId)
      .map((approval) => ({
        requestId: approval.requestId,
        taskId: approval.taskId,
      })),
    reportOwedFor: owed.map((candidate) => candidate.cohortId),
  };
  return cohort === undefined ? current : { ...current, cohort };
}
