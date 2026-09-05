import { defineState } from "eve/context";

const finalDelivery = defineState<{
  callId: string;
  turnId: string;
  status: "pending" | "completed" | "unconfirmed";
} | null>("messaging.final-delivery", () => null);

export function finalDeliveryStatus(turnId: string | undefined) {
  if (turnId === undefined) return undefined;
  const delivery = finalDelivery.get();
  return delivery?.turnId === turnId ? delivery.status : undefined;
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
    delivery?.callId === callId && delivery.status !== "completed"
      ? { ...delivery, status: accepted ? "completed" : "unconfirmed" }
      : delivery
  );
}
