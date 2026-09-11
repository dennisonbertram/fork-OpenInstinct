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
  /** The objective this turn is working on, as the completion records label it. */
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
}

/** Every cohort this session holds other than the current objective's. */
function otherCohorts(objectiveRevision: string): readonly CohortRecord[] {
  return allCohorts().filter(
    (candidate) => candidate.cohortId !== objectiveRevision
  );
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
  readonly objectiveRevision: string;
  readonly constraints?: readonly SituationConstraint[];
}): SituationView {
  const cohort = cohortFor(input.objectiveRevision);
  const owed = reportableCohorts();
  const current = {
    constraints: input.constraints ?? [],
    // Current evidence is exactly the cohort this objective owns. A record from
    // another objective cannot reach this list, however recently it arrived.
    evidence: cohort === undefined ? [] : evidenceFrom(cohort.cohortId),
    objectiveRevision: input.objectiveRevision,
    // Everything else, kept so a later question can still be answered, and kept
    // separate so it can never be mistaken for this objective's outcome.
    priorEvidence: otherCohorts(input.objectiveRevision).flatMap((candidate) =>
      evidenceFrom(candidate.cohortId)
    ),
    reportOwedFor: owed.map((candidate) => candidate.cohortId),
  };
  return cohort === undefined ? current : { ...current, cohort };
}
