import {
  beginCohortReport,
  cohortForReportAttempt,
  releaseCohortReport,
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
  /**
   * These cohorts owe a written summary, and only a final text send can give
   * it. Every owed cohort, not just the oldest: one message accounts for all of
   * them, so a backlog is answered once rather than on every turn until it
   * drains. Reporting fewer would leave an obligation discharged by a message
   * that never mentioned it.
   */
  | { readonly kind: "must_report"; readonly cohortIds: readonly string[] };

export function reportPolicyForTurn(): ReportPolicy {
  if (!completionReportForcingActive()) return { kind: "none" };
  const owed = reportableCohorts();
  return owed.length === 0
    ? { kind: "none" }
    : { cohortIds: owed.map((cohort) => cohort.cohortId), kind: "must_report" };
}

/**
 * Records that this exact call is the attempt at every owed summary, and
 * returns the cohorts it now owns.
 *
 * All or none. A partial bind would leave some cohorts waiting on a message
 * that reports the others, which is the state this whole design exists to
 * prevent -- so if any cohort refuses, the ones already bound are released and
 * the caller is told nothing was taken.
 *
 * An empty result means the caller must not treat this send as a summary.
 */
export function bindReportAttempt(input: {
  readonly cohortIds: readonly string[];
  readonly turnId: string;
  readonly callId: string;
}): readonly string[] {
  const bound: string[] = [];
  for (const cohortId of input.cohortIds) {
    if (
      beginCohortReport(cohortId, {
        callId: input.callId,
        turnId: input.turnId,
      })
    ) {
      bound.push(cohortId);
      continue;
    }
    // Release what was taken. releaseCohortReport only moves a cohort this
    // exact call holds, so nothing else in the session is disturbed.
    for (const taken of bound) releaseCohortReport(taken, input.callId);
    return [];
  }
  return bound;
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
