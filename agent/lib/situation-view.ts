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
 * Claim and constraint text is bounded here so an unbounded worker message or
 * page excerpt cannot flow through a projection that is supposed to be short.
 * Bounding never cuts an item: a shortened claim can say the opposite of what
 * was recorded -- a sentence whose middle holds "not" becomes its own opposite
 * -- and a reader cannot tell it was shortened, so an item that does not fit
 * is left out whole and counted in `omissions`. Omission is visible; mutation
 * is not. Bounding is not redaction: this reads text other code already
 * recorded, so it cannot promise that text holds no secret. Keeping secrets
 * out of a fact claim, and out of a caller-supplied constraint, is the job of
 * whoever writes them. A constraint this projection leaves out is still in
 * force: a short projection waives nothing.
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
  /**
   * What bounding here left out, so a dropped fact or constraint is visible
   * rather than a silently shorter list. Counts only this projection's own
   * omissions: facts the records dropped upstream at their per-task cap are
   * the records' business, marked there with `truncatedUnknown`.
   */
  readonly omissions: SituationOmissions;
}

/**
 * Whole items or none. An item over a bound is omitted entirely and counted
 * here, never shortened: a cut claim or constraint can read as the opposite
 * of what was recorded, and a reader cannot tell it was cut.
 */
interface SituationOmissions {
  /** Claims omitted whole: over the per-item length bound, or past the projection-wide count ceiling. */
  readonly claims: number;
  /** Constraints omitted whole: over the per-item length bound, or past the count ceiling. */
  readonly constraints: number;
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

/**
 * The most text one claim or constraint carries. A longer item is omitted
 * whole and counted, never cut: a shortened claim can say the opposite of
 * what was recorded.
 */
const maximumItemLength = 400;
/**
 * The most claims this projection carries as a whole -- a chosen limit, not a
 * derived one, because an unbounded count of bounded claims is still
 * unbounded. The current objective's evidence is carried first, then prior
 * evidence in creation order, so when the ceiling binds it is the most recent
 * prior work that drops first.
 */
const maximumClaims = 16;
/** The most constraints this projection carries, for the same reason. */
const maximumConstraints = 16;

function evidenceFrom(cohortId: string) {
  // Whole claims or none, the rule this module's siblings
  // (completion-report-text.ts, completion-evidence-context.ts) already
  // follow: a claim over the bound is dropped here and counted, never cut.
  const facts = taskRecords(cohortId).flatMap((task) =>
    (task.terminal?.facts ?? []).map((fact) => ({ fact, taskId: task.taskId }))
  );
  const whole = facts.filter(
    ({ fact }) => fact.claim.length <= maximumItemLength
  );
  return {
    evidence: whole.map(({ fact, taskId }) => ({
      claim: fact.claim,
      cohortId,
      evidence: fact.evidence,
      reference: fact.reference,
      taskId,
    })),
    omitted: facts.length - whole.length,
  };
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
  const currentEvidence =
    cohort === undefined
      ? { evidence: [], omitted: 0 }
      : evidenceFrom(cohort.cohortId);
  const prior = otherCohorts(input.turnId).map((candidate) =>
    evidenceFrom(candidate.cohortId)
  );
  // One ceiling for the whole projection. Eligible claims are taken in the
  // order the lists carry them -- the current objective's evidence first,
  // then prior evidence in creation order -- and an over-long claim never
  // consumes a slot: it is already gone, so a later short claim can still fit.
  const carried = [
    ...currentEvidence.evidence,
    ...prior.flatMap((part) => part.evidence),
  ];
  const shown = carried.slice(0, maximumClaims);
  const constraints = (input.constraints ?? []).filter(
    (constraint) => constraint.text.length <= maximumItemLength
  );
  const current = {
    constraints: constraints.slice(0, maximumConstraints),
    // Current evidence is exactly the cohort this turn owns. A record from
    // another turn cannot reach this list, however recently it arrived.
    evidence: shown.slice(0, currentEvidence.evidence.length),
    // The record's own label wins when a record exists; the caller's label is
    // used only when this turn started no work and there is no record.
    objectiveRevision: cohort?.objectiveRevision ?? input.objectiveRevision,
    // Counted, never silent: what bounding here left out.
    omissions: {
      claims:
        currentEvidence.omitted +
        prior.reduce((total, part) => total + part.omitted, 0) +
        (carried.length - shown.length),
      constraints:
        (input.constraints?.length ?? 0) -
        Math.min(constraints.length, maximumConstraints),
    },
    // Everything else, kept so a later question can still be answered, and kept
    // separate so it can never be mistaken for this objective's outcome.
    priorEvidence: shown.slice(currentEvidence.evidence.length),
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
