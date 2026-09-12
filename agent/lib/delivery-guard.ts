import { wrapLanguageModel } from "ai";
import type { finalDeliveryStatus } from "./message-delivery";

type DeliveryStatus = ReturnType<typeof finalDeliveryStatus>;

interface InteractiveDeliveryGuardContext {
  readonly channelKind: string | undefined;
  readonly deliveryStatus: DeliveryStatus;
  readonly mode: string | undefined;
  /**
   * Whether a written completion summary is owed for settled background work.
   * When it is, a reaction cannot answer the turn, so the guard names the one
   * tool that can instead of leaving the model a choice.
   */
  readonly reportOwed?: boolean;
  /**
   * Whether the newest message in the turn is from the user, so this turn
   * exists to carry out a request rather than only to deliver an owed
   * report (e.g. a scheduled wake with no new user message).
   */
  readonly userRequestPending?: boolean;
}

export function deliveryToolChoiceForInteractiveTurn({
  channelKind,
  deliveryStatus,
  mode,
  reportOwed = false,
  userRequestPending = false,
}: InteractiveDeliveryGuardContext) {
  if (
    (channelKind !== "channel:linq" &&
      channelKind !== "channel:sendblue" &&
      channelKind !== "channel:eve") ||
    mode === "scheduled-report" ||
    deliveryStatus !== undefined
  )
    return undefined;

  // An owed report must not force send_message as the first and only action
  // of a new user request; the debt stays owed and is discharged later. It
  // still forces send_message when there is no pending user request (e.g. a
  // wake with nothing new to act on).
  return reportOwed && !userRequestPending
    ? ({ type: "tool", toolName: "send_message" } as const)
    : ({ type: "required" } as const);
}

export function wrapInteractiveDeliveryGuard(
  model: Parameters<typeof wrapLanguageModel>[0]["model"],
  toolChoice: ReturnType<typeof deliveryToolChoiceForInteractiveTurn>
) {
  if (toolChoice === undefined) return model;

  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      transformParams: async ({ params }) => ({ ...params, toolChoice }),
    },
  });
}
