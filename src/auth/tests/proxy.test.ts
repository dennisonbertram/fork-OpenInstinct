import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthSession } from "@/auth/session";
import { config, proxy } from "../../proxy";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn<typeof getAuthSession>(),
}));

vi.mock("@/auth/session", () => ({
  getAuthSession: mocks.getAuthSession,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthSession.mockResolvedValue(null);
});

describe("auth proxy matcher", () => {
  it("does not match public fonts", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/fonts/vault-variable.woff2",
      })
    ).toBe(false);
  });

  it("continues to match protected application routes", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig: {},
        url: "/vault",
      })
    ).toBe(true);
  });

  it("leaves scheduled-run authorization to the Eve channel", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/internal/scheduled-run/start")
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getAuthSession).not.toHaveBeenCalled();
  });

  it("allows the schedule dispatcher without a browser session in development", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/eve/v1/dev/schedules/dynamic")
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getAuthSession).not.toHaveBeenCalled();
  });

  it("allows only the channel-onboarding schedule dispatcher without a browser session", async () => {
    const response = await proxy(
      new NextRequest(
        "http://localhost:3000/eve/v1/dev/schedules/channel-onboarding"
      )
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getAuthSession).not.toHaveBeenCalled();
  });

  it("leaves only the SendBlue webhook route to its channel secret check", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/eve/v1/sendblue")
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getAuthSession).not.toHaveBeenCalled();
  });

  it.each([
    "/onboarding/example-1.png",
    "/onboarding/example-2.png",
    "/onboarding/example-3.png",
  ])("allows the public SendBlue onboarding asset %s", async (pathname) => {
    const response = await proxy(
      new NextRequest(`http://localhost:3000${pathname}`)
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(getAuthSession).not.toHaveBeenCalled();
  });

  it("continues to protect arbitrary onboarding files", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/onboarding/private.png")
    );

    expect(response.headers.get("location")).toContain("/sign-in");
    expect(getAuthSession).toHaveBeenCalledOnce();
  });

  it("continues to protect unrelated Eve routes", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/eve/v1/sessions/private")
    );

    expect(response.headers.get("location")).toContain("/sign-in");
    expect(getAuthSession).toHaveBeenCalledOnce();
  });
});
