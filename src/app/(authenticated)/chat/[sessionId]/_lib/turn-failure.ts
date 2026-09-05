import { isTurnFailureEvent, type MessageStreamEvent } from "eve/client";

export function getLatestTurnFailure(
  events: readonly MessageStreamEvent[]
): string | undefined {
  const event = latestTurnFailure(events);
  if (!event) return undefined;
  return event.data.code === "MODEL_CALL_FAILED"
    ? "The model is temporarily unavailable. Please try again."
    : event.data.message;
}

export function getLatestTurnFailureDiagnostic(
  events: readonly MessageStreamEvent[]
): string | undefined {
  const event = latestTurnFailure(events);
  if (
    event?.data.code === "MODEL_CALL_FAILED" &&
    event.data.details?.upstreamType === "insufficient_funds"
  ) {
    return "AI Gateway has insufficient credits. Add credits in Vercel, then send your message again.";
  }
  return undefined;
}

function latestTurnFailure(events: readonly MessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;

    if (isTurnFailureEvent(event) && event.type === "turn.failed") {
      return event;
    }
    if (
      event.type === "turn.completed" ||
      event.type === "turn.cancelled" ||
      event.type === "message.received"
    ) {
      return undefined;
    }
  }
  return undefined;
}
