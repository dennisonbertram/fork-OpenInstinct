import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  isVerifiedRunChild,
  isVerifiedRunOwner,
  listRunRecords,
  type DevRunRecord,
} from "../local/run-record";
import type { TargetIdentityFact } from "./contract";

const execFileAsync = promisify(execFile);
const loopbackOriginSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]") &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  );
}, "Expected a loopback origin.");

export async function readLocalDiagnosticsMetadata(repositoryRoot: string) {
  const [source, runs] = await Promise.all([
    readSourceFingerprint(repositoryRoot),
    listRunRecords(repositoryRoot),
  ]);
  const verifiedRuns = await Promise.all(
    runs.map(async ({ record }) => ({
      record,
      verified: await isVerifiedRunOwner(record, repositoryRoot),
    }))
  );
  const newestRun = verifiedRuns
    .filter(({ verified }) => verified)
    .map(({ record }) => record)
    .toSorted((left, right) => right.startedAt.localeCompare(left.startedAt))
    .at(0);
  const verifiedChildren = newestRun
    ? await Promise.all(
        (["app", "marketing"] as const).map(async (name) => {
          const child = newestRun.children[name];
          return [
            name,
            child !== undefined &&
              (await isVerifiedRunChild(newestRun, child, repositoryRoot)),
          ] as const;
        })
      )
    : [];
  const childrenReady =
    verifiedChildren.length === 2 &&
    verifiedChildren.every(([, valid]) => valid);
  const readinessReady = newestRun ? requiredReadinessReady(newestRun) : false;
  const facts = {
    environment: { status: "observed", value: "local" },
    sourceHead: source.head
      ? { status: "observed", value: source.head }
      : { status: "unknown" },
    sourceState:
      source.dirty === undefined
        ? { status: "unknown" }
        : { status: "observed", value: source.dirty ? "dirty" : "clean" },
    gitDirty:
      source.dirty === undefined
        ? { status: "unknown" }
        : { status: "observed", value: source.dirty },
    // A manifest's startup SHA does not prove which source a live process serves.
    launchSourceSha: newestRun?.baseSha
      ? { status: "observed", value: newestRun.baseSha }
      : { status: "unknown" },
    servedRuntimeSha: {
      status: "unknown",
      reason: "not_runtime_attested",
    },
    localRunRecord: newestRun
      ? { status: "observed", value: true }
      : { status: "unknown" },
    localRunOwner: newestRun
      ? { status: "observed", value: true }
      : { status: "unknown" },
    localAppChild: childFact(verifiedChildren[0]?.[1] ?? false),
    localMarketingChild: childFact(verifiedChildren[1]?.[1] ?? false),
    readinessRecordedAt: { status: "unknown", reason: "not_recorded" },
  } satisfies Record<string, TargetIdentityFact>;
  if (newestRun) Object.assign(facts, localRunFacts(newestRun));
  return {
    facts,
    observations:
      newestRun && childrenReady && readinessReady
        ? [
            {
              owner: "local_run" as const,
              kind: "run_record" as const,
              ref: newestRun.runId,
              at: newestRun.startedAt,
              execution: newestRun.readiness.app ?? "pending",
              verification: "owner_verified",
            },
          ]
        : [],
    gaps:
      newestRun && (!childrenReady || !readinessReady)
        ? [{ owner: "local_run", reason: "unavailable" as const }]
        : [],
  };
}

function requiredReadinessReady(record: DevRunRecord) {
  return (
    record.readiness.database === "ready" &&
    record.readiness.migrations === "ready" &&
    (record.readiness.agentation === "ready" ||
      record.readiness.agentation === "external") &&
    record.readiness.app === "ready" &&
    record.readiness.eve === "ready" &&
    record.readiness.marketing === "ready"
  );
}

function localRunFacts(record: DevRunRecord) {
  const appOrigin = loopbackOriginSchema.safeParse(record.origins.app);
  const marketingOrigin = loopbackOriginSchema.safeParse(
    record.origins.marketing
  );
  return {
    localRunId: { status: "observed" as const, value: record.runId },
    localRunProfile: { status: "observed" as const, value: record.profile },
    localAppOrigin: appOrigin.success
      ? { status: "observed" as const, value: appOrigin.data }
      : { status: "unknown" as const, reason: "invalid_loopback_origin" },
    localMarketingOrigin: marketingOrigin.success
      ? { status: "observed" as const, value: marketingOrigin.data }
      : { status: "unknown" as const, reason: "invalid_loopback_origin" },
    localAppPort: { status: "observed" as const, value: record.ports.app },
    localMarketingPort: {
      status: "observed" as const,
      value: record.ports.marketing,
    },
    ownedComposeProject: {
      status: "observed" as const,
      value: record.composeProject,
    },
    recordedDatabaseReadiness: {
      status: "observed" as const,
      value: record.readiness.database ?? "pending",
    },
    recordedMigrationReadiness: {
      status: "observed" as const,
      value: record.readiness.migrations ?? "pending",
    },
    recordedAppReadiness: {
      status: "observed" as const,
      value: record.readiness.app ?? "pending",
    },
    recordedMarketingReadiness: {
      status: "observed" as const,
      value: record.readiness.marketing ?? "pending",
    },
    recordedEveReadiness: {
      status: "observed" as const,
      value: record.readiness.eve ?? "pending",
    },
    recordedAgentationReadiness: {
      status: "observed" as const,
      value: record.readiness.agentation ?? "pending",
    },
    recordedProviderReadiness: {
      status: "observed" as const,
      value: record.readiness.provider ?? "pending",
    },
  };
}

async function readSourceFingerprint(repositoryRoot: string) {
  try {
    const [revision, status] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: repositoryRoot,
        maxBuffer: 1024,
      }),
      execFileAsync("git", ["status", "--porcelain=v1"], {
        cwd: repositoryRoot,
        maxBuffer: 64 * 1024,
      }),
    ]);
    const head = revision.stdout.trim();
    return {
      head: /^[0-9a-f]{40}$/iu.test(head) ? head : undefined,
      dirty: status.stdout.length > 0,
    };
  } catch {
    return { head: undefined, dirty: undefined };
  }
}

function childFact(verified: boolean): TargetIdentityFact {
  return verified
    ? { status: "observed", value: true }
    : { status: "unknown", reason: "not_running" };
}
