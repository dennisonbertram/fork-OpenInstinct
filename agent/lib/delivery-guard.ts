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
}

export function deliveryToolChoiceForInteractiveTurn({
  channelKind,
  deliveryStatus,
  mode,
  reportOwed = false,
}: InteractiveDeliveryGuardContext) {
  if (
    (channelKind !== "channel:linq" &&
      channelKind !== "channel:sendblue" &&
      channelKind !== "channel:eve") ||
    mode === "scheduled-report" ||
    deliveryStatus !== undefined
  )
    return undefined;

  return reportOwed
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
