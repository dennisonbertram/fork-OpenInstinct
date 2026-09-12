import { describe, expect, it, vi } from "vitest";
import { runDiagnostics } from "../../scripts/diagnostics";
import { readLocalDiagnosticsMetadata } from "../../scripts/diagnostics/local";
import type { DevRunRecord } from "../../scripts/local/run-record";
import type {
  DiagnosticArgs,
  DiagnosticObservation,
  DiagnosticResult,
} from "../../scripts/diagnostics/contract";
import type { DiagnosticDependencies } from "../../scripts/diagnostics/index";

const localRecordMocks = vi.hoisted(() => ({
  isVerifiedRunChild: vi.fn<() => Promise<boolean>>(),
  isVerifiedRunOwner: vi.fn<() => Promise<boolean>>(),
  listRunRecords:
    vi.fn<
      () => Promise<
        readonly { readonly path: string; readonly record: DevRunRecord }[]
      >
    >(),
}));

vi.mock("../../scripts/local/run-record", () => ({
  isVerifiedRunChild: localRecordMocks.isVerifiedRunChild,
  isVerifiedRunOwner: localRecordMocks.isVerifiedRunOwner,
  listRunRecords: localRecordMocks.listRunRecords,
}));

const journey = {
  mode: "journey" as const,
  target: "local" as const,
  surface: "app" as const,
  selector: { kind: "session" as const, value: "ses_synthetic_root" },
  since: "2026-09-12T10:00:00.000Z",
  until: "2026-09-12T10:15:00.000Z",
};

const targetIdentity = {
  facts: {
    projectId: { status: "unknown" },
    environmentId: { status: "observed", value: "local" },
    deploymentId: { status: "unknown" },
    servedRuntimeSha: { status: "unknown" },
  },
} satisfies DiagnosticResult["targetIdentity"];

describe("local diagnostic composition", () => {
  it("keeps a verified owned run incomplete until every required readiness is recorded", async () => {
    localRecordMocks.listRunRecords.mockResolvedValue([
      { path: "/safe/run.json", record: localRun({ app: "pending" }) },
    ]);
    localRecordMocks.isVerifiedRunOwner.mockResolvedValue(true);
    localRecordMocks.isVerifiedRunChild.mockResolvedValue(true);

    const result = await readLocalDiagnosticsMetadata(process.cwd());

    expect(result.observations).toEqual([]);
    expect(result.gaps).toEqual([
      { owner: "local_run", reason: "unavailable" },
    ]);
    expect(
      Object.entries(result.facts).find(
        ([name]) => name === "recordedAppReadiness"
      )?.[1]
    ).toEqual({
      status: "observed",
      value: "pending",
    });
  });

  it("accepts verified children after database, migration, Agentation, app, Eve, and marketing readiness recover", async () => {
    localRecordMocks.listRunRecords.mockResolvedValue([
      { path: "/safe/run.json", record: localRun({}) },
    ]);
    localRecordMocks.isVerifiedRunOwner.mockResolvedValue(true);
    localRecordMocks.isVerifiedRunChild.mockResolvedValue(true);

    const result = await readLocalDiagnosticsMetadata(process.cwd());

    expect(result.gaps).toEqual([]);
    expect(result.observations).toEqual([
      expect.objectContaining({
        owner: "local_run",
        execution: "ready",
        verification: "owner_verified",
      }),
    ]);
  });

  it("keeps independent observations when one reader fails and returns safe incomplete output", async () => {
    const readTargetIdentity = vi.fn<
      DiagnosticDependencies["readTargetIdentity"]
    >(async () => targetIdentity);
    const readGit = vi.fn<
      (input: DiagnosticArgs) => Promise<readonly DiagnosticObservation[]>
    >(async () => [
      {
        owner: "git",
        kind: "source",
        sourceRevision: "sha_synthetic",
        ref: "worktree_synthetic",
      },
    ]);
    const readEve = vi.fn<
      (input: DiagnosticArgs) => Promise<readonly DiagnosticObservation[]>
    >(async () => {
      throw new Error("synthetic reader failure with synthetic secret");
    });
    const readReports = vi.fn<
      (input: DiagnosticArgs) => Promise<readonly DiagnosticObservation[]>
    >(async () => [
      {
        owner: "completion-report",
        kind: "delivery",
        delivery: "uncertain",
        ref: "part_synthetic",
      },
    ]);

    const outcome = await runDiagnostics(journey, {
      readTargetIdentity,
      readers: [
        { owner: "git", read: readGit },
        { owner: "eve", read: readEve },
        { owner: "completion-report", read: readReports },
      ],
    });

    expect(outcome.exitCode).not.toBe(0);
    expect(outcome.result.status).toBe("incomplete");
    expect(outcome.result.targetIdentity).toEqual(targetIdentity);
    expect(outcome.result.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "git",
          sourceRevision: "sha_synthetic",
        }),
        expect.objectContaining({
          owner: "completion-report",
          delivery: "uncertain",
        }),
      ])
    );
    expect(outcome.result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: "eve", reason: "unavailable" }),
      ])
    );
    expect(JSON.stringify(outcome.result)).not.toContain("synthetic secret");
    expect(readGit).toHaveBeenCalledTimes(1);
    expect(readEve).toHaveBeenCalledTimes(1);
    expect(readReports).toHaveBeenCalledTimes(1);
  });

  it("uses only the supplied bounded read interfaces and performs no writes or live effects", async () => {
    const sideEffects = {
      write: vi.fn<() => void>(),
      startService: vi.fn<() => void>(),
      queryDatabase: vi.fn<() => void>(),
      callProvider: vi.fn<() => void>(),
      deploy: vi.fn<() => void>(),
    };
    const readTargetIdentity = vi.fn<
      DiagnosticDependencies["readTargetIdentity"]
    >(async () => targetIdentity);
    const readSession = vi.fn<
      (input: DiagnosticArgs) => Promise<readonly DiagnosticObservation[]>
    >(async () => [
      {
        owner: "eve",
        kind: "session",
        sessionId: "ses_synthetic_root",
        ref: "event_synthetic_root",
      },
    ]);

    const dependencies: DiagnosticDependencies & typeof sideEffects = {
      readTargetIdentity,
      readers: [{ owner: "eve", read: readSession }],
      ...sideEffects,
    };
    const outcome = await runDiagnostics(journey, dependencies);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.result.status).toBe("complete");
    expect(readTargetIdentity).toHaveBeenCalledWith(journey);
    expect(readSession).toHaveBeenCalledWith(journey);
    for (const effect of Object.values(sideEffects)) {
      expect(effect).not.toHaveBeenCalled();
    }
  });
});

function localRun(overrides: Partial<DevRunRecord["readiness"]>): DevRunRecord {
  return {
    schemaVersion: 1,
    runId: "run_synthetic",
    nonce: "nonce_synthetic",
    leaseNonce: "lease_synthetic",
    profile: "fixture",
    cwd: process.cwd(),
    baseSha: "a".repeat(40),
    startedAt: "2026-09-12T10:00:00.000Z",
    owner: { pid: 1, processStartTime: "1", processGroup: 1 },
    composeProject: "synthetic-project",
    volume: "synthetic-volume",
    ports: { app: 3000, marketing: 3210 },
    origins: {
      app: "http://127.0.0.1:3000",
      marketing: "http://127.0.0.1:3210",
    },
    children: {
      app: { pid: 2, processStartTime: "2", processGroup: 2 },
      marketing: { pid: 3, processStartTime: "3", processGroup: 3 },
    },
    readiness: {
      database: "ready",
      migrations: "ready",
      agentation: "external",
      app: "ready",
      eve: "ready",
      marketing: "ready",
      provider: "simulated",
      ...overrides,
    },
  };
}
