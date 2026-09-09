import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe("signup route handler", () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetEnv();
  });

  it("forwards { email } to Core and returns Core's 2xx { ok: true }", async () => {
    process.env.JORY_CORE_BASE_URL = "https://jory-core.example";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      status: 200,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/signup/route");
    const res = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: JSON.stringify({ email: "sam@example.com" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://jory-core.example/public/signup");
    expect(JSON.parse(String(init!.body))).toEqual({
      email: "sam@example.com",
    });
  });

  it("returns 503 core_unreachable when JORY_CORE_BASE_URL is unset", async () => {
    delete process.env.JORY_CORE_BASE_URL;

    const { POST } = await import("@/app/api/signup/route");
    const res = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: JSON.stringify({ email: "sam@example.com" }),
      })
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "core_unreachable" });
  });

  it("returns 503 core_unreachable when the fetch to Core fails", async () => {
    process.env.JORY_CORE_BASE_URL = "https://jory-core.example";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const { POST } = await import("@/app/api/signup/route");
    const res = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: JSON.stringify({ email: "sam@example.com" }),
      })
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "core_unreachable" });
  });

  it("passes Core's 400 invalid_email through unchanged", async () => {
    process.env.JORY_CORE_BASE_URL = "https://jory-core.example";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 400,
        json: async () => ({ ok: false, error: "invalid_email" }),
      }))
    );

    const { POST } = await import("@/app/api/signup/route");
    const res = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: JSON.stringify({ email: "not-an-email" }),
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_email" });
  });

  it("returns 400 invalid_email for a non-JSON body without calling Core", async () => {
    process.env.JORY_CORE_BASE_URL = "https://jory-core.example";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/signup/route");
    const res = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_email" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_email when email is not a string, without calling Core", async () => {
    process.env.JORY_CORE_BASE_URL = "https://jory-core.example";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/signup/route");
    const res = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: JSON.stringify({ email: 12345 }),
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_email" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_email for an email longer than 254 chars, without calling Core", async () => {
    process.env.JORY_CORE_BASE_URL = "https://jory-core.example";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const longEmail = `${"a".repeat(250)}@x.co`; // 255 chars
    const { POST } = await import("@/app/api/signup/route");
    const res = await POST(
      new Request("http://localhost/api/signup", {
        method: "POST",
        body: JSON.stringify({ email: longEmail }),
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_email" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
