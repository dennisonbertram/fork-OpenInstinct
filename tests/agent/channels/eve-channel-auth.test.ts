import type { RouteHandlerArgs } from "eve/channels";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as AuthSession from "@/auth/session";
import * as SessionService from "@/db/services/sessions";
import * as ScopeService from "@/db/services/scope";
import * as Environment from "@/env";
import { authSessionFor } from "@/tests/helpers/auth-session";
import eveChannel, { sessionIdFromPath } from "@/agent/channels/eve";

const getAuthSessionMock = vi.spyOn(AuthSession, "getAuthSession");
const isSessionOwnedMock = vi.spyOn(SessionService, "isSessionOwned");
const isWorkspaceScopeEnforcementEnabledMock = vi.spyOn(
  Environment,
  "isWorkspaceScopeEnforcementEnabled"
);
const verifyScopeAccessMock = vi.spyOn(ScopeService, "verifyScopeAccess");

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  getAuthSessionMock.mockResolvedValue(
    authSessionFor({
      id: "user-1",
      phoneNumber: "+12025550123",
      phoneNumberVerified: true,
    })
  );
  isSessionOwnedMock.mockResolvedValue(false);
  isWorkspaceScopeEnforcementEnabledMock.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Eve channel authentication", () => {
  it("rejects a denied scope with the same response as a missing session", async () => {
    const route = sessionStreamRoute();
    isWorkspaceScopeEnforcementEnabledMock.mockReturnValue(true);
    verifyScopeAccessMock.mockResolvedValue(undefined);

    const denied = await route.handler(
      new Request(
        "https://assistant.example/eve/v1/session/session-one/stream"
      ),
      unexpectedRouteContext()
    );
    getAuthSessionMock.mockResolvedValue(null);
    const unauthenticated = await route.handler(
      new Request(
        "https://assistant.example/eve/v1/session/session-one/stream"
      ),
      unexpectedRouteContext()
    );

    expect(denied.status).toBe(401);
    expect(await denied.text()).toBe(await unauthenticated.text());
  });

  it("requires membership verification by default before session admission", async () => {
    const route = sessionStreamRoute();
    verifyScopeAccessMock.mockResolvedValue(undefined);

    const responsePromise = route.handler(
      new Request(
        "https://assistant.example/eve/v1/session/session-one/stream"
      ),
      unexpectedRouteContext()
    );
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(401);
    expect(verifyScopeAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "better-auth:user-1" })
    );
    expect(isSessionOwnedMock).not.toHaveBeenCalled();
  });

  it("checks decoded session route ids against workspace ownership", async () => {
    const route = sessionStreamRoute();
    verifyScopeAccessMock.mockResolvedValue({
      membershipStatus: "active",
      role: "owner",
      userId: "better-auth:user-1",
      workspaceId: "workspace-1",
    });

    const responsePromise = route.handler(
      new Request(
        "https://assistant.example/eve/v1/session/session%2Fone/stream"
      ),
      unexpectedRouteContext()
    );
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(403);
    expect(isSessionOwnedMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "better-auth:user-1" }),
      "session/one"
    );
  });

  it("checks hook-resume routes against the session named in the token", async () => {
    const route = findRoute("POST", "/eve/v1/callback/:token");

    const responsePromise = route.handler(
      new Request(
        "https://assistant.example/eve/v1/callback/eve%3Asession%3Awrun_victim%3Ainbox",
        { body: "{}", method: "POST" }
      ),
      unexpectedRouteContext()
    );
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(403);
    expect(isSessionOwnedMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "better-auth:user-1" }),
      "wrun_victim"
    );
  });

  it("fails closed on routes whose subject cannot be resolved", async () => {
    const route = findRoute("POST", "/eve/v1/task-input/:token");

    const response = await route.handler(
      new Request(
        "https://assistant.example/eve/v1/task-input/eve:task-input:0123456789abcdef0123456789abcdef",
        { body: "{}", method: "POST" }
      ),
      unexpectedRouteContext()
    );

    expect(response.status).toBe(403);
    expect(isSessionOwnedMock).not.toHaveBeenCalled();
  });

  it("extracts session ids from paths and derived hook tokens", () => {
    expect(sessionIdFromPath("/eve/v1/session/wrun_1/stream")).toBe("wrun_1");
    expect(sessionIdFromPath("/eve/v1/callback/eve:session:wrun_1:inbox")).toBe(
      "wrun_1"
    );
    expect(
      sessionIdFromPath("/eve/v1/callback/wrun_1:turn-control:3:cancel")
    ).toBe("wrun_1");
    expect(
      sessionIdFromPath(
        "/eve/v1/connections/google/callback/attempt/wrun_1:auth"
      )
    ).toBe("wrun_1");
    expect(
      sessionIdFromPath("/eve/v1/connections/google/callback/wrun_1:auth")
    ).toBe("wrun_1");
    expect(
      sessionIdFromPath(
        "/eve/v1/callback/task:task_1:0123456789abcdef0123456789abcdef"
      )
    ).toBeUndefined();
    expect(
      sessionIdFromPath("/eve/v1/task-input/eve:task-input:abc")
    ).toBeUndefined();
    expect(sessionIdFromPath("/eve/v1/session")).toBeUndefined();
  });
});

function sessionStreamRoute() {
  return findRoute("GET", "/eve/v1/session/:sessionId/stream");
}

function findRoute(method: string, path: string) {
  const route = eveChannel.routes.find(
    (candidate) =>
      candidate.transport !== "websocket" &&
      candidate.method === method &&
      candidate.path === path
  );
  if (!route || route.transport === "websocket") {
    throw new Error(`The Eve route ${method} ${path} is unavailable.`);
  }
  return route;
}

function unexpectedRouteContext() {
  return {
    attachSession: unexpectedRouteRequest,
    from: unexpectedRouteRequest,
    params: { sessionId: "session/one" },
    requestIp: null,
    resolveSession: unexpectedRouteRequest,
    to: unexpectedRouteRequest,
    waitUntil: unexpectedRouteRequest,
  } satisfies RouteHandlerArgs;
}

function unexpectedRouteRequest(): never {
  throw new Error("The request should stop at authorization.");
}
