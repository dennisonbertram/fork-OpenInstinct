import { defineState, requestTurnCompletion } from "eve/context";
import {
  cohortForReportAttempt,
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
  if (!awaitChannel) settleBoundReport(turnId, callId, true);
}

/**
 * Settles the completion obligation this exact attempt holds, if it holds one.
 *
 * Kept here rather than at each channel's call site so no channel can settle
 * delivery and forget the obligation behind it.
 */
function settleBoundReport(turnId: string, callId: string, accepted: boolean) {
  const cohort = cohortForReportAttempt({ callId, turnId });
  if (cohort !== undefined) settleCohortReport(cohort.cohortId, accepted);
}

export function settleFinalDelivery(callId: string, accepted: boolean) {
  const delivery = finalDelivery.get();
  finalDelivery.update((current) =>
    current?.callId === callId &&
    (current.status === "pending" || current.status === "unconfirmed")
      ? { ...current, status: accepted ? "completed" : "unconfirmed" }
      : current
  );
  // Read from the delivery this call owns, so a result for another call cannot
  // reach another attempt's obligation.
  if (delivery?.callId === callId) {
    settleBoundReport(delivery.turnId, callId, accepted);
  }
}

/** Suppress an automatic fallback after a provider request may have reached it. */
export function recordUnconfirmedDelivery(turnId: string, callId: string) {
  unconfirmedProviderAttempt.update(() => ({ callId, turnId }));
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
