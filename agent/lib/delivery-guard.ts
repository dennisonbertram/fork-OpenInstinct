import { wrapLanguageModel } from "ai";
import type { finalDeliveryStatus } from "./message-delivery";

type DeliveryStatus = ReturnType<typeof finalDeliveryStatus>;

interface InteractiveDeliveryGuardContext {
  readonly channelKind: string | undefined;
  readonly deliveryStatus: DeliveryStatus;
  readonly mode: string | undefined;
}

export function deliveryToolChoiceForInteractiveTurn({
  channelKind,
  deliveryStatus,
  mode,
}: InteractiveDeliveryGuardContext) {
  if (
    (channelKind !== "channel:linq" &&
      channelKind !== "channel:sendblue" &&
      channelKind !== "channel:eve") ||
    mode === "scheduled-report" ||
    deliveryStatus !== undefined
  )
    return undefined;

  return { type: "required" } as const;
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
