import { z } from "zod";

const maxEvents = 128;
const maxBytes = 128 * 1024;
const streamTimeoutMs = 5_000;
const safeIdSchema = z.string().regex(/^[a-zA-Z0-9._:-]{1,256}$/u);
const eventSchema = z.looseObject({
  type: z.string(),
  meta: z.object({ id: safeIdSchema, at: z.string() }),
  data: z.looseObject({ childSessionId: safeIdSchema.optional() }),
});
const lifecycleTypes = new Set([
  "session.started",
  "session.waiting",
  "session.completed",
  "session.failed",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "turn.cancelled",
  "step.started",
  "step.completed",
  "step.failed",
]);

export interface EveSessionMetadata {
  readonly observations: readonly {
    readonly owner: "eve";
    readonly kind: "child_session" | "lifecycle";
    readonly ref: string;
    readonly at: string;
    readonly execution: string;
  }[];
  readonly childSessionIds: readonly string[];
  readonly gap?: "cannot_determine" | "forbidden" | "truncated" | "unavailable";
}

export async function readEveSessionMetadata(input: {
  readonly origin: string;
  readonly cookie: string;
  readonly sessionId: string;
  readonly since: string;
  readonly until: string;
  readonly allowLocalLoopback?: boolean;
  readonly fetchImpl?: typeof fetch;
}): Promise<EveSessionMetadata> {
  if (!isAllowedOrigin(input.origin, input.allowLocalLoopback ?? false))
    return empty("cannot_determine");
  const fetchImpl = input.fetchImpl ?? fetch;
  const tail = await readTailIndex(input, fetchImpl);
  if (tail.kind !== "tail") return empty(tail.gap);
  if (tail.index < 0) return empty("cannot_determine");
  const startIndex = Math.max(0, tail.index - maxEvents + 1);
  const omittedEarlierEvents = startIndex > 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, streamTimeoutMs);
  try {
    const response = await fetchImpl(
      streamUrl(input.origin, input.sessionId, startIndex),
      {
        cache: "no-store",
        headers: { cookie: input.cookie },
        redirect: "error",
        signal: controller.signal,
      }
    );
    if (!response.ok) return empty(statusGap(response.status));
    if (!response.body) return empty("unavailable");
    const parsed = await readBoundedNdjson(
      response.body,
      input.since,
      input.until,
      tail.index - startIndex + 1
    );
    const result: EveSessionMetadata = {
      observations: parsed.observations,
      childSessionIds: [...parsed.children],
    };
    if (parsed.gap !== undefined) return { ...result, gap: parsed.gap };
    if (omittedEarlierEvents) return { ...result, gap: "truncated" };
    return result;
  } catch {
    return empty("unavailable");
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function readTailIndex(
  input: {
    readonly origin: string;
    readonly cookie: string;
    readonly sessionId: string;
  },
  fetchImpl: typeof fetch
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, streamTimeoutMs);
  try {
    const response = await fetchImpl(
      streamUrl(input.origin, input.sessionId, 0),
      {
        cache: "no-store",
        headers: { cookie: input.cookie },
        redirect: "error",
        signal: controller.signal,
      }
    );
    const value = response.headers.get("x-eve-stream-tail-index");
    await response.body?.cancel();
    if (!response.ok) return { gap: statusGap(response.status) } as const;
    const index = value === null ? Number.NaN : Number(value);
    return Number.isSafeInteger(index) && index >= -1
      ? { kind: "tail" as const, index }
      : { gap: "cannot_determine" as const };
  } catch {
    return { gap: "unavailable" as const };
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function readBoundedNdjson(
  body: ReadableStream<Uint8Array>,
  since: string,
  until: string,
  expectedEvents: number
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const observations: EveSessionMetadata["observations"][number][] = [];
  const children = new Set<string>();
  let bytes = 0;
  let eventsRead = 0;
  let buffer = "";
  let gap: EveSessionMetadata["gap"];
  try {
    while (
      eventsRead < expectedEvents &&
      eventsRead < maxEvents &&
      bytes < maxBytes
    ) {
      // A stream is sequential: the next chunk must be read before its bounded
      // tail index, line count, and byte budget can be evaluated.
      // eslint-disable-next-line no-await-in-loop
      const next = await reader.read();
      if (next.done) {
        if (buffer.length > 0) {
          eventsRead += 1;
          const event = parseEvent(buffer, since, until);
          if (event) {
            observations.push(event.observation);
            if (event.childSessionId) children.add(event.childSessionId);
          }
          buffer = "";
        }
        if (eventsRead < expectedEvents) gap = "truncated";
        break;
      }
      bytes += next.value.byteLength;
      if (bytes > maxBytes) {
        gap = "truncated";
        break;
      }
      buffer += decoder.decode(next.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (eventsRead >= maxEvents || eventsRead >= expectedEvents) {
          gap = "truncated";
          break;
        }
        eventsRead += 1;
        const event = parseEvent(line, since, until);
        if (!event) continue;
        observations.push(event.observation);
        if (event.childSessionId) children.add(event.childSessionId);
      }
      if (
        eventsRead + 1 === expectedEvents &&
        buffer.length > 0 &&
        isCompleteJsonLine(buffer)
      ) {
        eventsRead += 1;
        captureEvent(buffer, since, until, observations, children);
        buffer = "";
        break;
      }
    }
    if (eventsRead < expectedEvents && gap === undefined) gap = "truncated";
  } catch {
    gap = "unavailable";
  } finally {
    await reader.cancel();
  }
  return { observations, children, gap };
}

function parseEvent(line: string, since: string, until: string) {
  try {
    const parsed = eventSchema.safeParse(JSON.parse(line));
    if (!parsed.success) return undefined;
    const value = parsed.data;
    const type = value.type;
    const id = value.meta.id;
    const at = value.meta.at;
    if (!isUtcInWindow(at, since, until)) return undefined;
    if (type === "subagent.called" && value.data.childSessionId !== undefined) {
      return {
        observation: {
          owner: "eve" as const,
          kind: "child_session" as const,
          ref: id,
          at,
          execution: "delegated",
        },
        childSessionId: value.data.childSessionId,
      };
    }
    if (lifecycleTypes.has(type)) {
      return {
        observation: {
          owner: "eve" as const,
          kind: "lifecycle" as const,
          ref: id,
          at,
          execution: type,
        },
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function streamUrl(origin: string, sessionId: string, startIndex: number) {
  const url = new URL(
    `/eve/v1/session/${encodeURIComponent(sessionId)}/stream`,
    origin
  );
  url.searchParams.set("startIndex", String(startIndex));
  url.searchParams.set("includeTailIndex", "1");
  return url;
}

function empty(gap: EveSessionMetadata["gap"]): EveSessionMetadata {
  const result: EveSessionMetadata = { observations: [], childSessionIds: [] };
  return gap === undefined ? result : { ...result, gap };
}

function statusGap(status: number): "forbidden" | "unavailable" {
  return status === 401 || status === 403 || status === 404
    ? "forbidden"
    : "unavailable";
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

function isUtcInWindow(value: string, since: string, until: string) {
  const at = Date.parse(value);
  return (
    value.endsWith("Z") &&
    !Number.isNaN(at) &&
    at >= Date.parse(since) &&
    at <= Date.parse(until)
  );
}

function isCompleteJsonLine(value: string) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function captureEvent(
  line: string,
  since: string,
  until: string,
  observations: EveSessionMetadata["observations"][number][],
  children: Set<string>
) {
  const event = parseEvent(line, since, until);
  if (!event) return;
  observations.push(event.observation);
  if (event.childSessionId) children.add(event.childSessionId);
}
