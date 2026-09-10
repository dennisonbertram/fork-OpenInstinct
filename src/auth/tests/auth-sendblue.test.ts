import { APIError } from "better-auth/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }));

vi.stubGlobal("fetch", mocks.fetch);
vi.mock("@/auth/linq", () => ({
  LinqDeliveryError: class LinqDeliveryError extends Error {},
  linqOtpFailure: vi.fn<() => { code: string; message: string }>(),
  readLinqOnboardingPhoneNumber: vi.fn<() => Promise<undefined>>(),
  sendLinqText: vi.fn<() => Promise<void>>(),
}));

const sendblueApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const requestInitSchema = z.object({
  method: z.string(),
  redirect: z.string(),
  signal: z.any(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
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
    const call = mocks.fetch.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe("https://api.sendblue.co/api/send-message");

    const requestInit = requestInitSchema.parse(init);
    expect(requestInit.method).toBe("POST");
    expect(requestInit.redirect).toBe("error");
    expect(requestInit.signal).toBeInstanceOf(AbortSignal);

    const headers = new Headers(requestInit.headers);
    expect(headers.get("sb-api-key-id")).toBe("test-api-key-id");
    expect(headers.get("sb-api-secret-key")).toBe("test-api-secret-key");
    expect(headers.get("Content-Type")).toBe("application/json");

    const body: unknown = JSON.parse(requestInit.body);
    expect(body).toEqual({
      content:
        "Local Vault Assistant sign-in code: 123456. Expires in 5 minutes.",
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
    expect(body.message).toContain("API key ID and secret key");
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

  it("throws SENDBLUE_SUBMISSION_UNCONFIRMED for HTTP 503 without a terminal failure body", async () => {
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
    expect(body.code).toBe("SENDBLUE_SUBMISSION_UNCONFIRMED");
    expect(body.message).toContain("could not be confirmed");
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("throws a safe APIError for HTTP 503 with a terminal failure body", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(
      Response.json({ error_code: 5001, status: "ERROR" }, { status: 503 })
    );

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
    expect(body.message).toContain("registered");
    expect(body.message).toContain("eligible");
    expect(JSON.stringify(body)).not.toContain("4001");
  });

  it("returns uncertain for a malformed response instead of exposing it", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(
      new Response("not json", { status: 200 })
    );

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
    mocks.fetch.mockRejectedValueOnce(
      new DOMException("Timeout", "TimeoutError")
    );

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
    const call = mocks.fetch.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const [url] = call;
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

  it("throws SENDBLUE_SUBMISSION_UNCONFIRMED for a timeout through sendPhoneCode", async () => {
    setupSendblueEnv();
    mocks.fetch.mockRejectedValueOnce(
      new DOMException("Timeout", "TimeoutError")
    );

    const { sendPhoneCode } = await import("@/auth");
    const error: unknown = await sendPhoneCode({
      code: "123456",
      to: "+12025550123",
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(APIError);
    if (!(error instanceof APIError)) throw new TypeError("Expected APIError");
    const body = sendblueApiErrorSchema.parse(error.body);
    expect(body.code).toBe("SENDBLUE_SUBMISSION_UNCONFIRMED");
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("throws SENDBLUE_SUBMISSION_UNCONFIRMED for a malformed response through sendPhoneCode", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(
      new Response("not json", { status: 200 })
    );

    const { sendPhoneCode } = await import("@/auth");
    const error: unknown = await sendPhoneCode({
      code: "123456",
      to: "+12025550123",
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(APIError);
    if (!(error instanceof APIError)) throw new TypeError("Expected APIError");
    const body = sendblueApiErrorSchema.parse(error.body);
    expect(body.code).toBe("SENDBLUE_SUBMISSION_UNCONFIRMED");
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("does not call Linq when SendBlue is selected and submission is uncertain", async () => {
    setupSendblueEnv({ LINQ_CONNECTOR: "linq/open-instinct" });
    mocks.fetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const { sendLinqText } = await import("@/auth/linq");
    const { sendPhoneCode } = await import("@/auth");
    const error: unknown = await sendPhoneCode({
      code: "123456",
      to: "+12025550123",
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(APIError);
    if (!(error instanceof APIError)) throw new TypeError("Expected APIError");
    const body = sendblueApiErrorSchema.parse(error.body);
    expect(body.code).toBe("SENDBLUE_SUBMISSION_UNCONFIRMED");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(sendLinqText).not.toHaveBeenCalled();
  });

  it("does not POST SendBlue for an invalid sender or recipient", async () => {
    setupSendblueEnv();

    const { sendBlueOtp } = await import("@/auth/sendblue");
    const error: unknown = await sendBlueOtp({
      apiKeyId: "test-api-key-id",
      apiSecretKey: "test-api-secret-key",
      code: "123456",
      fromNumber: "not-e164",
      to: "+12025550123",
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(
      await import("@/auth/sendblue").then((m) => m.SendBlueDeliveryError)
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not expose raw provider body, OTP, keys, or phone numbers in API errors or helper exceptions", async () => {
    setupSendblueEnv();
    mocks.fetch.mockResolvedValueOnce(
      Response.json({
        error_code: 4001,
        error_message: "Invalid recipient +12025550123",
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
    const serializedError = JSON.stringify(error);
    const serializedBody = JSON.stringify(error.body);
    expect(serializedBody).not.toContain("123456");
    expect(serializedBody).not.toContain("+12025550123");
    expect(serializedBody).not.toContain("test-api-key-id");
    expect(serializedBody).not.toContain("test-api-secret-key");
    expect(serializedBody).not.toContain("4001");
    expect(serializedBody).not.toContain("Invalid recipient");
    expect(serializedBody).not.toContain("ERROR");
    expect(serializedError).not.toContain("123456");
    expect(serializedError).not.toContain("+12025550123");
    expect(serializedError).not.toContain("test-api-key-id");
    expect(serializedError).not.toContain("test-api-secret-key");
    expect(serializedError).not.toContain("Invalid recipient");
  });

  describe("error_code: null handling", () => {
    it.each([
      "QUEUED",
      "SENT",
      "DELIVERED",
      "REGISTERED",
      "PENDING",
      "ACCEPTED",
    ])("treats %s with error_code: null as submitted", async (status) => {
      setupSendblueEnv();
      mocks.fetch.mockResolvedValueOnce(
        Response.json({ error_code: null, status })
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
    });

    it("returns uncertain for HTTP 503 with error_code: null and no terminal status", async () => {
      setupSendblueEnv();
      mocks.fetch.mockResolvedValueOnce(
        Response.json({ error_code: null }, { status: 503 })
      );

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

    it("fails for ERROR with error_code: null", async () => {
      setupSendblueEnv();
      mocks.fetch.mockResolvedValueOnce(
        Response.json({ error_code: null, status: "ERROR" })
      );

      const { sendBlueOtp, SendBlueDeliveryError } =
        await import("@/auth/sendblue");
      const error: unknown = await sendBlueOtp({
        apiKeyId: "test-api-key-id",
        apiSecretKey: "test-api-secret-key",
        code: "123456",
        fromNumber: "+12025550199",
        to: "+12025550123",
      }).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(SendBlueDeliveryError);
    });

    it("fails for DECLINED with error_code: null", async () => {
      setupSendblueEnv();
      mocks.fetch.mockResolvedValueOnce(
        Response.json({ error_code: null, status: "DECLINED" })
      );

      const { sendBlueOtp, SendBlueDeliveryError } =
        await import("@/auth/sendblue");
      const error: unknown = await sendBlueOtp({
        apiKeyId: "test-api-key-id",
        apiSecretKey: "test-api-secret-key",
        code: "123456",
        fromNumber: "+12025550199",
        to: "+12025550123",
      }).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(SendBlueDeliveryError);
    });

    it.each([4001, 5001, 1])(
      "fails for nonzero numeric error_code %s even when the status is accepted",
      async (error_code) => {
        setupSendblueEnv();
        mocks.fetch.mockResolvedValueOnce(
          Response.json({ error_code, status: "ACCEPTED" })
        );

        const { sendBlueOtp, SendBlueDeliveryError } =
          await import("@/auth/sendblue");
        const error: unknown = await sendBlueOtp({
          apiKeyId: "test-api-key-id",
          apiSecretKey: "test-api-secret-key",
          code: "123456",
          fromNumber: "+12025550199",
          to: "+12025550123",
        }).catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(SendBlueDeliveryError);
      }
    );
  });
});
