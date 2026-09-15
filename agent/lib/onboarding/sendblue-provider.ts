import { env } from "@/env";
import { isE164PhoneNumber } from "@/auth/phone-number";
import {
  maximumSendblueOnboardingTextCharacters,
  type DirectChannelOnboardingPayload,
} from "@/lib/channel-onboarding-contract";
import { z } from "zod";

const sendMessageUrl = "https://api.sendblue.co/api/send-message";
const sendCarouselUrl = "https://api.sendblue.co/api/send-carousel";
const messageStatusUrl = "https://api.sendblue.co/api/status";
export { maximumSendblueOnboardingTextCharacters };
const responseSchema = z.object({
  error_code: z.union([z.number(), z.null()]).optional(),
  message_handle: z.string().min(1).optional(),
  status: z.string().optional(),
});
const acceptedStatuses = new Set([
  "ACCEPTED",
  "DELIVERED",
  "PENDING",
  "QUEUED",
  "REGISTERED",
  "SENT",
]);
const rejectedStatuses = new Set(["DECLINED", "ERROR"]);

export type SendblueOnboardingSendResult =
  | { readonly kind: "accepted"; readonly providerHandle: string }
  | { readonly kind: "rejected" }
  | { readonly kind: "uncertain" };

/** The documented provider status for a message we already accepted. */
export type SendblueOnboardingMessageStatus =
  | { readonly kind: "accepted" }
  | { readonly kind: "delivered" }
  | { readonly kind: "pending" }
  | { readonly kind: "rejected" }
  | { readonly kind: "uncertain" };

/** A persisted, provider-safe media reference. It is never a signed inbound URL. */
export type SendblueOnboardingMedia = NonNullable<
  DirectChannelOnboardingPayload["media"]
>[number];

/**
 * Chosen at enrollment time from an explicitly configured line capability.
 * Recovery repeats the already persisted format; it never switches transport
 * after an ambiguous provider response.
 */
export type SendblueOnboardingPresentation = NonNullable<
  DirectChannelOnboardingPayload["presentation"]
>;

/** Exact direct payload persisted with a durable onboarding operation. */
export type SendblueOnboardingDirectPayload = DirectChannelOnboardingPayload;

/**
 * Sends one persisted onboarding text. The caller owns the durable attempt
 * marker and must treat an indeterminate response as uncertain: SendBlue's
 * send endpoint does not document an idempotency key for this request.
 */
export async function sendOnboardingSendblueMessage({
  from,
  media,
  presentation = { kind: "text" },
  text,
  to,
}: {
  readonly from: string;
  readonly media?: readonly SendblueOnboardingMedia[];
  readonly presentation?: SendblueOnboardingPresentation;
  readonly text: string;
  readonly to: string;
}): Promise<SendblueOnboardingSendResult> {
  return sendOnboardingSendbluePayload({
    from,
    media: media ? [...media] : undefined,
    presentation,
    text,
    to,
    version: 1,
  });
}

/**
 * Sends an already-persisted direct payload. Its presentation was chosen
 * before this attempt, so no ambiguous response can switch transport.
 */
export async function sendOnboardingSendbluePayload({
  from,
  media,
  presentation = { kind: "text" },
  text,
  to,
}: SendblueOnboardingDirectPayload): Promise<SendblueOnboardingSendResult> {
  if (
    !isE164PhoneNumber(from) ||
    !isE164PhoneNumber(to) ||
    (presentation.kind === "carousel"
      ? text.length !== 0
      : text.trim().length === 0) ||
    text.length > maximumSendblueOnboardingTextCharacters ||
    !env.SENDBLUE_API_KEY_ID ||
    !env.SENDBLUE_API_SECRET_KEY
  ) {
    return { kind: "rejected" };
  }

  const request = providerRequest({ from, media, presentation, text, to });
  if (!request) return { kind: "rejected" };

  let response: Response;
  try {
    response = await fetch(request.url, {
      body: JSON.stringify(request.body),
      headers: {
        "Content-Type": "application/json",
        "sb-api-key-id": env.SENDBLUE_API_KEY_ID,
        "sb-api-secret-key": env.SENDBLUE_API_SECRET_KEY,
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { kind: "uncertain" };
  }

  const parsed = await parseResponse(response);
  if (!response.ok)
    return isTerminalRejection(parsed)
      ? { kind: "rejected" }
      : { kind: "uncertain" };
  if (!parsed) return { kind: "uncertain" };
  if (isTerminalRejection(parsed)) return { kind: "rejected" };
  if (
    parsed.message_handle &&
    parsed.status &&
    acceptedStatuses.has(parsed.status)
  ) {
    return { kind: "accepted", providerHandle: parsed.message_handle };
  }
  return { kind: "uncertain" };
}

function providerRequest({
  from,
  media,
  presentation,
  text,
  to,
}: {
  readonly from: string;
  readonly media: readonly SendblueOnboardingMedia[] | undefined;
  readonly presentation: SendblueOnboardingPresentation;
  readonly text: string;
  readonly to: string;
}) {
  const base = { content: text, from_number: from, number: to };
  if (presentation.kind === "text")
    return media?.length ? undefined : { body: base, url: sendMessageUrl };
  if (!media?.every((item) => isHttpsUrl(item.url))) return undefined;
  if (presentation.kind === "carousel") {
    if (media.length < 2 || media.length > 20) return undefined;
    return {
      // SendBlue documents no `content` field for /api/send-carousel.
      body: {
        from_number: from,
        media_urls: media.map((item) => item.url),
        number: to,
      },
      url: sendCarouselUrl,
    };
  }
  if (media.length !== 1) return undefined;
  const body = {
    ...base,
    media_url: media[0]?.url,
    // JSON omits undefined values, so this remains absent unless configured.
    send_style: presentation.sendStyle,
  };
  return {
    body,
    url: sendMessageUrl,
  };
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Reconciles only a known SendBlue handle. This distinguishes a provider's
 * accepted physical send from recipient delivery; a send whose response was
 * lost has no handle and must remain uncertain.
 */
export async function getOnboardingSendblueStatus(
  providerHandle: string
): Promise<SendblueOnboardingMessageStatus> {
  if (
    providerHandle.trim().length === 0 ||
    !env.SENDBLUE_API_KEY_ID ||
    !env.SENDBLUE_API_SECRET_KEY
  ) {
    return { kind: "uncertain" };
  }

  let response: Response;
  try {
    response = await fetch(
      `${messageStatusUrl}?handle=${encodeURIComponent(providerHandle)}`,
      {
        headers: {
          "sb-api-key-id": env.SENDBLUE_API_KEY_ID,
          "sb-api-secret-key": env.SENDBLUE_API_SECRET_KEY,
        },
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      }
    );
  } catch {
    return { kind: "uncertain" };
  }

  if (!response.ok) return { kind: "uncertain" };
  const parsed = await parseResponse(response);
  if (!parsed?.status) return { kind: "uncertain" };
  if (parsed.status === "DELIVERED") return { kind: "delivered" };
  if (rejectedStatuses.has(parsed.status) || isTerminalRejection(parsed))
    return { kind: "rejected" };
  if (acceptedStatuses.has(parsed.status)) {
    return parsed.status === "ACCEPTED" || parsed.status === "SENT"
      ? { kind: "accepted" }
      : { kind: "pending" };
  }
  return { kind: "uncertain" };
}

async function parseResponse(response: Response) {
  try {
    return responseSchema.parse(await response.json());
  } catch {
    return undefined;
  }
}

function isTerminalRejection(
  parsed: z.output<typeof responseSchema> | undefined
) {
  return (
    (parsed?.error_code !== undefined &&
      parsed.error_code !== null &&
      parsed.error_code !== 0) ||
    (parsed?.status !== undefined && rejectedStatuses.has(parsed.status))
  );
}
