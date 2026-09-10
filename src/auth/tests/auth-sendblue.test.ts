import { APIError } from "better-auth/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }));

vi.stubGlobal("fetch", mocks.fetch);

const sendblueApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const requiredEnvironment = {
  BETTER_AUTH_SECRET: "test-auth-secret-0123456789abcdefghijklmnop",
  BETTER_AUTH_URL: "https://example.com",
  DATABASE_URL: "postgresql://user:password@example.com/database",
  KERNEL_API_KEY: "test-kernel-key",
  SECRET_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
};

function setupSendblueEnv(overrides: Record<string, string | undefined> = {}) {
  for (const [name, value] of Object.entries(requiredEnvironment)) {
    vi.stubEnv(name, value);
  }
  vi.stubEnv("PHONE_OTP_PROVIDER", "sendblue");
  vi.stubEnv("SENDBLUE_API_KEY_ID", "test-api-key-id");
  vi.stubEnv("SENDBLUE_API_SECRET_KEY", "test-api-secret-key");
  vi.stubEnv("SENDBLUE_FROM_NUMBER", "+12025550199");
  vi.stubEnv("LINQ_CONNECTOR", undefined);
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      vi.stubEnv(name, "");
    } else {
      vi.stubEnv(name, value);
    }
  }
}

describe("SendBlue phone authentication", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("submits one POST to the documented endpoint with exact headers and body", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(
      Response.json({
        error_code: 0,
        message_handle: "msg-1",
        status: "QUEUED",
      })
    );

    const { sendBlueOtp } = await import("@/auth/sendblue");
    const result = await sendBlueOtp({
      apiKeyId: "test-api-key-id",
      apiSecretKey: "test-api-secret-key",
      code: "123456",
      fromNumber: "+12025550199",
      to: "+12025550123",
    });

    expect(result).toEqual({ outcome: "submitted" });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://api.sendblue.co/api/send-message");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    const headers = init?.headers as Record<string, string>;
    expect(headers["sb-api-key-id"]).toBe("test-api-key-id");
    expect(headers["sb-api-secret-key"]).toBe("test-api-secret-key");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse((init?.body as string) ?? "{}") as unknown;
    expect(body).toEqual({
      content: "Local Vault Assistant sign-in code: 123456. Expires in 5 minutes.",
      from_number: "+12025550199",
      number: "+12025550123",
    });
  });

  it.each(["QUEUED", "SENT", "DELIVERED", "REGISTERED", "PENDING", "ACCEPTED"])(
    "treats %s as a submitted code",
    async (status) => {
      setupSendblueEnv();
      mocks.fetch.mockResolvedValueOnce(Response.json({ status }));

      const { sendBlueOtp } = await import("@/auth/sendblue");
      const result = await sendBlueOtp({
        apiKeyId: "test-api-key-id",
        apiSecretKey: "test-api-secret-key",
        code: "123456",
        fromNumber: "+12025550199",
        to: "+12025550123",
      });

      expect(result).toEqual({ outcome: "submitted" });
    }
  );

  it("throws a safe APIError when SendBlue credentials are rejected", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(Response.json({}, { status: 401 }));

    const { sendPhoneCode } = await import("@/auth");
    const error: unknown = await sendPhoneCode({
      code: "123456",
      to: "+12025550123",
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(APIError);
    if (!(error instanceof APIError)) throw new TypeError("Expected APIError");
    const body = sendblueApiErrorSchema.parse(error.body);
    expect(body.code).toBe("SENDBLUE_UNAUTHORIZED");
    expect(body.message).toContain("API credentials");
    expect(JSON.stringify(body)).not.toContain("123456");
    expect(JSON.stringify(body)).not.toContain("+12025550123");
  });

  it("throws a safe APIError when SendBlue rate-limits the request", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(Response.json({}, { status: 429 }));

    const { sendPhoneCode } = await import("@/auth");
    const error: unknown = await sendPhoneCode({
      code: "123456",
      to: "+12025550123",
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(APIError);
    if (!(error instanceof APIError)) throw new TypeError("Expected APIError");
    const body = sendblueApiErrorSchema.parse(error.body);
    expect(body.code).toBe("SENDBLUE_RATE_LIMITED");
    expect(body.message).toContain("rate");
  });

  it("throws a safe APIError on provider server errors", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(Response.json({}, { status: 503 }));

    const { sendPhoneCode } = await import("@/auth");
    const error: unknown = await sendPhoneCode({
      code: "123456",
      to: "+12025550123",
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(APIError);
    if (!(error instanceof APIError)) throw new TypeError("Expected APIError");
    const body = sendblueApiErrorSchema.parse(error.body);
    expect(body.code).toBe("SENDBLUE_PROVIDER_ERROR");
  });

  it("throws a safe APIError for HTTP 200 failure statuses", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(
      Response.json({
        error_code: 4001,
        status: "ERROR",
      })
    );

    const { sendPhoneCode } = await import("@/auth");
    const error: unknown = await sendPhoneCode({
      code: "123456",
      to: "+12025550123",
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(APIError);
    if (!(error instanceof APIError)) throw new TypeError("Expected APIError");
    const body = sendblueApiErrorSchema.parse(error.body);
    expect(body.code).toBe("SENDBLUE_SENDING_FAILED");
    expect(body.message).toContain("approved");
    expect(JSON.stringify(body)).not.toContain("4001");
  });

  it("returns uncertain for a malformed response instead of exposing it", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(new Response("not json", { status: 200 }));

    const { sendBlueOtp } = await import("@/auth/sendblue");
    const result = await sendBlueOtp({
      apiKeyId: "test-api-key-id",
      apiSecretKey: "test-api-secret-key",
      code: "123456",
      fromNumber: "+12025550199",
      to: "+12025550123",
    });

    expect(result).toEqual({ outcome: "uncertain" });
  });

  it("returns uncertain on timeout without retry", async () => {
    setupSendblueEnv();
    mocks.fetch.mockRejectedValueOnce(new DOMException("Timeout", "TimeoutError"));

    const { sendBlueOtp } = await import("@/auth/sendblue");
    const result = await sendBlueOtp({
      apiKeyId: "test-api-key-id",
      apiSecretKey: "test-api-secret-key",
      code: "123456",
      fromNumber: "+12025550199",
      to: "+12025550123",
    });

    expect(result).toEqual({ outcome: "uncertain" });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("returns uncertain on network failure without retry", async () => {
    setupSendblueEnv();
    mocks.fetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const { sendBlueOtp } = await import("@/auth/sendblue");
    const result = await sendBlueOtp({
      apiKeyId: "test-api-key-id",
      apiSecretKey: "test-api-secret-key",
      code: "123456",
      fromNumber: "+12025550199",
      to: "+12025550123",
    });

    expect(result).toEqual({ outcome: "uncertain" });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("wires sendPhoneCode to SendBlue and not Linq", async () => {
    setupSendblueEnv({
      LINQ_CONNECTOR: "linq/open-instinct",
    });
    mocks.fetch.mockResolvedValueOnce(Response.json({ status: "ACCEPTED" }));

    const { sendPhoneCode } = await import("@/auth");
    await sendPhoneCode({ code: "123456", to: "+12025550123" });

    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://api.sendblue.co/api/send-message");
  });

  it("returns unavailable when SendBlue credentials are missing", async () => {
    setupSendblueEnv({ SENDBLUE_API_SECRET_KEY: undefined });

    const { sendPhoneCode } = await import("@/auth");
    const error: unknown = await sendPhoneCode({
      code: "123456",
      to: "+12025550123",
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(APIError);
    if (!(error instanceof APIError)) throw new TypeError("Expected APIError");
    expect(error.statusCode).toBe(503);
    const body = sendblueApiErrorSchema.parse(error.body);
    expect(body.code).toBe("SENDBLUE_NOT_CONFIGURED");
    expect(body.message).toContain("SendBlue");
  });
});
