import { drainWebhookDeliveries } from "@/db/services/webhooks";
import { env } from "@/env";
import { createDrainWebhooksRoute } from "./handler";

export const runtime = "nodejs";
export const maxDuration = 300;

export const GET = createDrainWebhooksRoute({
  cronSecret: env.CRON_SECRET,
  drain: drainWebhookDeliveries,
});
