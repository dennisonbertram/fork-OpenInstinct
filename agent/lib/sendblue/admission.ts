import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  accountEmail: z.string().min(1),
  content: z.string(),
  from_number: z.string().min(1),
  group_id: z.string().nullable().optional(),
  is_outbound: z.literal(false),
  message_handle: z.string().min(1),
  message_type: z.literal("message"),
  media_url: z
    .union([z.literal(""), z.url()])
    .nullable()
    .optional(),
  sendblue_number: z.string().min(1),
  service: z.enum(["iMessage", "SMS", "RCS", "sms"]),
  status: z.literal("RECEIVED"),
  to_number: z.string().min(1),
});

const e164PhoneNumber = /^\+[1-9]\d{1,14}$/u;

export interface SendblueAdmissionConfig {
  readonly accountId: string;
  readonly fromNumber: string;
}

export function validateSendblueInboundPayload(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- webhook JSON is parsed immediately below.
  value: unknown,
  config: SendblueAdmissionConfig
) {
  const parsed = payloadSchema.safeParse(value);
  if (!parsed.success) return null;
  const payload = parsed.data;
  if (
    payload.accountEmail !== config.accountId ||
    payload.sendblue_number !== config.fromNumber ||
    payload.to_number !== config.fromNumber ||
    payload.group_id
  )
    return null;
  if (!e164PhoneNumber.test(payload.from_number)) return null;
  return {
    accountId: payload.accountEmail,
    fromNumber: payload.sendblue_number,
    messageHandle: payload.message_handle,
    senderNumber: payload.from_number,
  };
}

export function hasSendblueWebhookSecret(request: Request, secret: string) {
  const actual = request.headers.get("sb-signing-secret");
  if (!actual) return false;
  const expectedBytes = Buffer.from(secret);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.byteLength === actualBytes.byteLength &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}
