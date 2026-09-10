import { APIError } from "better-auth/api";
import { z } from "zod";
import { isE164PhoneNumber } from "./phone-number";

const SENDBLUE_SEND_MESSAGE_URL = "https://api.sendblue.co/api/send-message";

const sendblueResponseSchema = z.object({
  message_handle: z.string().optional(),
  status: z.string().optional(),
  error_code: z.union([z.number(), z.null()]).optional(),
});

export type SendBlueSubmissionOutcome = "submitted" | "uncertain";

export class SendBlueDeliveryError extends Error {
  readonly status: number;
  readonly sendBlueStatus?: string;
  readonly errorCode?: number;

  constructor({
    status,
    sendBlueStatus,
    errorCode,
    message,
  }: {
    status: number;
    sendBlueStatus?: string;
    errorCode?: number;
    message: string;
  }) {
    super(message);
    this.name = "SendBlueDeliveryError";
    this.status = status;
    this.sendBlueStatus = sendBlueStatus;
    this.errorCode = errorCode;
  }
}

interface SendBlueFailure {
  readonly code: string;
  readonly message: string;
}

function sendBlueFailureMessage(error: SendBlueDeliveryError): SendBlueFailure {
  if (error.status === 401 || error.status === 403) {
    return {
      code: "SENDBLUE_UNAUTHORIZED",
      message:
        "SendBlue rejected the request. Check the API key ID and secret key are correct.",
    };
  }

  if (error.status === 429) {
    return {
      code: "SENDBLUE_RATE_LIMITED",
      message:
        "SendBlue rate-limited the request. Wait a moment and try again.",
    };
  }

  if (error.status >= 500) {
    return {
      code: "SENDBLUE_PROVIDER_ERROR",
      message: "SendBlue returned a server error. Try again later.",
    };
  }

  return {
    code: "SENDBLUE_SENDING_FAILED",
    message:
      "SendBlue could not send the code. Check the from number and recipient are approved test contacts, then try again.",
  };
}

const acceptedStatuses = new Set([
  "QUEUED",
  "SENT",
  "DELIVERED",
  "REGISTERED",
  "PENDING",
  "ACCEPTED",
]);

export async function sendBlueOtp({
  apiKeyId,
  apiSecretKey,
  code,
  fromNumber,
  to,
}: {
  apiKeyId: string;
  apiSecretKey: string;
  code: string;
  fromNumber: string;
  to: string;
}): Promise<{ outcome: SendBlueSubmissionOutcome }> {
  if (!isE164PhoneNumber(fromNumber) || !isE164PhoneNumber(to)) {
    throw new SendBlueDeliveryError({
      status: 400,
      message: "SendBlue request used an invalid phone number.",
    });
  }

  let response: Response;
  try {
    response = await fetch(SENDBLUE_SEND_MESSAGE_URL, {
      method: "POST",
      headers: {
        "sb-api-key-id": apiKeyId,
        "sb-api-secret-key": apiSecretKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_number: fromNumber,
        number: to,
        content: `Local Vault Assistant sign-in code: ${code}. Expires in 5 minutes.`,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { outcome: "uncertain" };
  }

  if (!response.ok) {
    const parsed = await parseSendblueResponse(response).catch(() => undefined);
    throw new SendBlueDeliveryError({
      status: response.status,
      sendBlueStatus: parsed?.status,
      errorCode: parsed?.error_code ?? undefined,
      message: "SendBlue request failed.",
    });
  }

  const parsed = await parseSendblueResponse(response).catch(() => undefined);
  if (parsed === undefined) {
    return { outcome: "uncertain" };
  }

  if (parsed.error_code && parsed.error_code !== 0) {
    throw new SendBlueDeliveryError({
      status: response.status,
      sendBlueStatus: parsed.status,
      errorCode: parsed.error_code,
      message: "SendBlue request failed.",
    });
  }

  if (
    parsed.status &&
    (parsed.status === "ERROR" || parsed.status === "DECLINED")
  ) {
    throw new SendBlueDeliveryError({
      status: response.status,
      sendBlueStatus: parsed.status,
      errorCode: parsed.error_code ?? undefined,
      message: "SendBlue request failed.",
    });
  }

  if (parsed.status && acceptedStatuses.has(parsed.status)) {
    return { outcome: "submitted" };
  }

  return { outcome: "uncertain" };
}

async function parseSendblueResponse(response: Response) {
  const json: unknown = await response.json();
  return sendblueResponseSchema.parse(json);
}

export function apiErrorFromSendBlueError(
  error: SendBlueDeliveryError
): APIError {
  const { code, message } = sendBlueFailureMessage(error);
  return new APIError("BAD_GATEWAY", { code, message });
}
