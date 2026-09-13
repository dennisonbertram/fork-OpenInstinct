import {
  parseDiagnosticArgs,
  sanitizeDiagnosticResult,
  serializeDiagnosticResult,
  type DiagnosticArgs,
  type DiagnosticResult,
  type TargetIdentityFact,
} from "./contract";
import { readEveSessionMetadata } from "./eve-stream";
import { readAdminIdentity, readProtectedJourney } from "./operations-query";
import { readDiagnosticCookie, readTarget } from "./read-target";
import type { OperationsIdentity } from "@/lib/operations/identity";
import { z } from "zod";

type SafeScalar = string | number | boolean | null | undefined;
interface MutableTargetFact {
  status: TargetIdentityFact["status"];
  value?: TargetIdentityFact["value"];
  reason?: string;
}

interface DiagnosticObservation extends Record<string, SafeScalar> {
  readonly owner: string;
  readonly kind: string;
  readonly ref?: string;
  readonly at?: string;
  readonly execution?: string;
  readonly verification?: string;
  readonly reporting?: string;
  readonly delivery?: string;
}

interface DiagnosticQuery extends Record<string, SafeScalar> {
  readonly mode: string;
  readonly target: string;
  readonly surface: string;
  readonly selectorKind?: string;
  readonly selector?: string;
  readonly since?: string;
  readonly until?: string;
  readonly deploymentId?: string;
}

export interface DiagnosticReader {
  readonly owner: string;
  readonly read: (
    input: DiagnosticArgs
  ) => Promise<readonly DiagnosticObservation[]>;
}

export interface DiagnosticDependencies {
  readonly readTargetIdentity: (
    input: DiagnosticArgs
  ) => Promise<DiagnosticResult["targetIdentity"]>;
  readonly readers: readonly DiagnosticReader[];
}

type MutableDiagnosticResult = Omit<
  DiagnosticResult,
  "bounds" | "capabilities" | "gaps" | "observations" | "status"
> & {
  status: DiagnosticResult["status"];
  capabilities: DiagnosticResult["capabilities"][number][];
  gaps: DiagnosticResult["gaps"][number][];
  observations: DiagnosticObservation[];
  bounds: DiagnosticResult["bounds"];
};

export async function runDiagnostics(
  input: DiagnosticArgs,
  dependencies: DiagnosticDependencies
) {
  const [identity, ...reads] = await Promise.allSettled([
    dependencies.readTargetIdentity(input),
    ...dependencies.readers.map(async (reader) => ({
      owner: reader.owner,
      observations: await reader.read(input),
    })),
  ]);
  const observations: DiagnosticObservation[] = [];
  const gaps: DiagnosticResult["gaps"][number][] = [];
  let targetIdentity: DiagnosticResult["targetIdentity"] = { facts: {} };
  if (identity.status === "fulfilled") {
    targetIdentity = identity.value;
  } else {
    gaps.push({ owner: "target_identity", reason: "unavailable" });
  }
  for (const read of reads) {
    if (read.status === "fulfilled") {
      observations.push(...read.value.observations);
    } else {
      const owner =
        dependencies.readers[reads.indexOf(read)]?.owner ?? "reader";
      gaps.push({ owner, reason: "unavailable" });
    }
  }
  const result: MutableDiagnosticResult = {
    query: queryFor(input),
    status: gaps.length > 0 ? "incomplete" : "complete",
    targetIdentity,
    capabilities: [],
    observations,
    gaps,
    bounds: {
      pageLimit: 100,
      pagesRead: dependencies.readers.length,
      truncated: false,
      redaction: "allowlist",
    },
  };
  const safeResult = sanitizeDiagnosticResult(result);
  return {
    exitCode: safeResult.status === "complete" ? 0 : 1,
    result: safeResult,
  };
}

function queryFor(input: DiagnosticArgs): DiagnosticQuery {
  const query: DiagnosticQuery = {
    mode: input.mode,
    target: input.target,
    surface: input.surface,
  };
  if (input.mode === "journey") {
    Object.assign(query, {
      selectorKind: input.selector.kind,
      selector: input.selector.value,
      since: input.since,
      until: input.until,
    });
  }
  if (input.deploymentId !== undefined)
    Object.assign(query, { deploymentId: input.deploymentId });
  return query;
}

export async function main(argv = process.argv.slice(2)) {
  let parsed: DiagnosticArgs;
  try {
    parsed = parseDiagnosticArgs(argv);
  } catch {
    process.exitCode = 2;
    process.stdout.write(
      `${JSON.stringify({ status: "incomplete", gaps: [{ owner: "command", reason: "forbidden" }] })}\n`
    );
    return;
  }
  const target = await readTarget(parsed);
  const composed = await runDiagnostics(parsed, {
    readTargetIdentity: async () => ({ facts: target.facts }),
    readers: [],
  });
  const result: MutableDiagnosticResult = {
    ...composed.result,
    capabilities: [...target.capabilities],
    gaps: [...target.gaps],
    observations: [...composed.result.observations],
    status: target.gaps.length > 0 ? "incomplete" : composed.result.status,
  };
  // Local readiness is established by a verified lifecycle manifest. The
  // admin-only deployment identity query is optional evidence and must not
  // turn a useful local status read into an authentication requirement.
  if (parsed.target !== "local" || diagnosticCookiePath(argv))
    await addRuntimeIdentity(result, argv);
  if (parsed.mode === "journey") await addJourneyEvidence(result, parsed, argv);
  markMismatchesPartial(result);
  const safeResult = sanitizeDiagnosticResult(result);
  process.exitCode = safeResult.status === "complete" ? 0 : 1;
  process.stdout.write(`${serializeDiagnosticResult(safeResult)}\n`);
}

async function addRuntimeIdentity(
  result: MutableDiagnosticResult,
  argv: readonly string[]
) {
  const identityRead = await readBoundDiagnosticTarget<
    Awaited<ReturnType<typeof readAdminIdentity>>
  >(result.targetIdentity.facts, argv, (authentication) =>
    readAdminIdentity(authentication)
  );
  if (identityRead.kind === "missing") {
    result.capabilities.push({
      name: "admin_runtime_identity",
      state: "missing",
    });
    appendGap(result, "admin_runtime_identity", "missing");
    return;
  }
  if (identityRead.kind === "forbidden") {
    result.capabilities.push({
      name: "admin_runtime_identity",
      state: "forbidden",
    });
    appendGap(result, "admin_runtime_identity", "forbidden");
    return;
  }
  const identity = identityRead.value;
  if (identity.kind === "gap") {
    result.capabilities.push({
      name: "admin_runtime_identity",
      state: identity.reason === "forbidden" ? "forbidden" : "unavailable",
    });
    appendGap(result, "admin_runtime_identity", identity.reason);
    return;
  }
  result.capabilities.push({
    name: "admin_runtime_identity",
    state: "available",
  });
  const runtimeFacts = identity.value.facts;
  const { database, buildRevision, deploymentId, environment, projectId } =
    runtimeFacts;
  const servedOrigin = identity.value.serverOrigin;
  const declaredOrigin =
    result.targetIdentity.facts.declaredCanonicalOrigin?.status === "observed"
      ? result.targetIdentity.facts.declaredCanonicalOrigin.value
      : result.targetIdentity.facts.canonicalAuthOrigin?.status === "observed"
        ? result.targetIdentity.facts.canonicalAuthOrigin.value
        : undefined;
  const declaredOriginValue = z.string().safeParse(declaredOrigin);
  const servedOriginValue =
    servedOrigin.status === "observed"
      ? z.string().safeParse(servedOrigin.value)
      : undefined;
  const databaseLogicalIdentity: MutableTargetFact = {
    status: database.status,
  };
  if (database.value !== undefined)
    databaseLogicalIdentity.value = database.value;
  if (database.reason !== undefined)
    databaseLogicalIdentity.reason = database.reason;
  const databasePooled: MutableTargetFact = {
    status: database.pooled?.status ?? "unknown",
  };
  if (database.pooled?.reason !== undefined)
    databasePooled.reason = database.pooled.reason;
  const databaseDirect: MutableTargetFact = {
    status: database.direct?.status ?? "unknown",
  };
  if (database.direct?.reason !== undefined)
    databaseDirect.reason = database.direct.reason;
  Object.assign(result.targetIdentity.facts, {
    ...compareRuntimeControlFacts(result.targetIdentity.facts, {
      projectId,
      deploymentId,
      environment,
      buildRevision,
    }),
    ...runtimeMetadataFacts(runtimeFacts),
    servedCanonicalAuthOrigin: servedOrigin,
    canonicalAuthOrigin:
      servedOrigin.status === "observed" &&
      declaredOriginValue.success &&
      servedOriginValue?.success === true
        ? compareFact(declaredOriginValue.data, servedOriginValue.data)
        : servedOrigin,
    databaseLogicalIdentity,
    databasePooled,
    databaseDirect,
  });
}

type RuntimeMetadataInput = Pick<
  OperationsIdentity["facts"],
  | "appliedEvePatch"
  | "declaredEvePatch"
  | "declaredEvePatchSha256"
  | "eveVersion"
  | "lockSha256"
  | "nextVersion"
  | "nodeVersion"
  | "otpProvider"
  | "providerGoogle"
  | "providerLinq"
  | "providerSendblue"
  | "providerSquare"
  | "sendblueConversations"
  | "squareEnvironment"
>;

export function runtimeMetadataFacts(runtime: RuntimeMetadataInput) {
  return {
    runtimeAppliedEvePatch: runtime.appliedEvePatch,
    runtimeDeclaredEvePatch: runtime.declaredEvePatch,
    runtimeDeclaredEvePatchSha256: runtime.declaredEvePatchSha256,
    runtimeEveVersion: runtime.eveVersion,
    runtimeLockSha256: runtime.lockSha256,
    runtimeNextVersion: runtime.nextVersion,
    runtimeNodeVersion: runtime.nodeVersion,
    otpProvider: runtime.otpProvider,
    providerGoogle: runtime.providerGoogle,
    providerLinq: runtime.providerLinq,
    providerSendblue: runtime.providerSendblue,
    providerSquare: runtime.providerSquare,
    sendblueConversations: runtime.sendblueConversations,
    runtimeSquareEnvironment: runtime.squareEnvironment,
  } satisfies Record<string, TargetIdentityFact>;
}

export function compareRuntimeControlFacts(
  control: Record<string, TargetIdentityFact>,
  runtime: {
    readonly projectId: TargetIdentityFact;
    readonly deploymentId: TargetIdentityFact;
    readonly environment: TargetIdentityFact;
    readonly buildRevision: TargetIdentityFact;
  }
) {
  return {
    runtimeProjectId: compareObservedFact(control.projectId, runtime.projectId),
    runtimeDeploymentId: compareObservedFact(
      control.deploymentId,
      runtime.deploymentId
    ),
    runtimeEnvironment: compareObservedFact(
      control.environment,
      runtime.environment
    ),
    servedRuntimeSha: compareObservedFact(
      control.declaredSourceSha,
      runtime.buildRevision
    ),
  } satisfies Record<string, TargetIdentityFact>;
}

function markMismatchesPartial(result: MutableDiagnosticResult) {
  if (
    result.status === "complete" &&
    Object.values(result.targetIdentity.facts).some(
      (fact) => fact.status === "mismatch"
    )
  )
    result.status = "partial";
}

function compareObservedFact(
  declared: TargetIdentityFact | undefined,
  observed: TargetIdentityFact
) {
  const declaredValue = z.string().safeParse(declared?.value);
  const observedString = z.string().safeParse(observed.value);
  if (
    declared?.status === "observed" &&
    observed.status === "observed" &&
    declaredValue.success &&
    observedString.success
  )
    return compareFact(declaredValue.data, observedString.data);
  return observed;
}

function compareFact(declared: string, observed: string) {
  return declared === observed
    ? { status: "observed" as const, value: observed }
    : { status: "mismatch" as const, declared, observed };
}

async function addJourneyEvidence(
  result: MutableDiagnosticResult,
  input: Extract<DiagnosticArgs, { readonly mode: "journey" }>,
  argv: readonly string[]
) {
  if (input.selector.kind !== "session") {
    appendGap(result, "journey_selector", "cannot_determine");
    return;
  }
  const eveRead = await readBoundDiagnosticTarget(
    result.targetIdentity.facts,
    argv,
    (authentication) =>
      readEveSessionMetadata({
        ...authentication,
        sessionId: input.selector.value,
        since: input.since,
        until: input.until,
      })
  );
  if (eveRead.kind !== "result") {
    appendGap(result, "journey_auth", "forbidden");
    return;
  }
  const eve = eveRead.value;
  result.bounds = { ...result.bounds, pagesRead: result.bounds.pagesRead + 1 };
  result.observations.push(...eve.observations);
  if (eve.gap) {
    appendGap(result, "eve", eve.gap);
    if (eve.gap === "truncated") markTruncated(result);
  }
  const journeys = await Promise.all(
    [input.selector.value, ...eve.childSessionIds].map(async (sessionId) => ({
      sessionId,
      journey: await readProtectedJourney({
        ...eveRead.input,
        sessionId,
        sinceUtc: input.since,
        untilUtc: input.until,
      }),
    }))
  );
  result.bounds = {
    ...result.bounds,
    pagesRead: result.bounds.pagesRead + journeys.length,
  };
  for (const { sessionId, journey } of journeys) {
    if (journey.kind === "gap") {
      appendGap(result, "operations_journey", journey.reason);
      continue;
    }
    result.observations.push(...journey.value.observations);
    const journeyGaps = [...journey.value.gaps];
    if (sessionId === input.selector.value && eve.gap === undefined) {
      const availabilityGapIndex = journeyGaps.findIndex(
        (gap) => gap.owner === "eve" && gap.reason === "cannot_determine"
      );
      if (availabilityGapIndex >= 0)
        journeyGaps.splice(availabilityGapIndex, 1);
    }
    result.gaps.push(...journeyGaps);
    if (journey.value.bounds.truncated)
      appendGap(result, "operations_journey", "truncated");
  }
  if (result.gaps.length > 0) result.status = "incomplete";
}

function appendGap(
  result: MutableDiagnosticResult,
  owner: string,
  reason: DiagnosticResult["gaps"][number]["reason"]
) {
  result.gaps.push({ owner, reason });
  result.status = "incomplete";
}

function markTruncated(result: MutableDiagnosticResult) {
  result.bounds = { ...result.bounds, truncated: true };
}

function diagnosticCookiePath(argv: readonly string[]) {
  const index = argv.indexOf("--cookie-file");
  const value = index < 0 ? undefined : argv[index + 1];
  return value !== undefined && value.length > 0 ? value : undefined;
}

export function authenticatedOriginFromFacts(
  facts: DiagnosticResult["targetIdentity"]["facts"]
) {
  const environment = observedStringValue(facts.environment);
  if (environment === "local") {
    if (
      observedValue(facts.localRunOwner) !== true ||
      observedValue(facts.localAppChild) !== true
    )
      return undefined;
    const origin = observedStringValue(facts.localAppOrigin);
    return origin !== undefined && isLoopbackOrigin(origin)
      ? origin
      : undefined;
  }
  if (
    observedStringValue(facts.projectId) === undefined ||
    observedStringValue(facts.deploymentProjectId) === undefined ||
    observedStringValue(facts.teamId) === undefined ||
    observedStringValue(facts.deploymentTeamId) === undefined ||
    (environment !== "production" && environment !== "preview")
  )
    return undefined;
  const origin =
    environment === "production"
      ? observedStringValue(facts.canonicalAliasOrigin)
      : observedStringValue(facts.immutableDeploymentOrigin);
  return origin !== undefined && isPublicHttpsOrigin(origin)
    ? origin
    : undefined;
}

function originFromFacts(facts: DiagnosticResult["targetIdentity"]["facts"]) {
  return authenticatedOriginFromFacts(facts);
}

interface BoundDiagnosticAuthentication {
  readonly origin: string;
  readonly cookie: string;
  readonly allowLocalLoopback: boolean;
}

export async function readBoundDiagnosticTarget<Value>(
  facts: DiagnosticResult["targetIdentity"]["facts"],
  argv: readonly string[],
  reader: (input: BoundDiagnosticAuthentication) => Promise<Value>
): Promise<
  | { readonly kind: "missing" }
  | { readonly kind: "forbidden" }
  | {
      readonly kind: "result";
      readonly input: BoundDiagnosticAuthentication;
      readonly value: Value;
    }
> {
  const origin = originFromFacts(facts);
  if (!origin || !diagnosticCookiePath(argv)) return { kind: "missing" };
  let cookie: string;
  try {
    cookie = await readDiagnosticCookie(diagnosticCookiePath(argv) ?? "");
  } catch {
    return { kind: "forbidden" };
  }
  const input: BoundDiagnosticAuthentication = {
    origin,
    cookie,
    allowLocalLoopback: observedStringValue(facts.environment) === "local",
  };
  return { kind: "result", input, value: await reader(input) };
}

function observedValue(fact: TargetIdentityFact | undefined) {
  return fact?.status === "observed" ? fact.value : undefined;
}

function observedStringValue(fact: TargetIdentityFact | undefined) {
  const value = observedValue(fact);
  const parsed = z.string().safeParse(value);
  return parsed.success ? parsed.data : undefined;
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

function isLoopbackOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]") &&
      url.port.length > 0 &&
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
