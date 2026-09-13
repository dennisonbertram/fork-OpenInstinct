import { z } from "zod";

export type DiagnosticTarget = "local" | "preview" | "production";
export type DiagnosticSurface = "app" | "marketing";
export type DiagnosticGapReason =
  | "missing"
  | "disabled"
  | "expired"
  | "truncated"
  | "cannot_determine"
  | "forbidden"
  | "unavailable";

interface DiagnosticSelector {
  readonly kind: "session" | "request" | "provider_handle";
  readonly value: string;
}

export type DiagnosticArgs =
  | {
      readonly mode: "target_status";
      readonly target: DiagnosticTarget;
      readonly surface: DiagnosticSurface;
      readonly deploymentId?: string;
    }
  | {
      readonly mode: "journey";
      readonly target: DiagnosticTarget;
      readonly surface: DiagnosticSurface;
      readonly deploymentId?: string;
      readonly selector: DiagnosticSelector;
      readonly since: string;
      readonly until: string;
    };

type SafeValue = boolean | null | number | string;
type DiagnosticJsonValue = SafeValue | undefined;

type DiagnosticQuery = Record<string, DiagnosticJsonValue>;

export interface DiagnosticObservation extends Record<
  string,
  DiagnosticJsonValue
> {
  readonly owner: string;
  readonly kind: string;
}

interface MutableDiagnosticObservation extends Record<
  string,
  DiagnosticJsonValue
> {
  owner: string;
  kind: string;
}

interface MutableSanitizedFact {
  status: TargetIdentityFact["status"];
  value?: SafeValue;
  declared?: SafeValue;
  observed?: SafeValue;
  reason?: string;
}

export interface TargetIdentityFact {
  readonly status: "observed" | "unknown" | "mismatch";
  readonly value?: SafeValue;
  readonly declared?: SafeValue;
  readonly observed?: SafeValue;
  readonly reason?: string;
}

export interface DiagnosticResult {
  readonly query: DiagnosticQuery;
  readonly status: "complete" | "partial" | "incomplete";
  readonly targetIdentity: {
    readonly facts: Record<string, TargetIdentityFact>;
  };
  readonly capabilities: readonly {
    readonly name: string;
    readonly state:
      | "available"
      | "disabled"
      | "missing"
      | "expired"
      | "forbidden"
      | "unavailable";
  }[];
  readonly observations: readonly DiagnosticObservation[];
  readonly gaps: readonly {
    readonly owner: string;
    readonly reason: DiagnosticGapReason;
  }[];
  readonly bounds: {
    readonly pageLimit: number;
    readonly pagesRead: number;
    readonly truncated: boolean;
    readonly redaction: "allowlist";
  };
}

const selectorFlags = new Map<string, DiagnosticSelector["kind"]>([
  ["--session", "session"],
  ["--request", "request"],
  ["--provider-handle", "provider_handle"],
]);
const identifier = /^[a-zA-Z0-9._:-]{1,256}$/u;
const stringValue = z.string();
const booleanValue = z.boolean();
const numberValue = z.number();

export function parseDiagnosticArgs(argv: readonly string[]): DiagnosticArgs {
  const values = new Map<string, string>();
  const selectors: DiagnosticSelector[] = [];
  let status = false;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--status") {
      if (status) throw new Error("--status may appear once.");
      status = true;
      continue;
    }
    const selectorKind = selectorFlags.get(flag ?? "");
    if (selectorKind) {
      const value = argv[++index];
      if (!isIdentifier(value))
        throw new Error(`Invalid ${flag ?? ""} selector.`);
      selectors.push({ kind: selectorKind, value });
      continue;
    }
    if (!isValueFlag(flag))
      throw new Error(`Unknown diagnostic argument: ${flag ?? ""}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`Missing value for ${flag}.`);
    if (values.has(flag)) throw new Error(`${flag} may appear once.`);
    values.set(flag, value);
  }

  const target = values.get("--target");
  if (!isDiagnosticTarget(target)) throw new Error("--target is required.");
  const surface = values.get("--surface") ?? "app";
  if (!isDiagnosticSurface(surface)) throw new Error("Invalid --surface.");
  const deploymentId = values.get("--deployment");
  if (target === "preview") {
    if (
      !deploymentId ||
      !isIdentifier(deploymentId) ||
      deploymentId === "latest"
    ) {
      throw new Error("Preview diagnosis requires an immutable --deployment.");
    }
  } else if (deploymentId !== undefined) {
    throw new Error("--deployment is only valid for preview diagnosis.");
  }

  if (status) {
    if (
      selectors.length > 0 ||
      values.has("--since") ||
      values.has("--until")
    ) {
      throw new Error(
        "--status cannot include a journey selector or time window."
      );
    }
    const result: Extract<DiagnosticArgs, { mode: "target_status" }> = {
      mode: "target_status",
      target,
      surface,
    };
    return deploymentId === undefined ? result : { ...result, deploymentId };
  }

  if (selectors.length !== 1)
    throw new Error("Journey diagnosis requires exactly one selector.");
  const since = values.get("--since");
  const until = values.get("--until");
  if (!isUtcTimestamp(since) || !isUtcTimestamp(until)) {
    throw new Error(
      "Journey diagnosis requires UTC --since and --until values."
    );
  }
  const sinceAt = new Date(since).getTime();
  const untilAt = new Date(until).getTime();
  if (untilAt <= sinceAt || untilAt - sinceAt > 24 * 60 * 60 * 1000) {
    throw new Error(
      "Journey window must be positive and no longer than 24 hours."
    );
  }
  const selector = selectors[0];
  if (!selector) throw new Error("Journey diagnosis requires one selector.");
  const result: Extract<DiagnosticArgs, { mode: "journey" }> = {
    mode: "journey",
    target,
    surface,
    selector,
    since,
    until,
  };
  return deploymentId === undefined ? result : { ...result, deploymentId };
}

export function serializeDiagnosticResult(result: DiagnosticResult): string {
  return JSON.stringify(sanitizeDiagnosticResult(result));
}

export function sanitizeDiagnosticResult(
  result: DiagnosticResult
): DiagnosticResult {
  return {
    query: sanitizeQuery(result.query),
    status: result.status,
    targetIdentity: { facts: sanitizeFacts(result.targetIdentity.facts) },
    capabilities: result.capabilities.flatMap((capability) => {
      if (!isSafeName(capability.name)) return [];
      return [{ name: capability.name, state: capability.state }];
    }),
    observations: result.observations.flatMap(sanitizeObservation),
    gaps: result.gaps.flatMap((gap) =>
      isSafeName(gap.owner) ? [{ owner: gap.owner, reason: gap.reason }] : []
    ),
    bounds: {
      pageLimit: result.bounds.pageLimit,
      pagesRead: result.bounds.pagesRead,
      truncated: result.bounds.truncated,
      redaction: "allowlist",
    },
  };
}

function isValueFlag(flag: string | undefined) {
  return (
    flag === "--target" ||
    flag === "--surface" ||
    flag === "--deployment" ||
    flag === "--cookie-file" ||
    flag === "--since" ||
    flag === "--until"
  );
}

function isDiagnosticTarget(
  value: string | undefined
): value is DiagnosticTarget {
  return value === "local" || value === "preview" || value === "production";
}

function isDiagnosticSurface(value: string): value is DiagnosticSurface {
  return value === "app" || value === "marketing";
}

function isIdentifier(value: string | undefined): value is string {
  const parsed = stringValue.safeParse(value);
  return (
    parsed.success && identifier.test(parsed.data) && parsed.data !== "latest"
  );
}

function isUtcTimestamp(value: string | undefined): value is string {
  const parsed = stringValue.safeParse(value);
  return (
    parsed.success &&
    parsed.data.endsWith("Z") &&
    !Number.isNaN(Date.parse(parsed.data))
  );
}

function sanitizeQuery(query: DiagnosticQuery): DiagnosticQuery {
  const allowed = new Set([
    "mode",
    "target",
    "surface",
    "selectorKind",
    "selector",
    "since",
    "until",
    "deploymentId",
  ]);
  return Object.fromEntries(
    Object.entries(query).flatMap(([key, value]) => {
      const parsed = stringValue.safeParse(value);
      return allowed.has(key) && parsed.success && isSafeString(parsed.data)
        ? [[key, parsed.data]]
        : [];
    })
  );
}

function sanitizeFacts(facts: Record<string, TargetIdentityFact>) {
  return Object.fromEntries(
    Object.entries(facts).flatMap(([name, fact]) => {
      if (!isSafeFactName(name)) return [];
      return [[name, sanitizeFact(name, fact)]];
    })
  );
}

function sanitizeFact(
  name: string,
  fact: TargetIdentityFact
): TargetIdentityFact {
  const sanitized: MutableSanitizedFact = { status: fact.status };
  for (const key of ["value", "declared", "observed"] as const) {
    const value = fact[key];
    if (value !== undefined && isSafeFactValue(name, value))
      sanitized[key] = value;
  }
  const reason = stringValue.safeParse(fact.reason);
  if (reason.success && isSafeName(reason.data)) sanitized.reason = reason.data;
  return sanitized;
}

function isSafeFactName(name: string) {
  if (!isSafeName(name)) return false;
  if (
    /token|secret|password|credential|message|task|page|workflow|tool|header|digest|phone/i.test(
      name
    )
  )
    return false;
  if (/provider/i.test(name) && !isSafeProviderStateFact(name)) return false;
  return (
    !/url/i.test(name) ||
    name === "canonicalAliasOrigin" ||
    name === "canonicalAuthOrigin" ||
    name === "declaredCanonicalOrigin" ||
    name === "immutableDeploymentOrigin" ||
    name === "servedCanonicalAuthOrigin"
  );
}

function isSafeProviderStateFact(name: string) {
  return (
    name === "providerGoogle" ||
    name === "providerLinq" ||
    name === "providerSendblue" ||
    name === "providerSquare" ||
    name === "otpProvider" ||
    name === "sendblueConversations"
  );
}

function isSafeFactValue(name: string, value: unknown): value is SafeValue {
  if (value === null || booleanValue.safeParse(value).success) return true;
  const parsedNumber = numberValue.safeParse(value);
  if (parsedNumber.success)
    return (
      name.endsWith("Port") &&
      Number.isSafeInteger(parsedNumber.data) &&
      parsedNumber.data > 0 &&
      parsedNumber.data <= 65_535
    );
  const parsedString = stringValue.safeParse(value);
  if (!parsedString.success || !isSafeString(parsedString.data)) return false;
  if (
    name === "providerGoogle" ||
    name === "providerLinq" ||
    name === "providerSendblue" ||
    name === "providerSquare"
  )
    return (
      parsedString.data === "configured-not-validated" ||
      parsedString.data === "incomplete-not-validated" ||
      parsedString.data === "not-configured"
    );
  if (name === "otpProvider")
    return parsedString.data === "linq" || parsedString.data === "sendblue";
  if (name === "sendblueConversations")
    return parsedString.data === "on" || parsedString.data === "off";
  if (
    name === "canonicalAliasOrigin" ||
    name === "canonicalAuthOrigin" ||
    name === "declaredCanonicalOrigin" ||
    name === "immutableDeploymentOrigin" ||
    name === "servedCanonicalAuthOrigin"
  )
    return isPublicHttpsOrigin(parsedString.data);
  if (name === "localAppOrigin" || name === "localMarketingOrigin")
    return isLoopbackHttpOrigin(parsedString.data);
  return !looksLikeUrl(parsedString.data);
}

function sanitizeObservation(observation: DiagnosticObservation) {
  const allowed = new Set([
    "owner",
    "kind",
    "ref",
    "at",
    "execution",
    "verification",
    "reporting",
    "delivery",
    "sourceRevision",
    "sessionId",
    "taskId",
    "childSessionId",
    "runId",
  ]);
  const owner = stringValue.safeParse(observation.owner);
  const kind = stringValue.safeParse(observation.kind);
  if (!owner.success || !kind.success) return [];
  const sanitized: MutableDiagnosticObservation = {
    owner: owner.data,
    kind: kind.data,
  };
  for (const [key, value] of Object.entries(observation)) {
    const parsed = stringValue.safeParse(value);
    if (
      allowed.has(key) &&
      parsed.success &&
      isSafeString(parsed.data) &&
      !looksLikeUrl(parsed.data)
    )
      sanitized[key] = parsed.data;
  }
  return [sanitized];
}

function isSafeName(value: string) {
  return /^[a-zA-Z][a-zA-Z0-9._:-]{0,127}$/u.test(value);
}

function isSafeString(value: string) {
  return value.length > 0 && value.length <= 256 && !/[\r\n]/u.test(value);
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//iu.test(value);
}

function isPublicHttpsOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isLoopbackHttpOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "[::1]") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.port !== ""
    );
  } catch {
    return false;
  }
}
