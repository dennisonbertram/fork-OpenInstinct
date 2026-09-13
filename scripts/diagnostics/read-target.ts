import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import {
  findProductionTarget,
  readProductionInventory,
  type ProductionTargetInventory,
} from "../production/inventory";
import type {
  DiagnosticGapReason,
  DiagnosticSurface,
  DiagnosticTarget,
  TargetIdentityFact,
} from "./contract";
import { readLocalDiagnosticsMetadata } from "./local";

const execFileAsync = promisify(execFile);
const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

export interface TargetReadInput {
  readonly target: DiagnosticTarget;
  readonly surface: DiagnosticSurface;
  readonly deploymentId?: string;
}

export interface TargetReadResult {
  readonly target: DiagnosticTarget;
  readonly surface: DiagnosticSurface;
  readonly deploymentId?: string;
  readonly capturedAt: string;
  readonly facts: TargetIdentityFacts;
  readonly capabilities: readonly {
    readonly name: string;
    readonly state: "available" | "missing" | "unavailable";
  }[];
  readonly gaps: readonly {
    readonly owner: string;
    readonly reason: DiagnosticGapReason;
  }[];
}

type TargetIdentityFacts = Record<string, TargetIdentityFact>;

interface VercelApiMetadata {
  readonly id?: string;
  readonly accountId?: string;
  readonly name?: string;
  readonly deploymentId?: string;
  readonly alias?: string;
  readonly readyState?: string;
  readonly projectId?: string;
  readonly teamId?: string;
  readonly target?: string | null;
  readonly url?: string;
  readonly meta?: {
    readonly githubCommitSha?: string;
    readonly gitCommitSha?: string;
  };
}

// Vercel uses overlapping names with different shapes across endpoints: notably,
// a project response's `alias` is an object while an alias response's `alias`
// is the public hostname. Project each endpoint before it crosses this boundary.
const optionalString = z
  .string()
  .nullish()
  .catch(undefined)
  .transform((value) => value ?? undefined);

const projectMetadataSchema = z.object({
  id: optionalString,
  accountId: optionalString,
  name: optionalString,
});

const aliasMetadataSchema = z.object({
  alias: optionalString,
  deploymentId: optionalString,
});

const deploymentMetadataSchema = z.object({
  id: optionalString,
  readyState: optionalString,
  projectId: optionalString,
  teamId: optionalString,
  target: z.string().nullable().optional(),
  url: optionalString,
  meta: z
    .object({
      githubCommitSha: optionalString,
      gitCommitSha: optionalString,
    })
    .nullish()
    .catch(undefined)
    .transform((value) => value ?? undefined),
});

type VercelApi = (
  endpoint: string,
  teamId?: string
) => Promise<VercelApiMetadata>;

export async function readTarget(
  input: TargetReadInput,
  options: {
    readonly root?: string;
    readonly vercelApi?: VercelApi;
  } = {}
): Promise<TargetReadResult> {
  const root = options.root ?? repositoryRoot;
  if (input.target === "local") return readLocalTarget(input, root);

  let target: ProductionTargetInventory | undefined;
  try {
    const inventory = await readProductionInventory(
      join(root, "config", "production-targets.json")
    );
    target = findProductionTarget(inventory, input);
  } catch {
    return missingTarget(input, "unavailable");
  }
  if (!target) return missingTarget(input, "missing");

  const facts = {
    projectId: { status: "unknown" },
    projectName: { status: "unknown" },
    teamId: { status: "unknown" },
    environment: { status: "unknown" },
    declaredProjectId: observed(target.projectId),
    declaredEnvironment: observed(target.target),
    deploymentId: input.deploymentId
      ? observed(input.deploymentId)
      : { status: "unknown" },
    currentDeploymentId: { status: "unknown" },
    declaredSourceSha: { status: "unknown" },
    deploymentState: { status: "unknown" },
    canonicalAuthOrigin: { status: "unknown" },
    canonicalAliasOrigin: { status: "unknown" },
    immutableDeploymentOrigin: { status: "unknown" },
    schemaVersion: { status: "unknown" },
    configVersion: { status: "unknown" },
    servedRuntimeSha: { status: "unknown" },
    rollbackCompatibility: { status: "unknown" },
  } satisfies TargetIdentityFacts;
  if (target.teamId !== undefined)
    Object.assign(facts, { declaredTeamId: observed(target.teamId) });
  if (target.canonicalOrigin !== undefined)
    Object.assign(facts, {
      declaredCanonicalOrigin: observed(target.canonicalOrigin),
    });
  if (target.gitRef !== undefined)
    Object.assign(facts, { gitRef: observed(target.gitRef) });
  const api = options.vercelApi ?? vercelApiGet;
  const gaps: { owner: string; reason: DiagnosticGapReason }[] = [];
  const project = await Promise.resolve(
    api(`/v9/projects/${encodeURIComponent(target.projectId)}`, target.teamId)
  ).then(
    (value) => ({ status: "fulfilled" as const, value }),
    () => ({ status: "rejected" as const })
  );
  if (project.status === "fulfilled")
    projectFacts(project.value, target, facts);
  else gaps.push({ owner: "vercel_project", reason: "unavailable" });
  const resolved = await resolveDeployment(input, target, api);
  if (resolved.kind === "deployment") {
    deploymentFacts(resolved.value, input, target, facts);
    if (resolved.aliasOrigin) {
      Object.assign(facts, {
        canonicalAliasOrigin: compare(
          target.canonicalOrigin ?? resolved.aliasOrigin,
          resolved.aliasOrigin
        ),
      });
    }
  } else {
    gaps.push({ owner: "vercel_deployment", reason: resolved.reason });
  }

  const result: TargetReadResult = {
    target: input.target,
    surface: input.surface,
    capturedAt: new Date().toISOString(),
    facts,
    capabilities: [
      {
        name: "vercel_project_metadata",
        state: project.status === "fulfilled" ? "available" : "unavailable",
      },
      {
        name: "vercel_deployment_metadata",
        state: resolved.kind === "deployment" ? "available" : "unavailable",
      },
    ],
    gaps,
  };
  return input.deploymentId === undefined
    ? result
    : { ...result, deploymentId: input.deploymentId };
}

export async function readDiagnosticCookie(cookiePath: string) {
  const metadata = await stat(cookiePath);
  if ((metadata.mode & 0o077) !== 0)
    throw new Error("Diagnostic admin cookie file must be mode 0600.");
  const { readFile } = await import("node:fs/promises");
  const cookie = (await readFile(cookiePath, "utf8")).trim();
  if (cookie.length === 0 || /[\r\n]/u.test(cookie))
    throw new Error("Diagnostic admin cookie file is invalid.");
  return cookie;
}

async function readLocalTarget(
  input: TargetReadInput,
  root: string
): Promise<TargetReadResult> {
  try {
    const local = await readLocalDiagnosticsMetadata(root);
    return {
      target: input.target,
      surface: input.surface,
      capturedAt: new Date().toISOString(),
      facts: local.facts,
      capabilities: [
        {
          name: "local_run_record",
          state:
            local.observations.length > 0
              ? "available"
              : local.gaps.length > 0
                ? "unavailable"
                : "missing",
        },
      ],
      gaps:
        local.gaps.length > 0
          ? local.gaps
          : local.observations.length > 0
            ? []
            : [{ owner: "local_run", reason: "missing" }],
    };
  } catch {
    return {
      target: input.target,
      surface: input.surface,
      capturedAt: new Date().toISOString(),
      facts: {
        environment: observed("local"),
        servedRuntimeSha: { status: "unknown" },
      },
      capabilities: [{ name: "local_metadata", state: "unavailable" }],
      gaps: [{ owner: "local_metadata", reason: "unavailable" }],
    };
  }
}

function missingTarget(
  input: TargetReadInput,
  reason: DiagnosticGapReason
): TargetReadResult {
  const result: TargetReadResult = {
    target: input.target,
    surface: input.surface,
    capturedAt: new Date().toISOString(),
    facts: {
      projectId: { status: "unknown" },
      projectName: { status: "unknown" },
      teamId: { status: "unknown" },
      environment: { status: "unknown" },
      deploymentId: { status: "unknown" },
      currentDeploymentId: { status: "unknown" },
      deploymentState: { status: "unknown" },
      canonicalAuthOrigin: { status: "unknown" },
      canonicalAliasOrigin: { status: "unknown" },
      immutableDeploymentOrigin: { status: "unknown" },
      schemaVersion: { status: "unknown" },
      configVersion: { status: "unknown" },
      servedRuntimeSha: { status: "unknown" },
      rollbackCompatibility: { status: "unknown" },
    },
    capabilities: [
      {
        name: "target_inventory",
        state: reason === "missing" ? "missing" : "unavailable",
      },
    ],
    gaps: [{ owner: "target_inventory", reason }],
  };
  return input.deploymentId === undefined
    ? result
    : { ...result, deploymentId: input.deploymentId };
}

function projectFacts(
  value: VercelApiMetadata,
  target: ProductionTargetInventory,
  facts: TargetIdentityFacts
) {
  if (value.id !== undefined)
    facts.projectId = compare(target.projectId, value.id);
  if (target.projectName !== undefined && value.name !== undefined)
    facts.projectName = compare(target.projectName, value.name);
  if (target.teamId !== undefined && value.accountId !== undefined)
    facts.teamId = compare(target.teamId, value.accountId);
}

function deploymentFacts(
  value: VercelApiMetadata,
  input: TargetReadInput,
  target: ProductionTargetInventory,
  facts: TargetIdentityFacts
) {
  if (value.id !== undefined) {
    facts.deploymentId = input.deploymentId
      ? compare(input.deploymentId, value.id)
      : observed(value.id);
    if (input.deploymentId === undefined)
      facts.currentDeploymentId = observed(value.id);
  }
  if (value.readyState !== undefined)
    facts.deploymentState = observed(value.readyState);
  if (value.projectId !== undefined)
    facts.deploymentProjectId = compare(target.projectId, value.projectId);
  if (target.teamId && value.teamId !== undefined)
    facts.deploymentTeamId = compare(target.teamId, value.teamId);
  if (value.target === null && input.target === "preview")
    facts.environment = observed("preview");
  else {
    const deploymentTarget = z.string().safeParse(value.target);
    if (deploymentTarget.success)
      facts.environment = compare(target.target, deploymentTarget.data);
  }
  const origin = publicOrigin(value.url);
  if (origin) facts.immutableDeploymentOrigin = observed(origin);
  const sha = readGitSha(value);
  if (sha) facts.declaredSourceSha = observed(sha);
}

async function resolveDeployment(
  input: TargetReadInput,
  target: ProductionTargetInventory,
  api: VercelApi
): Promise<
  | {
      readonly kind: "deployment";
      readonly value: VercelApiMetadata;
      readonly aliasOrigin?: string;
    }
  | { readonly kind: "missing"; readonly reason: DiagnosticGapReason }
> {
  const requestedId = input.deploymentId;
  if (requestedId) {
    try {
      return {
        kind: "deployment",
        value: await api(
          `/v13/deployments/${encodeURIComponent(requestedId)}`,
          target.teamId
        ),
      };
    } catch {
      return { kind: "missing", reason: "unavailable" };
    }
  }
  if (input.target !== "production" || !target.canonicalOrigin) {
    return { kind: "missing", reason: "missing" };
  }
  const aliasHost = new URL(target.canonicalOrigin).host;
  try {
    const alias = await api(
      `/v4/aliases/${encodeURIComponent(aliasHost)}`,
      target.teamId
    );
    const deploymentId = aliasDeploymentId(alias);
    const aliasOrigin = aliasCanonicalOrigin(alias);
    if (
      !deploymentId ||
      !aliasOrigin ||
      aliasOrigin !== target.canonicalOrigin
    ) {
      return { kind: "missing", reason: "cannot_determine" };
    }
    return {
      kind: "deployment",
      value: await api(
        `/v13/deployments/${encodeURIComponent(deploymentId)}`,
        target.teamId
      ),
      aliasOrigin,
    };
  } catch {
    return { kind: "missing", reason: "unavailable" };
  }
}

function aliasDeploymentId(value: VercelApiMetadata) {
  return value.deploymentId;
}

function aliasCanonicalOrigin(value: VercelApiMetadata) {
  return publicOrigin(value.alias);
}

function readGitSha(value: VercelApiMetadata) {
  const metadata = value.meta;
  const sha = metadata?.githubCommitSha ?? metadata?.gitCommitSha;
  return sha !== undefined && /^[0-9a-f]{7,64}$/iu.test(sha) ? sha : undefined;
}

async function vercelApiGet(endpoint: string, teamId?: string) {
  const args = [
    "exec",
    "vercel",
    "api",
    endpoint,
    "--method",
    "GET",
    "--non-interactive",
  ];
  if (teamId) args.push("--scope", teamId);
  const { stdout } = await execFileAsync("pnpm", args, {
    cwd: repositoryRoot,
    maxBuffer: 256 * 1024,
    timeout: 5_000,
  });
  try {
    return projectVercelMetadataJson(endpoint, stdout);
  } catch {
    throw new Error("Vercel metadata response was not JSON.");
  }
}

export function projectVercelMetadataJson(
  endpoint: string,
  responseJson: string
): VercelApiMetadata {
  const response: unknown = JSON.parse(responseJson);
  if (endpoint.startsWith("/v9/projects/"))
    return projectMetadataSchema.parse(response);
  if (endpoint.startsWith("/v4/aliases/"))
    return aliasMetadataSchema.parse(response);
  if (endpoint.startsWith("/v13/deployments/"))
    return deploymentMetadataSchema.parse(response);
  throw new Error("Unsupported Vercel metadata endpoint.");
}

function observed(value: string | boolean): TargetIdentityFact {
  return { status: "observed", value };
}

function compare(expected: string, actual: string): TargetIdentityFact {
  return expected === actual
    ? observed(expected)
    : { status: "mismatch", declared: expected, observed: actual };
}

function publicOrigin(value: string | undefined) {
  if (value === undefined) return undefined;
  const candidate = value.startsWith("https://") ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}
