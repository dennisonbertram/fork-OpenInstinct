import { defineState } from "eve/context";
import type { DynamicTurnOrigin } from "eve/tools";
import {
  bindCohortReports,
  cohortsForReportCall,
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

export type TurnRequestIntent = "report_only" | "unknown" | "user_request";

const turnIntentState = defineState<{
  readonly byTurnId: Readonly<Record<string, TurnRequestIntent>>;
}>("completion.report-turn-intent", () => ({ byTurnId: {} }));

/** Capture the request kind at the authoritative start of its turn. */
export function recordTurnRequestIntent(
  turnId: string,
  intent: TurnRequestIntent
) {
  // Only the current turn is relevant to tool resolution. Replacing the map
  // keeps durable session state bounded while retaining the event's turn ID as
  // the key used by later step resolvers.
  turnIntentState.update(() => ({ byTurnId: { [turnId]: intent } }));
}

export function turnRequestIntentFor(turnId: string | undefined) {
  return turnId === undefined
    ? undefined
    : turnIntentState.get().byTurnId[turnId];
}

/**
 * Interprets Eve's typed delivery source without deriving intent from message
 * text or from a role that framework wakes can also use.
 */
export function turnRequestIntentFromOrigin(
  origin: DynamicTurnOrigin | undefined
): TurnRequestIntent | undefined {
  if (origin === "channel_input") return "user_request";
  if (origin === "background_task") return "report_only";
  return origin === "unknown" ? "unknown" : undefined;
}

export function reportPolicyForTurn(options?: {
  readonly turnId?: string;
  readonly intent?: TurnRequestIntent;
}): ReportPolicy {
  if (!completionReportForcingActive()) return { kind: "none" };
  const owed = reportableCohorts().filter(
    (cohort) =>
      options?.intent !== "user_request" || cohort.cohortId === options.turnId
  );
  return owed.length === 0
    ? { kind: "none" }
    : { cohortIds: owed.map((cohort) => cohort.cohortId), kind: "must_report" };
}

/**
 * Records that this exact call is the attempt at every owed summary, and
 * returns the cohorts it now owns.
 *
 * All or none, and the state machine applies it as one write rather than binding
 * each cohort and undoing the earlier ones, because undoing has to guess at a
 * phase the cohort may never have been in.
 *
 * An empty result means the caller must not treat this send as a summary.
 */
export function bindReportAttempt(input: {
  readonly cohortIds: readonly string[];
  readonly turnId: string;
  readonly callId: string;
}): readonly string[] {
  return bindCohortReports(input.cohortIds, {
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
  const cohorts = cohortsForReportCall(input.callId)
    .filter((cohort) => cohort.report?.turnId === input.turnId)
    .map((cohort) => ({
      cohortId: cohort.cohortId,
      reportRevision: cohort.reportRevision,
    }))
    .toSorted(
      (left, right) =>
        left.cohortId.localeCompare(right.cohortId) ||
        left.reportRevision - right.reportRevision
    );
  const representative = cohorts[0];
  if (!representative) return undefined;
  return {
    ...representative,
    cohorts,
    part: input.part,
    rootSessionId: input.rootSessionId,
    workspaceId: input.workspaceId,
  };
}
