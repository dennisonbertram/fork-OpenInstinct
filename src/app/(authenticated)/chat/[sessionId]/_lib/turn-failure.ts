import { isTurnFailureEvent, type MessageStreamEvent } from "eve/client";
import { sentMessages } from "./message-events";

export type LatestTurnOutcome =
  | "cancelled"
  | "missing-response"
  | "session-failed";

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

export function getLatestTurnOutcome(
  events: readonly MessageStreamEvent[]
): LatestTurnOutcome | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;

    if (event.type === "turn.cancelled") return "cancelled";
    if (event.type === "session.failed") return "session-failed";
    if (event.type === "turn.completed") {
      return sentMessages(events).has(`${event.data.turnId}:assistant`)
        ? undefined
        : "missing-response";
    }

    // These events mean activity has progressed beyond any earlier terminal
    // turn. Do not carry an old cancellation or empty-response notice over a
    // new message, active turn, tool request, or approval/question.
    if (
      event.type === "message.received" ||
      event.type === "turn.started" ||
      event.type === "turn.failed" ||
      event.type === "actions.requested" ||
      event.type === "input.requested" ||
      event.type === "step.started"
    ) {
      return undefined;
    }
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
