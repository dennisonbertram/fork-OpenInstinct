import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/trpc/router";
import { z } from "zod";

const transportErrorSchema = z.object({
  name: z.literal("TRPCClientError"),
  data: z.object({ httpStatus: z.number().optional() }).optional(),
});

const DIAGNOSTIC_REQUEST_TIMEOUT_MS = 5_000;

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export async function boundedDiagnosticFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: {
    readonly fetchImplementation?: FetchImplementation;
    readonly timeoutMs?: number;
  } = {}
) {
  const response = await (options.fetchImplementation ?? fetch)(input, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(
      options.timeoutMs ?? DIAGNOSTIC_REQUEST_TIMEOUT_MS
    ),
  });
  if (response.redirected || (response.status >= 300 && response.status < 400))
    throw new Error("Diagnostic reader rejects redirected responses.");
  return response;
}

export async function readProtectedJourney(input: {
  readonly origin: string;
  readonly cookie: string;
  readonly sessionId: string;
  readonly sinceUtc: string;
  readonly untilUtc: string;
  readonly allowLocalLoopback?: boolean;
}) {
  if (!isAllowedOrigin(input.origin, input.allowLocalLoopback ?? false))
    return { kind: "gap" as const, reason: "cannot_determine" as const };
  try {
    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: new URL("/api/trpc", input.origin).toString(),
          headers: () => ({ cookie: input.cookie }),
          fetch: boundedDiagnosticFetch,
        }),
      ],
    });
    return {
      kind: "result" as const,
      value: await client.operations.journey.query({
        sessionId: input.sessionId,
        sinceUtc: input.sinceUtc,
        untilUtc: input.untilUtc,
      }),
    };
  } catch (error) {
    const parsedError = transportErrorSchema.safeParse(error);
    const status = parsedError.success
      ? parsedError.data.data?.httpStatus
      : undefined;
    if (status === 401 || status === 403 || status === 404)
      return { kind: "gap" as const, reason: "forbidden" as const };
    return { kind: "gap" as const, reason: "unavailable" as const };
  }
}

export async function readAdminIdentity(input: {
  readonly origin: string;
  readonly cookie: string;
  readonly allowLocalLoopback?: boolean;
}) {
  if (!isAllowedOrigin(input.origin, input.allowLocalLoopback ?? false))
    return { kind: "gap" as const, reason: "cannot_determine" as const };
  try {
    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: new URL("/api/trpc", input.origin).toString(),
          headers: () => ({ cookie: input.cookie }),
          fetch: boundedDiagnosticFetch,
        }),
      ],
    });
    return {
      kind: "result" as const,
      value: await client.admin.operationsIdentity.query(),
    };
  } catch (error) {
    const parsedError = transportErrorSchema.safeParse(error);
    const status = parsedError.success
      ? parsedError.data.data?.httpStatus
      : undefined;
    if (status === 401 || status === 403 || status === 404)
      return { kind: "gap" as const, reason: "forbidden" as const };
    return { kind: "gap" as const, reason: "unavailable" as const };
  }
}

function isAllowedOrigin(value: string, allowLocalLoopback: boolean) {
  try {
    const url = new URL(value);
    return (
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      (url.protocol === "https:" ||
        (allowLocalLoopback &&
          url.protocol === "http:" &&
          (url.hostname === "localhost" ||
            url.hostname === "127.0.0.1" ||
            url.hostname === "[::1]") &&
          url.port.length > 0))
    );
  } catch {
    return false;
  }
}
