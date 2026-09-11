import {
  beginCohortReport,
  cohortForReportAttempt,
  reportableCohorts,
} from "@/agent/lib/completion-obligations";
import type {
  ReportPart,
  ReportPartIdentity,
} from "@/agent/lib/completion-report-attempts";
import { completionReportForcingActive } from "@/agent/lib/completion-report-activation";

/**
 * Whether this turn owes a written completion summary, and for which cohort.
 *
 * Two conditions, and both matter. The activation switch decides whether the
 * obligation is enforced at all. The completion records decide whether anything
 * is actually owed. Asking only the switch would take the reaction away from
 * every turn in the session, including a conversation that never started
 * background work, which is the opposite of what an ordinary turn should do.
 *
 * This reads records and reports a decision. The one thing it writes is the
 * binding in `bindReportAttempt`, and that is the caller saying "this exact
 * call is the attempt", not this module choosing to.
 */

export type ReportPolicy =
  /** Nothing is owed, or enforcement is off. An ordinary turn. */
  | { readonly kind: "none" }
  /** This cohort owes a written summary and only a final text send can give it. */
  | { readonly kind: "must_report"; readonly cohortId: string };

export function reportPolicyForTurn(): ReportPolicy {
  if (!completionReportForcingActive()) return { kind: "none" };
  // The oldest owed cohort first. One written summary accounts for one cohort,
  // so any others stay owed and are answered in a later turn rather than being
  // absorbed silently into this one.
  const [owed] = reportableCohorts();
  return owed === undefined
    ? { kind: "none" }
    : { cohortId: owed.cohortId, kind: "must_report" };
}

/**
 * Records that this exact call is the attempt at the owed summary.
 *
 * Returns false when the obligation could not be bound: another call in this
 * turn already holds it, or what was owed when the policy was read is no longer
 * owed now. The caller must not treat a false as a delivered summary.
 */
export function bindReportAttempt(input: {
  readonly cohortId: string;
  readonly turnId: string;
  readonly callId: string;
}): boolean {
  return beginCohortReport(input.cohortId, {
    callId: input.callId,
    turnId: input.turnId,
  });
}

/**
 * The durable identity of one physical effect of the report this call is making.
 *
 * Returns undefined when this call answers no obligation, which is the ordinary
 * case: most messages are not completion summaries, and a channel must send
 * those the way it always did rather than invent a report part for them.
 *
 * The cohort and the revision come from the records, never from the caller. A
 * caller that could supply them could also collide with an earlier attempt that
 * may already have reached a provider.
 */
export function reportPartIdentityFor(input: {
  readonly workspaceId: string;
  readonly rootSessionId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly part: ReportPart;
}): ReportPartIdentity | undefined {
  const cohort = cohortForReportAttempt({
    callId: input.callId,
    turnId: input.turnId,
  });
  return cohort === undefined
    ? undefined
    : {
        cohortId: cohort.cohortId,
        part: input.part,
        reportRevision: cohort.reportRevision,
        rootSessionId: input.rootSessionId,
        workspaceId: input.workspaceId,
      };
}
