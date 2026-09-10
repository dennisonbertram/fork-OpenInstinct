import { env } from "@/env";
import { isE164PhoneNumber } from "./phone-number";

export type PhoneOtpProvider = typeof env.PHONE_OTP_PROVIDER;

export function phoneOtpProvider(): PhoneOtpProvider {
  return env.PHONE_OTP_PROVIDER;
}

export function isPhoneOtpProviderConfigured(): boolean {
  const provider = phoneOtpProvider();
  if (provider === "linq") {
    return env.LINQ_CONNECTOR !== undefined;
  }

  return sendblueConfig() !== undefined;
}

export function sendblueConfig():
  | {
      readonly apiKeyId: string;
      readonly apiSecretKey: string;
      readonly fromNumber: string;
    }
  | undefined {
  const apiKeyId = env.SENDBLUE_API_KEY_ID;
  const apiSecretKey = env.SENDBLUE_API_SECRET_KEY;
  const fromNumber = env.SENDBLUE_FROM_NUMBER;

  if (
    !apiKeyId ||
    !apiSecretKey ||
    !fromNumber ||
    !isE164PhoneNumber(fromNumber)
  ) {
    return undefined;
  }

  return { apiKeyId, apiSecretKey, fromNumber };
}
