import { env } from "../../env";
import { z } from "zod";

const acknowledgementSchema = z.object({ id: z.string().min(1) });

export interface RuntimeIdentity {
  readonly callId?: string;
  readonly sessionId: string;
  readonly stepIndex?: number;
  readonly turnId: string;
}

export async function recordRuntimeNotice(
  identity: RuntimeIdentity,
  type:
    | "model.step.started"
    | "turn.cancelled"
    | "turn.completed"
    | "turn.failed"
) {
  const response = await fetch(
    `${env.CONTRACT_DELIVERY_PROVIDER_URL}/notices`,
    {
      body: JSON.stringify({ ...identity, type }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(
      `Contract delivery notice failed with ${String(response.status)}.`
    );
  }
}

export async function postFixtureDelivery(
  identity: Required<RuntimeIdentity>,
  options: {
    readonly behavior: "accept" | "hold" | "reject";
    readonly deliveryClass: "final" | "recovery";
  }
) {
  const response = await fetch(
    `${env.CONTRACT_DELIVERY_PROVIDER_URL}/deliveries`,
    {
      body: JSON.stringify({ ...identity, ...options }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(
      `Contract fixture provider rejected delivery (${String(response.status)}).`
    );
  }
  return acknowledgementSchema.parse(await response.json());
}
