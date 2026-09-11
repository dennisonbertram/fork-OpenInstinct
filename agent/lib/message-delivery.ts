import { defineState, requestTurnCompletion } from "eve/context";
import {
  abandonBoundReport,
  cohortsForReportCall,
  settleCohortReport,
} from "@/agent/lib/completion-obligations";

const finalDelivery = defineState<{
  callId: string;
  turnId: string;
  status: "pending" | "completed" | "unconfirmed";
} | null>("messaging.final-delivery", () => null);

const unconfirmedProviderAttempt = defineState<{
  callId: string;
  turnId: string;
} | null>("messaging.unconfirmed-provider-attempt", () => null);

export function finalDeliveryStatus(turnId: string | undefined) {
  if (turnId === undefined) return undefined;
  const delivery = finalDelivery.get();
  return delivery?.turnId === turnId ? delivery.status : undefined;
}

export function hasUnconfirmedProviderAttempt(turnId: string | undefined) {
  return (
    turnId !== undefined && unconfirmedProviderAttempt.get()?.turnId === turnId
  );
}

export function beginFinalDelivery(
  turnId: string,
  callId: string,
  awaitChannel: boolean
) {
  finalDelivery.update(() => ({
    callId,
    turnId,
    status: awaitChannel ? "pending" : "completed",
  }));
  // A channel with no provider step never sends a separate acceptance, so there
  // is nothing later to settle a bound report from. Leaving it pending would
  // leave an obligation nothing can ever close.
  if (!awaitChannel) settleBoundReport(callId, true);
}

/**
 * Settles the completion obligation this call holds, if it holds one.
 *
 * Looked up by call id in the obligation records, not in the delivery state
 * above. That state holds only the most recent attempt, so a provider result
 * that arrives after a later turn began would otherwise find no match and
 * silently leave its obligation awaiting delivery forever.
 *
 * Kept here rather than at each channel's call site so a channel settling
 * delivery cannot forget the obligation behind it.
 */
function settleBoundReport(callId: string, accepted: boolean) {
  // Every cohort this call bound, not just the first. Settling one and leaving
  // the rest pending is how a backlog becomes invisible.
  for (const cohort of cohortsForReportCall(callId)) {
    settleCohortReport(cohort.cohortId, accepted);
  }
}

export function settleFinalDelivery(callId: string, accepted: boolean) {
  finalDelivery.update((current) =>
    current?.callId === callId &&
    (current.status === "pending" || current.status === "unconfirmed")
      ? { ...current, status: accepted ? "completed" : "unconfirmed" }
      : current
  );
  // Independent of the delivery record above, which may already belong to a
  // later turn. A call id identifies one attempt, so this reaches exactly the
  // obligation this result is about and no other.
  settleBoundReport(callId, accepted);
}

/**
 * Records that this turn's final send provably did not happen.
 *
 * Distinct from `settleFinalDelivery(callId, false)`, which means the send may
 * have reached the user: this one is for a refusal that occurred before anything
 * was dispatched, so the obligation goes back to owed and a later turn can
 * answer it.
 */
export function abandonFinalDelivery(callId: string) {
  finalDelivery.update((current) =>
    current?.callId === callId && current.status === "pending" ? null : current
  );
  abandonBoundReport(callId);
}

/** Suppress an automatic fallback after a provider request may have reached it. */
export function recordUnconfirmedDelivery(turnId: string, callId: string) {
  unconfirmedProviderAttempt.update(() => ({ callId, turnId }));
  // Settled here too. Both channels follow this with settleFinalDelivery today,
  // but an obligation that depends on a caller remembering a second call is one
  // a caller can strand. Settling twice is harmless: the obligation only moves
  // out of delivery_pending once.
  settleBoundReport(callId, false);
  finalDelivery.update((delivery) =>
    delivery?.callId === callId &&
    delivery.turnId === turnId &&
    (delivery.status === "pending" || delivery.status === "unconfirmed")
      ? { ...delivery, status: "unconfirmed" }
      : delivery
  );
}

export function requestFinalDeliveryCompletion(
  callId: string,
  turnId: string,
  stepIndex: number
) {
  const delivery = finalDelivery.get();
  if (
    delivery?.callId === callId &&
    delivery.status === "completed" &&
    delivery.turnId === turnId
  ) {
    requestTurnCompletion({ callId, stepIndex });
  }
}
