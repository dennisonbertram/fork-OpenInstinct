import { defineState, requestTurnCompletion } from "eve/context";

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
}

export function settleFinalDelivery(callId: string, accepted: boolean) {
  finalDelivery.update((delivery) =>
    delivery?.callId === callId &&
    (delivery.status === "pending" || delivery.status === "unconfirmed")
      ? { ...delivery, status: accepted ? "completed" : "unconfirmed" }
      : delivery
  );
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
