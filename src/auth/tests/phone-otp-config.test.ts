import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requiredEnvironment = {
  BETTER_AUTH_SECRET: "test-auth-secret-0123456789abcdefghijklmnop",
  BETTER_AUTH_URL: "https://example.com",
  DATABASE_URL: "postgresql://user:password@example.com/database",
  KERNEL_API_KEY: "test-kernel-key",
  SECRET_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
};

describe("phone OTP configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    for (const [name, value] of Object.entries(requiredEnvironment)) {
      vi.stubEnv(name, value);
    }
    vi.stubEnv("PHONE_OTP_PROVIDER", "");
    vi.stubEnv("LINQ_CONNECTOR", "");
    vi.stubEnv("LINQ_PHONE_NUMBER", "");
    vi.stubEnv("SENDBLUE_API_KEY_ID", "");
    vi.stubEnv("SENDBLUE_API_SECRET_KEY", "");
    vi.stubEnv("SENDBLUE_FROM_NUMBER", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the Linq provider", async () => {
    const { phoneOtpProvider, isPhoneOtpProviderConfigured } =
      await import("@/auth/phone-otp-config");

    expect(phoneOtpProvider()).toBe("linq");
    expect(isPhoneOtpProviderConfigured()).toBe(false);
  });

  it("reports Linq configured when the connector is set", async () => {
    vi.stubEnv("LINQ_CONNECTOR", "linq/open-instinct");

    const { phoneOtpProvider, isPhoneOtpProviderConfigured } =
      await import("@/auth/phone-otp-config");

    expect(phoneOtpProvider()).toBe("linq");
    expect(isPhoneOtpProviderConfigured()).toBe(true);
  });

  it("reports SendBlue configured only when all credentials are present", async () => {
    vi.stubEnv("PHONE_OTP_PROVIDER", "sendblue");
    vi.stubEnv("SENDBLUE_API_KEY_ID", "key-id");
    vi.stubEnv("SENDBLUE_API_SECRET_KEY", "secret-key");
    vi.stubEnv("SENDBLUE_FROM_NUMBER", "+12025550199");

    const { phoneOtpProvider, isPhoneOtpProviderConfigured, sendblueConfig } =
      await import("@/auth/phone-otp-config");

    expect(phoneOtpProvider()).toBe("sendblue");
    expect(isPhoneOtpProviderConfigured()).toBe(true);
    expect(sendblueConfig()).toEqual({
      apiKeyId: "key-id",
      apiSecretKey: "secret-key",
      fromNumber: "+12025550199",
    });
  });

  it("reports SendBlue unconfigured when any credential is missing", async () => {
    vi.stubEnv("PHONE_OTP_PROVIDER", "sendblue");
    vi.stubEnv("SENDBLUE_API_KEY_ID", "key-id");
    vi.stubEnv("SENDBLUE_API_SECRET_KEY", "secret-key");

    const { isPhoneOtpProviderConfigured, sendblueConfig } =
      await import("@/auth/phone-otp-config");

    expect(isPhoneOtpProviderConfigured()).toBe(false);
    expect(sendblueConfig()).toBeUndefined();
  });
});
