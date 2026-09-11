import { reportableCohorts } from "@/agent/lib/completion-obligations";

/**
 * Whether forced completion reporting is active for this turn.
 *
 * Active exactly when the root owes a written summary, and at no other time.
 * That equivalence is the point rather than a convenience: there is no switch to
 * leave on by accident, and no turn where the mechanism applies to a session
 * with nothing to report. An ordinary turn is unchanged because nothing is owed
 * on one, which is a property of the state rather than a promise about a flag.
 *
 * What had to be true before this returned anything but false:
 *
 * - A report binds to exact channel settlement, so a message the provider never
 *   accepted cannot discharge an obligation, and one it did accept cannot leave
 *   the cohort owing a second.
 * - The records travel with the message. A shape check cannot tell a summary from
 *   a progress note; production proved that when "i'm checking a public time
 *   source for Tokyo now." was accepted as a completion report for work that was
 *   never started.
 * - One message answers the whole backlog, so a session with settled work behind
 *   it is not forced into a summary on every turn until it drains.
 */
export function completionReportForcingActive(): boolean {
  return reportableCohorts().length > 0;
}
