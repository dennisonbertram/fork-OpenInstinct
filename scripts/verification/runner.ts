// The verification lanes, their steps, and their evidence reads are deliberately
// serialized: later work must not run after a required lane fails.
// oxlint-disable eslint/no-await-in-loop
// This process and artifact recorder validates each external boundary before
// use. The narrow rules below otherwise reject the required JSON/Node boundary
// checks and receipt evidence dictionaries rather than a concrete defect.
// oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-conditional-empty-object-spread
import { randomUUID, createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  open,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { acquireWorktreeLease } from "../local/worktree-lease.ts";
import {
  assertAncestor,
  collectChangedPaths,
  digestFile,
  fingerprintSource,
  getRepositoryRoot,
  resolveCommit,
  type SourceFingerprint,
} from "./fingerprint.ts";
import {
  buildReasons,
  completeLaneIds,
  selectQuickLanes,
  verificationLanes,
  type LaneSelection,
  type VerificationLane,
  type VerificationLaneId,
} from "./lanes.ts";
import {
  canExecute,
  createLaneEnvironment,
  makePlaywrightEnvironment,
} from "./environment.ts";
import {
  assertReceiptPathIgnored,
  describeArtifact,
  describeArtifacts,
  initializeReceiptDirectory,
  type ArtifactReceipt,
  type LaneStatus,
  type VerificationReceipt,
  writeReceipt,
} from "./receipt.ts";
import {
  hasRequiredCheckTestEvidence,
  knownCompletionJourneyExclusion,
  parseJUnitFiles,
  parsePlaywrightJson,
  parseVitestSummaries,
  type KnownPlaywrightExclusion,
  type TestCounts,
} from "./results.ts";

type StepStatus = "passed" | "failed" | "blocked" | "cancelled" | "not-run";

interface StepReceipt {
  id: string;
  command: string;
  args: string[];
  startedAt: string;
  finishedAt: string;
  status: StepStatus;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdoutSha256: string;
  outputLog?: {
    path: string;
    sha256: string;
    truncated: boolean;
  };
  explanation?: string;
}

interface LaneReceipt {
  id: VerificationLaneId;
  ciName: string;
  selectionReason: string;
  status: LaneStatus | "not-selected" | "running" | "not-run";
  environmentProfile: string;
  steps: StepReceipt[];
  tests: TestCounts | "not-applicable" | "unavailable";
  knownExclusions: KnownPlaywrightExclusion[];
  targets: Record<string, unknown>[] | "not-applicable";
  databases: Record<string, unknown>[] | "not-applicable";
  cleanup: "passed" | "failed" | "not-applicable" | "unknown";
  artifacts: ArtifactReceipt[];
  explanation?: string;
  startedAt?: string;
  finishedAt?: string;
}

export type RunnerOptions =
  | { mode: "full" }
  | { mode: "quick"; base: string }
  | { mode: "lane"; lane: VerificationLaneId };

interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  spawnFailed: boolean;
  outputTail: string;
  outputSha256: string;
  outputTruncated: boolean;
}

interface CleanupResourceEvidence {
  state: "absent" | "present" | "unknown";
  count: number | null;
}

interface FixtureCleanupEvidence {
  runRecord: CleanupResourceEvidence;
  containers: CleanupResourceEvidence;
  volumes: CleanupResourceEvidence;
  networks: CleanupResourceEvidence;
}

const expectedRealPgSkipCount = 6;
const maxCapturedOutputBytes = 1024 * 1024;
let activeChild: ChildProcess | undefined;
let interruption: NodeJS.Signals | undefined;
const execFileAsync = promisify(execFile);
let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.once(signal, () => {
    interruption = signal;
    stopActiveChild(signal);
  });
}

export async function runVerification(options: RunnerOptions) {
  const repositoryRoot = await getRepositoryRoot(process.cwd());
  await assertReceiptPathIgnored(repositoryRoot);
  const runId = randomUUID();
  const { runRoot, receiptPath } = await initializeReceiptDirectory(
    repositoryRoot,
    runId
  );
  const artifactRoot = runRoot;
  const startedAt = new Date().toISOString();
  const baseSha = options.mode === "quick" ? options.base : null;
  const sourceAtStart = await fingerprintSource(repositoryRoot);
  const migrationRevision = await sourceMigrationRevision(repositoryRoot);
  const selection = await resolveSelection(options, repositoryRoot);
  const packageManager = await packageManagerDeclaration(repositoryRoot);

  const receipt: VerificationReceipt<LaneReceipt> = {
    schemaVersion: 1,
    runId,
    mode: options.mode,
    coverage:
      options.mode === "full"
        ? "complete"
        : options.mode === "quick" && selection.completeFallback
          ? "complete-fallback"
          : "partial",
    status: "running",
    startedAt,
    finishedAt: null,
    repositoryRoot,
    baseSha,
    headSha: sourceAtStart.headSha,
    sourceFingerprint: sourceAtStart.digest,
    sourceChangedPaths: sourceAtStart.changedPaths.filter(
      (path) => !sourceAtStart.unsafeInputs.includes(path)
    ),
    excludedInputs: sourceAtStart.unsafeInputs.map((path) =>
      path.startsWith(".eve/") ? "private trace artifact" : "environment file"
    ),
    toolchain: {
      node: process.version,
      packageManager,
      platform: process.platform,
      architecture: process.arch,
    },
    environmentProfile:
      options.mode === "lane"
        ? laneById(options.lane).environmentProfile
        : options.mode === "full"
          ? "five-ci-lanes-synthetic-v1"
          : "quick-selected-synthetic-v1",
    inputDigests: {
      lockfile: await digestFile(repositoryRoot, "pnpm-lock.yaml"),
      packageManifest: await digestFile(repositoryRoot, "package.json"),
      laneManifest: await digestFile(
        repositoryRoot,
        "scripts/verification/lanes.ts"
      ),
      workflow: await digestFile(
        repositoryRoot,
        ".github/workflows/checks.yml"
      ),
      vitestConfig: await digestFile(repositoryRoot, "vitest.config.ts"),
      playwrightConfig: await digestFile(
        repositoryRoot,
        "playwright.config.ts"
      ),
      playwrightSendblueConfig: await digestFile(
        repositoryRoot,
        "playwright.sendblue.config.ts"
      ),
      migrations: migrationRevision,
    },
    selectedLanes: selection.selected,
    lanes: Object.fromEntries(
      verificationLanes.map((lane) => [
        lane.id,
        baseLaneReceipt(
          lane,
          selection.reasons[lane.id],
          selection.selected.includes(lane.id)
        ),
      ])
    ),
  };

  await writeReceipt(receiptPath, receipt);
  console.log(`Verification run ${runId} (${options.mode}).`);
  if (options.mode === "quick") {
    console.log(
      selection.completeFallback
        ? "Quick selection broadened to the complete gate."
        : "Quick selection is partial evidence; it is not the handoff gate."
    );
  }
  for (const lane of verificationLanes) {
    const status = selection.selected.includes(lane.id)
      ? `selected: ${selection.reasons[lane.id]}`
      : `not selected: ${selection.reasons[lane.id]}`;
    console.log(`  ${lane.id}: ${status}`);
  }

  let lease: Awaited<ReturnType<typeof acquireWorktreeLease>> | undefined;
  let terminalStatus: VerificationReceipt<LaneReceipt>["status"] = "running";
  try {
    if (sourceAtStart.unsafeInputs.length > 0) {
      terminalStatus = "incomplete";
      for (const laneId of selection.selected) {
        const lane = receiptLane(receipt, laneId);
        lane.status = "blocked";
        lane.explanation =
          "A changed environment file or private trace is excluded from source fingerprinting.";
      }
    } else if (options.mode === "quick" && !selection.baseValid) {
      terminalStatus = "incomplete";
    } else {
      lease = await acquireWorktreeLease(repositoryRoot, "verification");
      for (const lane of verificationLanes) {
        if (!selection.selected.includes(lane.id)) continue;
        if (interruption !== undefined) {
          markUnstartedLanesCancelled(receipt, selection.selected, lane.id);
          terminalStatus = "cancelled";
          break;
        }
        const laneReceipt = await runLane({
          repositoryRoot,
          lane,
          runId,
          sourceAtStart,
          artifactRoot,
          leaseNonce: lease.record.nonce,
          migrationRevision,
          selectionReason: selection.reasons[lane.id],
        });
        receipt.lanes[lane.id] = laneReceipt;
        await writeReceipt(receiptPath, receipt);
        console.log(`  ${lane.id}: ${laneReceipt.status.toUpperCase()}`);
        if (laneReceipt.status !== "passed") {
          const currentIndex = verificationLanes.findIndex(
            (candidate) => candidate.id === lane.id
          );
          for (const laterLane of verificationLanes.slice(currentIndex + 1)) {
            const laterReceipt = receiptLane(receipt, laterLane.id);
            if (
              selection.selected.includes(laterLane.id) &&
              laterReceipt.status === "running"
            ) {
              laterReceipt.status = "not-run";
              laterReceipt.explanation =
                "A prior required lane did not pass; use --lane to inspect this lane separately.";
            }
          }
          break;
        }
      }

      if (interruption !== undefined) {
        terminalStatus = "cancelled";
      } else if (
        selection.selected.some((laneId) => {
          const lane = receiptLane(receipt, laneId);
          return lane.status === "failed";
        })
      ) {
        terminalStatus = "failed";
      } else if (
        selection.selected.some((laneId) => {
          const lane = receiptLane(receipt, laneId);
          return lane.status === "flaky";
        })
      ) {
        terminalStatus = "flaky";
      } else if (
        selection.selected.some((laneId) => {
          const lane = receiptLane(receipt, laneId);
          return lane.status === "blocked";
        })
      ) {
        terminalStatus = "blocked";
      } else if (
        selection.selected.some((laneId) => {
          const lane = receiptLane(receipt, laneId);
          return lane.status === "cancelled";
        })
      ) {
        terminalStatus = "cancelled";
      } else if (
        selection.selected.some((laneId) => {
          const lane = receiptLane(receipt, laneId);
          return lane.status !== "passed";
        })
      ) {
        terminalStatus = "incomplete";
      } else {
        terminalStatus = "passed";
      }
      if (terminalStatus !== "passed") {
        for (const laneId of selection.selected) {
          const laneReceipt = receiptLane(receipt, laneId);
          if (laneReceipt.status === "running") {
            laneReceipt.status = "not-run";
            laneReceipt.explanation =
              terminalStatus === "cancelled"
                ? "Verification was cancelled before this lane started."
                : "A prior required lane did not pass.";
          }
        }
      }
    }
  } catch (error) {
    terminalStatus = "incomplete";
    receipt.error = safeErrorMessage(error);
    for (const laneId of selection.selected) {
      const lane = receiptLane(receipt, laneId);
      if (lane.status === "running") {
        lane.status = "blocked";
        lane.explanation =
          "Verification could not prepare or acquire the required lane.";
      }
    }
    console.error(
      `Verification could not complete: ${safeErrorMessage(error)}`
    );
  } finally {
    if (lease !== undefined) {
      const released = await lease.release().catch(() => false);
      receipt.worktreeLease = released ? "released" : "release-failed";
      if (!released && terminalStatus === "passed")
        terminalStatus = "incomplete";
    }
    const sourceAtEnd = await fingerprintSource(repositoryRoot).catch(
      () => undefined
    );
    receipt.sourceFingerprintAtEnd = sourceAtEnd?.digest ?? "unavailable";
    if (
      sourceAtEnd === undefined ||
      sourceAtEnd.digest !== sourceAtStart.digest ||
      sourceAtEnd.headSha !== sourceAtStart.headSha
    ) {
      terminalStatus = "stale";
    }
    receipt.finishedAt = new Date().toISOString();
    receipt.status = terminalStatus;
    await writeReceipt(receiptPath, receipt).catch((error: unknown) => {
      console.error(
        `Could not finalize verification receipt: ${safeErrorMessage(error)}`
      );
      terminalStatus = "incomplete";
    });
  }

  console.log(`Receipt: ${relative(repositoryRoot, receiptPath)}`);
  console.log(`Verification status: ${terminalStatus.toUpperCase()}.`);
  return terminalStatus === "passed" ? 0 : 1;
}

type SelectionWithBase = LaneSelection & { baseValid: boolean };

async function resolveSelection(
  options: RunnerOptions,
  repositoryRoot: string
): Promise<SelectionWithBase> {
  if (options.mode === "full") {
    return {
      selected: [...completeLaneIds],
      reasons: buildReasons(() => "Complete deterministic CI gate."),
      completeFallback: false,
      baseValid: true,
    };
  }
  if (options.mode === "lane") {
    return {
      selected: [options.lane],
      reasons: buildReasons((id) =>
        id === options.lane ? "Explicitly requested lane." : "Not requested."
      ),
      completeFallback: false,
      baseValid: true,
    };
  }

  try {
    const baseSha = await resolveCommit(repositoryRoot, options.base);
    await assertAncestor(repositoryRoot, baseSha);
    const paths = await collectChangedPaths(repositoryRoot, baseSha);
    return { ...selectQuickLanes(paths), baseValid: true };
  } catch {
    return {
      selected: [],
      reasons: buildReasons(() => "Invalid or unrelated base SHA."),
      completeFallback: false,
      baseValid: false,
    };
  }
}

function baseLaneReceipt(
  lane: VerificationLane,
  reason: string,
  selected: boolean
): LaneReceipt {
  return {
    id: lane.id,
    ciName: lane.ciName,
    selectionReason: reason,
    status: selected ? "running" : "not-selected",
    environmentProfile: lane.environmentProfile,
    steps: [],
    tests: "unavailable",
    knownExclusions: [],
    targets: "not-applicable",
    databases: "not-applicable",
    cleanup: "unknown",
    artifacts: [],
  };
}

function laneById(id: VerificationLaneId): VerificationLane {
  const lane = verificationLanes.find((candidate) => candidate.id === id);
  if (lane === undefined) {
    throw new Error(`No verification recipe is registered for lane ${id}.`);
  }
  return lane;
}

function receiptLane(
  receipt: VerificationReceipt<LaneReceipt>,
  laneId: VerificationLaneId
): LaneReceipt {
  const lane = receipt.lanes[laneId];
  if (lane === undefined) {
    throw new Error(`Verification receipt lacks lane ${laneId}.`);
  }
  return lane;
}

function markUnstartedLanesCancelled(
  receipt: VerificationReceipt<LaneReceipt>,
  selected: readonly VerificationLaneId[],
  current: VerificationLaneId
) {
  const start = verificationLanes.findIndex((lane) => lane.id === current);
  for (const lane of verificationLanes.slice(start)) {
    const laneReceipt = receiptLane(receipt, lane.id);
    if (selected.includes(lane.id) && laneReceipt.steps.length === 0) {
      laneReceipt.status = "cancelled";
      laneReceipt.explanation = "A prior step received a cancellation signal.";
    }
  }
}

async function runLane({
  repositoryRoot,
  lane,
  runId,
  sourceAtStart,
  artifactRoot,
  leaseNonce,
  migrationRevision,
  selectionReason,
}: {
  repositoryRoot: string;
  lane: VerificationLane;
  runId: string;
  sourceAtStart: SourceFingerprint;
  artifactRoot: string;
  leaseNonce: string;
  migrationRevision: string;
  selectionReason: string;
}): Promise<LaneReceipt> {
  const startedAt = new Date().toISOString();
  const startTimeMs = Date.now();
  const laneReceipt = baseLaneReceipt(lane, selectionReason, true);
  laneReceipt.startedAt = startedAt;
  let checkCounts: TestCounts | undefined;
  const missingCommands: string[] = [];
  for (const command of lane.requiredCommands) {
    if (!(await canExecute(command))) missingCommands.push(command);
  }
  if (missingCommands.length > 0) {
    laneReceipt.status = "blocked";
    laneReceipt.explanation = `Missing required command: ${missingCommands.join(", ")}.`;
    laneReceipt.cleanup = "not-applicable";
    laneReceipt.finishedAt = new Date().toISOString();
    return laneReceipt;
  }

  const environment = await createLaneEnvironment({
    repositoryRoot,
    runId,
    lane: lane.id,
    artifactRoot,
    sourceFingerprint: sourceAtStart.digest,
    leaseNonce,
  });
  for (const step of lane.steps) {
    if (interruption !== undefined) {
      laneReceipt.steps.push(notRunStep(step.id, step.command, step.args));
      laneReceipt.status = "cancelled";
      laneReceipt.explanation = "Verification received a cancellation signal.";
      break;
    }
    const stepArgs = commandArgs(lane.id, step.id, step.args, artifactRoot);
    const stepEnvironment =
      lane.id === "e2e"
        ? makePlaywrightEnvironment(
            environment,
            step.id === "e2e-web" ? "web" : "sendblue",
            artifactRoot,
            runId,
            leaseNonce,
            repositoryRoot
          )
        : environment;
    const result = await runProcess({
      command: step.command,
      args: stepArgs,
      cwd: repositoryRoot,
      environment: stepEnvironment,
      timeoutMs: lane.timeoutMs,
    });
    const outputLog = await persistStepOutput({
      artifactRoot,
      repositoryRoot,
      laneId: lane.id,
      stepId: step.id,
      output: result.process.outputTail,
      truncated: result.process.outputTruncated,
    });
    const stepReceipt: StepReceipt = {
      id: step.id,
      command: step.command,
      args: stepArgs,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      status: result.status,
      exitCode: result.process.exitCode,
      signal: result.process.signal,
      timedOut: result.process.timedOut,
      stdoutSha256: result.process.outputSha256,
      outputLog,
    };
    if (result.process.spawnFailed) {
      stepReceipt.explanation = "The command could not be started.";
    }
    laneReceipt.steps.push(stepReceipt);
    if (lane.id === "checks" && step.id === "checks") {
      const summary = parseVitestSummaries(result.process.outputTail);
      const counts = summary?.counts;
      checkCounts = counts;
      laneReceipt.tests = counts ?? "unavailable";
      if (result.status === "passed") {
        if (
          counts === undefined ||
          counts.discovered === 0 ||
          (summary?.summaryCount ?? 0) < 2 ||
          !hasRequiredCheckTestEvidence(result.process.outputTail)
        ) {
          laneReceipt.status = "incomplete";
          laneReceipt.explanation =
            "Checks exited 0 without confirmed root and marketing Vitest commands and non-empty summaries.";
        } else if (counts.failed !== 0) {
          laneReceipt.status = "failed";
          laneReceipt.explanation = "Vitest reported failing tests.";
        } else if (counts.skipped !== expectedRealPgSkipCount) {
          laneReceipt.status = "incomplete";
          laneReceipt.explanation = `Expected exactly ${String(expectedRealPgSkipCount)} intentional REAL_PG=0 skips; observed ${String(counts.skipped)}.`;
        }
      }
    }
    if (result.status !== "passed") {
      laneReceipt.status =
        result.status === "cancelled" ? "cancelled" : result.status;
      laneReceipt.explanation =
        result.status === "blocked"
          ? "A required command could not start or timed out."
          : "A required command exited unsuccessfully.";
      for (const laterStep of lane.steps.slice(laneReceipt.steps.length)) {
        laneReceipt.steps.push(
          notRunStep(laterStep.id, laterStep.command, laterStep.args)
        );
      }
      break;
    }
    if (
      laneReceipt.status === "incomplete" ||
      laneReceipt.status === "failed"
    ) {
      for (const laterStep of lane.steps.slice(laneReceipt.steps.length)) {
        laneReceipt.steps.push(
          notRunStep(laterStep.id, laterStep.command, laterStep.args)
        );
      }
      break;
    }
  }

  const commandStatus = laneReceipt.status;
  const evidence = await validateLaneEvidence({
    repositoryRoot,
    lane,
    artifactRoot,
    migrationRevision,
    sourceAtStart,
    startTimeMs,
    runId,
    playwrightPort: environment.PLAYWRIGHT_PORT,
    marketingPort: environment.MARKETING_PORT,
    checkCounts,
    environment,
  });
  laneReceipt.tests = evidence.tests;
  laneReceipt.knownExclusions = evidence.knownExclusions ?? [];
  laneReceipt.targets = evidence.targets;
  laneReceipt.databases = evidence.databases;
  laneReceipt.cleanup = evidence.cleanup;
  laneReceipt.artifacts = evidence.artifacts;
  if (commandStatus === "running") {
    laneReceipt.status = evidence.status;
    laneReceipt.explanation = evidence.explanation;
  } else if (commandStatus === "failed" && evidence.status === "flaky") {
    laneReceipt.status = "flaky";
    laneReceipt.explanation = evidence.explanation;
  }
  laneReceipt.finishedAt = new Date().toISOString();
  return laneReceipt;
}

function commandArgs(
  laneId: VerificationLaneId,
  stepId: string,
  baseArgs: readonly string[],
  artifactRoot: string
) {
  if (laneId === "real-postgres") {
    return [...baseArgs];
  }
  if (laneId === "contract-evals") {
    return [...baseArgs, "--junit", join(artifactRoot, "contract.xml")];
  }
  if (laneId === "e2e") {
    return [
      ...baseArgs,
      "--retries=1",
      "--output",
      join(artifactRoot, "test-results-" + stepId),
    ];
  }
  return [...baseArgs];
}

function notRunStep(
  id: string,
  command: string,
  args: readonly string[]
): StepReceipt {
  const now = new Date().toISOString();
  return {
    id,
    command,
    args: [...args],
    startedAt: now,
    finishedAt: now,
    status: "not-run",
    exitCode: null,
    signal: null,
    timedOut: false,
    stdoutSha256: createHash("sha256").digest("hex"),
    explanation: "A previous required step did not pass.",
  };
}

function matchesKnownCompletionJourney(
  test: { file: string; title: string; projectName: string },
  step: "web" | "sendblue"
) {
  return (
    step === "web" &&
    reportFileMatchesRepositoryFile(
      test.file,
      knownCompletionJourneyExclusion.file
    ) &&
    test.title === knownCompletionJourneyExclusion.title &&
    test.projectName === knownCompletionJourneyExclusion.projectName
  );
}

function reportFileMatchesRepositoryFile(
  reportFile: string,
  repositoryFile: string
) {
  // Playwright JSON spec files are relative to testDir; resolve them inside the known repository test directory.
  if (
    posix.isAbsolute(reportFile) ||
    reportFile.includes("\\") ||
    reportFile.split("/").includes("..")
  ) {
    return false;
  }
  const testDirectory = posix.dirname(repositoryFile);
  return posix.join(testDirectory, reportFile) === repositoryFile;
}

async function validateLaneEvidence({
  repositoryRoot,
  lane,
  artifactRoot,
  migrationRevision,
  sourceAtStart,
  startTimeMs,
  runId,
  playwrightPort,
  marketingPort,
  checkCounts,
  environment,
}: {
  repositoryRoot: string;
  lane: VerificationLane;
  artifactRoot: string;
  migrationRevision: string;
  sourceAtStart: SourceFingerprint;
  startTimeMs: number;
  runId: string;
  playwrightPort: string | undefined;
  marketingPort: string | undefined;
  checkCounts: TestCounts | undefined;
  environment: NodeJS.ProcessEnv;
}): Promise<{
  status: LaneStatus;
  tests: TestCounts | "not-applicable" | "unavailable";
  knownExclusions?: KnownPlaywrightExclusion[];
  targets: Record<string, unknown>[] | "not-applicable";
  databases: Record<string, unknown>[] | "not-applicable";
  cleanup: LaneReceipt["cleanup"];
  artifacts: ArtifactReceipt[];
  explanation?: string;
}> {
  if (lane.id === "build") {
    const buildPaths = [".next/BUILD_ID", "apps/marketing/.next/BUILD_ID"];
    const artifacts: ArtifactReceipt[] = [];
    const problems: string[] = [];
    for (const path of buildPaths) {
      const result = await describeArtifact(repositoryRoot, path);
      if (result === undefined) {
        problems.push(`Required build output ${path} is missing.`);
        continue;
      }
      artifacts.push(result);
      const metadata = await stat(join(repositoryRoot, path));
      if (metadata.mtimeMs < startTimeMs) {
        problems.push(`Required build output ${path} predates this run.`);
      }
    }
    if (problems.length > 0) {
      return {
        ...incompleteEvidence(problems.join(" ")),
        artifacts,
      };
    }
    return {
      status: "passed",
      tests: "not-applicable",
      targets: "not-applicable",
      databases: "not-applicable",
      cleanup: "not-applicable",
      artifacts,
    };
  }

  if (lane.id === "checks") {
    if (checkCounts === undefined || checkCounts.discovered === 0) {
      return incompleteEvidence(
        "Required checks test counts were not recorded."
      );
    }
    return {
      status: "passed",
      tests: checkCounts,
      targets: "not-applicable",
      databases: [
        {
          kind: "not-applicable",
          reason:
            "Checks ran with REAL_PG=0; the independent real-postgres lane is authoritative.",
        },
      ],
      cleanup: "not-applicable",
      artifacts: [],
    };
  }

  if (lane.id === "real-postgres") {
    const junitPath = join(artifactRoot, "real-postgres.xml");
    const metadataPath = join(artifactRoot, "real-postgres-supervisor.json");
    const [{ counts, files }, metadata] = await Promise.all([
      parseJUnitFiles([junitPath]),
      readJson(metadataPath, artifactRoot),
    ]);
    const artifacts = await describeArtifacts(repositoryRoot, [
      relative(repositoryRoot, junitPath),
      relative(repositoryRoot, metadataPath),
    ]);
    const issues: string[] = [];
    if (files === 0 || counts.discovered === 0) {
      issues.push("Real Postgres did not produce a non-empty JUnit report.");
    }
    if (
      metadata?.schemaVersion !== 1 ||
      metadata.lane !== "real-postgres" ||
      !isObject(metadata.migration) ||
      metadata.migration.sourceRevision !== migrationRevision ||
      typeof metadata.composeProject !== "string" ||
      !/^open-instinct-ci-[a-f0-9]{32}$/u.test(metadata.composeProject)
    ) {
      issues.push(
        "Real Postgres supervisor identity or migration evidence is missing."
      );
    }
    if (metadata?.cleanup !== "passed") {
      issues.push("Real Postgres owned Compose cleanup did not pass.");
    }
    if (counts.failed > 0) {
      issues.push("Real Postgres reported failing required cases.");
    }
    if (counts.skipped > 0) {
      issues.push("Real Postgres reported skipped required cases.");
    }
    return {
      status:
        counts.failed > 0
          ? "failed"
          : issues.length === 0
            ? "passed"
            : "incomplete",
      tests: files > 0 ? counts : "unavailable",
      targets: "not-applicable",
      databases:
        typeof metadata?.composeProject === "string" &&
        /^open-instinct-ci-[a-f0-9]{32}$/u.test(metadata.composeProject)
          ? [
              {
                kind: "owned-compose-project",
                identity: metadata.composeProject,
                database:
                  "temporary database owned by the real-Postgres harness",
                migration: {
                  sourceJournalRevision: migrationRevision,
                  databaseJournalRevision: "not-independently-observed",
                  evidence:
                    "The required harness runs migrations against its newly created database before tests.",
                },
              },
            ]
          : "not-applicable",
      cleanup:
        metadata?.cleanup === "passed"
          ? "passed"
          : metadata?.cleanup === "failed"
            ? "failed"
            : "unknown",
      artifacts,
      ...(issues.length > 0 ? { explanation: issues.join(" ") } : {}),
    };
  }

  if (lane.id === "contract-evals") {
    const corePath = join(artifactRoot, "contract.xml");
    const mountPath = join(artifactRoot, "contract-mount.xml");
    const metadataPath = join(artifactRoot, "contract-supervisor.json");
    const [reports, metadata] = await Promise.all([
      parseJUnitFiles([corePath, mountPath]),
      readJson(metadataPath, artifactRoot),
    ]);
    const snapshotPath = join(
      artifactRoot,
      "contract-delivery-provider-snapshot.json"
    );
    const artifacts = await describeArtifacts(repositoryRoot, [
      relative(repositoryRoot, corePath),
      relative(repositoryRoot, mountPath),
      relative(repositoryRoot, metadataPath),
      relative(repositoryRoot, snapshotPath),
    ]);
    const issues: string[] = [];
    if (reports.files !== 2 || reports.counts.discovered === 0) {
      issues.push(
        "Contract product and mount JUnit reports are both required and must be non-empty."
      );
    }
    if (
      metadata?.schemaVersion !== 1 ||
      metadata.lane !== "contract-evals" ||
      !isObject(metadata.migration) ||
      metadata.migration.sourceRevision !== migrationRevision ||
      typeof metadata.composeProject !== "string" ||
      !/^open-instinct-contract-[a-f0-9]{8}-[a-f0-9]{8}$/u.test(
        metadata.composeProject
      )
    ) {
      issues.push(
        "Contract supervisor identity or migration evidence is missing."
      );
    }
    if (metadata?.cleanup !== "passed") {
      issues.push("Contract eval owned Compose cleanup did not pass.");
    }
    if (
      (await describeArtifact(
        repositoryRoot,
        relative(repositoryRoot, snapshotPath)
      )) === undefined
    ) {
      issues.push("Contract delivery-provider snapshot is missing.");
    }
    if (reports.counts.failed > 0) {
      issues.push("Contract evals reported failing required cases.");
    }
    if (reports.counts.skipped > 0) {
      issues.push("Contract evals reported skipped required cases.");
    }
    return {
      status:
        reports.counts.failed > 0
          ? "failed"
          : issues.length === 0
            ? "passed"
            : "incomplete",
      tests: reports.files > 0 ? reports.counts : "unavailable",
      targets: "not-applicable",
      databases:
        typeof metadata?.composeProject === "string" &&
        /^open-instinct-contract-[a-f0-9]{8}-[a-f0-9]{8}$/u.test(
          metadata.composeProject
        )
          ? [
              {
                kind: "owned-compose-project",
                identity: metadata.composeProject,
                database: "contract fixture database owned by the supervisor",
                migration: {
                  sourceJournalRevision: migrationRevision,
                  databaseJournalRevision: "not-independently-observed",
                  evidence:
                    "The owned migration command succeeded before contract evaluation.",
                },
              },
            ]
          : "not-applicable",
      cleanup:
        metadata?.cleanup === "passed"
          ? "passed"
          : metadata?.cleanup === "failed"
            ? "failed"
            : "unknown",
      artifacts,
      ...(issues.length > 0 ? { explanation: issues.join(" ") } : {}),
    };
  }

  const targets: Record<string, unknown>[] = [];
  const databases: Record<string, unknown>[] = [];
  const artifacts: ArtifactReceipt[] = [];
  let aggregate: TestCounts = emptyCounts();
  const issues: string[] = [];
  let fixtureEvidenceCount = 0;
  let cleanupFailures = 0;
  let cleanupUnknown = 0;
  const knownExclusions: KnownPlaywrightExclusion[] = [];
  const playwrightSteps = ["web", "sendblue"] as const;
  for (const step of playwrightSteps) {
    const jsonPath = join(artifactRoot, `playwright-${step}.json`);
    const devPath = join(artifactRoot, `development-${step}.json`);
    const outputDirectory = join(artifactRoot, `playwright-${step}-report`);
    const [json, dev] = await Promise.all([
      readText(jsonPath, artifactRoot),
      readJson(devPath, artifactRoot),
    ]);
    const report = json === undefined ? undefined : parsePlaywrightJson(json);
    if (report === undefined) {
      issues.push(`Playwright ${step} report is missing or has zero tests.`);
    } else {
      const counts = report.counts;
      aggregate = addCounts(aggregate, counts);
      if (counts.failed > 0)
        issues.push(`Playwright ${step} reported failed tests.`);
      if (counts.flaky > 0)
        issues.push(`Playwright ${step} reported retry-pass flaky tests.`);
      if (
        step === "web" &&
        !report.tests.some((test) => matchesKnownCompletionJourney(test, "web"))
      ) {
        issues.push(
          "Playwright web report omitted the completion-journey test case."
        );
      }
      let knownSkipRecorded = false;
      for (const test of report.tests) {
        if (test.status !== "skipped") continue;
        if (!knownSkipRecorded && matchesKnownCompletionJourney(test, step)) {
          knownSkipRecorded = true;
          knownExclusions.push(knownCompletionJourneyExclusion);
        } else {
          issues.push(
            `Playwright ${step} reported ${String(counts.skipped)} skipped test(s) outside the documented completion-journey exclusion.`
          );
          break;
        }
      }
    }
    artifacts.push(
      ...(await describeArtifacts(repositoryRoot, [
        relative(repositoryRoot, jsonPath),
        relative(repositoryRoot, devPath),
        relative(repositoryRoot, outputDirectory),
        relative(
          repositoryRoot,
          join(artifactRoot, `test-results-e2e-${step}`)
        ),
      ]))
    );
    const expectedDevRunId = `verify-${runId.replaceAll("-", "").slice(0, 20)}-${step}`;
    const expectedAppUrl =
      playwrightPort === undefined
        ? undefined
        : `http://127.0.0.1:${playwrightPort}`;
    const expectedMarketingUrl =
      marketingPort === undefined
        ? undefined
        : `http://127.0.0.1:${marketingPort}`;
    const expectedComposeProject = await expectedFixtureComposeProject(
      repositoryRoot,
      expectedDevRunId
    );
    if (
      dev?.schemaVersion !== 1 ||
      dev.runId !== expectedDevRunId ||
      dev.profile !== "fixture" ||
      dev.composeProject !== expectedComposeProject ||
      dev.volume !== `${expectedComposeProject}_postgres-data` ||
      !isObject(dev.origins) ||
      dev.origins.app !== expectedAppUrl ||
      dev.origins.marketing !== expectedMarketingUrl ||
      !isObject(dev.readiness) ||
      dev.readiness.database !== "ready" ||
      dev.readiness.migrations !== "ready"
    ) {
      issues.push(
        `Playwright ${step} fixture identity or readiness is missing.`
      );
      cleanupUnknown += 1;
      continue;
    }
    fixtureEvidenceCount += 1;
    const cleanupEvidence = await inspectFixtureCleanup({
      repositoryRoot,
      runId: expectedDevRunId,
      composeProject: expectedComposeProject,
      environment,
    });
    const cleanupStates = [
      cleanupEvidence.runRecord,
      cleanupEvidence.containers,
      cleanupEvidence.volumes,
      cleanupEvidence.networks,
    ];
    const presentResources = cleanupStates.filter(
      (resource) => resource.state === "present"
    );
    const unknownResources = cleanupStates.filter(
      (resource) => resource.state === "unknown"
    );
    if (presentResources.length > 0) {
      cleanupFailures += 1;
      const descriptions = [
        cleanupEvidence.runRecord.state === "present" ? "run record" : "",
        cleanupEvidence.containers.state === "present" ? "containers" : "",
        cleanupEvidence.volumes.state === "present" ? "volumes" : "",
        cleanupEvidence.networks.state === "present" ? "networks" : "",
      ].filter(Boolean);
      issues.push(
        `Playwright ${step} fixture left owned ${descriptions.join(", ")} behind.`
      );
    }
    if (unknownResources.length > 0) {
      cleanupUnknown += 1;
      const descriptions = [
        cleanupEvidence.runRecord.state === "unknown" ? "run record" : "",
        cleanupEvidence.containers.state === "unknown"
          ? "container inventory"
          : "",
        cleanupEvidence.volumes.state === "unknown" ? "volume inventory" : "",
        cleanupEvidence.networks.state === "unknown" ? "network inventory" : "",
      ].filter(Boolean);
      issues.push(
        `Playwright ${step} fixture cleanup could not verify ${descriptions.join(", ")}.`
      );
    }
    targets.push({
      kind: "local-fixture",
      url: dev.origins.app,
      browserBaseURL: expectedAppUrl ?? "http://127.0.0.1:unknown",
      marketingURL: dev.origins.marketing,
      generation: dev.runId,
      sourceFingerprint: sourceAtStart.digest,
      launchSourceHead: sourceAtStart.headSha,
    });
    databases.push({
      kind: "owned-compose-project",
      identity: dev.composeProject,
      volume: dev.volume,
      migration: {
        sourceJournalRevision: migrationRevision,
        databaseJournalRevision: "not-independently-observed",
        evidence:
          "Fixture supervisor reported readiness after its migration command succeeded.",
      },
      cleanup: cleanupEvidence,
    });
  }
  const status: LaneStatus =
    aggregate.failed > 0
      ? "failed"
      : aggregate.flaky > 0
        ? "flaky"
        : issues.length > 0
          ? "incomplete"
          : "passed";
  return {
    status: aggregate.discovered > 0 ? status : "incomplete",
    tests: aggregate.discovered > 0 ? aggregate : "unavailable",
    knownExclusions,
    targets,
    databases,
    cleanup:
      cleanupFailures > 0
        ? "failed"
        : fixtureEvidenceCount === playwrightSteps.length &&
            cleanupUnknown === 0
          ? "passed"
          : "unknown",
    artifacts,
    ...(issues.length > 0 ? { explanation: issues.join(" ") } : {}),
  };
}

async function expectedFixtureComposeProject(
  repositoryRoot: string,
  runId: string
) {
  const repositoryHash = createHash("sha256")
    .update(await realpath(resolve(repositoryRoot)))
    .digest("hex")
    .slice(0, 8);
  const runHash = createHash("sha256").update(runId).digest("hex").slice(0, 12);
  return `open-instinct-fixture-${repositoryHash}-${runHash}`;
}

async function inspectFixtureCleanup({
  repositoryRoot,
  runId,
  composeProject,
  environment,
}: {
  repositoryRoot: string;
  runId: string;
  composeProject: string;
  environment: NodeJS.ProcessEnv;
}): Promise<FixtureCleanupEvidence> {
  const runRecordPath = join(
    repositoryRoot,
    ".eve",
    "dev-runs",
    `run-${runId}.json`
  );
  let runRecord: CleanupResourceEvidence;
  try {
    runRecord = (await pathExists(runRecordPath))
      ? { state: "present", count: 1 }
      : { state: "absent", count: 0 };
  } catch {
    runRecord = { state: "unknown", count: null };
  }

  const dockerEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: environment.NODE_ENV,
  };
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
  ]) {
    const value = environment[key];
    if (value !== undefined) dockerEnvironment[key] = value;
  }
  const labelFilter = `label=com.docker.compose.project=${composeProject}`;
  const resourceCommands = [
    {
      resource: "containers" as const,
      args: ["ps", "--all", "--quiet", "--filter", labelFilter],
    },
    {
      resource: "volumes" as const,
      args: ["volume", "ls", "--quiet", "--filter", labelFilter],
    },
    {
      resource: "networks" as const,
      args: ["network", "ls", "--quiet", "--filter", labelFilter],
    },
  ];
  const inventories = await Promise.all(
    resourceCommands.map(async ({ resource, args }) => {
      try {
        const { stdout } = await execFileAsync("docker", args, {
          cwd: repositoryRoot,
          env: dockerEnvironment,
          encoding: "utf8",
          maxBuffer: 4096,
          timeout: 10_000,
        });
        const count = stdout
          .split(/\r?\n/u)
          .filter((line) => line.length > 0).length;
        return [
          resource,
          {
            state: count === 0 ? "absent" : "present",
            count,
          } satisfies CleanupResourceEvidence,
        ] as const;
      } catch {
        return [
          resource,
          { state: "unknown", count: null } satisfies CleanupResourceEvidence,
        ] as const;
      }
    })
  );
  return {
    runRecord,
    containers: inventories.find(
      ([resource]) => resource === "containers"
    )?.[1] ?? {
      state: "unknown",
      count: null,
    },
    volumes: inventories.find(([resource]) => resource === "volumes")?.[1] ?? {
      state: "unknown",
      count: null,
    },
    networks: inventories.find(
      ([resource]) => resource === "networks"
    )?.[1] ?? {
      state: "unknown",
      count: null,
    },
  };
}

async function runProcess({
  command,
  args,
  cwd,
  environment,
  timeoutMs,
}: {
  command: string;
  args: string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<{
  process: ProcessResult;
  status: StepStatus;
  startedAt: string;
  finishedAt: string;
}> {
  const startedAt = new Date().toISOString();
  const hash = createHash("sha256");
  let outputTail = "";
  let outputTruncated = false;
  const executable = command === "node" ? process.execPath : command;
  let child: ChildProcess;
  try {
    child = spawn(executable, args, {
      cwd,
      env: environment,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    const finishedAt = new Date().toISOString();
    const processResult: ProcessResult = {
      exitCode: null,
      signal: null,
      timedOut: false,
      spawnFailed: true,
      outputTail,
      outputSha256: hash.digest("hex"),
      outputTruncated: false,
    };
    return { process: processResult, status: "blocked", startedAt, finishedAt };
  }
  activeChild = child;
  const onData = (chunk: Buffer, destination: NodeJS.WriteStream) => {
    hash.update(chunk);
    outputTail += chunk.toString("utf8");
    if (Buffer.byteLength(outputTail, "utf8") > maxCapturedOutputBytes) {
      outputTail = outputTail.slice(-maxCapturedOutputBytes);
      outputTruncated = true;
    }
    destination.write(chunk);
  };
  child.stdout?.on("data", (chunk: Buffer) => {
    onData(chunk, process.stdout);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    onData(chunk, process.stderr);
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    stopActiveChild("SIGTERM");
  }, timeoutMs);
  timeout.unref();
  const spawnFailed = await new Promise<boolean>((resolvePromise) => {
    child.once("error", () => {
      resolvePromise(true);
    });
    child.once("spawn", () => {
      resolvePromise(false);
    });
  });
  const close = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolvePromise) => {
    child.once("close", (code, signal) => {
      resolvePromise({ exitCode: code, signal });
    });
  });
  clearTimeout(timeout);
  clearTimeout(forceKillTimer);
  if (activeChild === child) activeChild = undefined;
  const finishedAt = new Date().toISOString();
  const processResult: ProcessResult = {
    ...close,
    timedOut,
    spawnFailed,
    outputTail,
    outputSha256: hash.digest("hex"),
    outputTruncated,
  };
  // The timer writes this flag from Node's event loop after the child starts.
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  if (timedOut) {
    return {
      process: processResult,
      status: "blocked",
      startedAt,
      finishedAt,
    };
  }
  const status: StepStatus =
    interruption !== undefined
      ? "cancelled"
      : close.exitCode === 0
        ? "passed"
        : "failed";
  return { process: processResult, status, startedAt, finishedAt };
}

function stopActiveChild(signal: NodeJS.Signals) {
  const child = activeChild;
  if (child?.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "ESRCH")
    ) {
      console.error("Could not signal the verification child process.");
    }
  }
  clearTimeout(forceKillTimer);
  forceKillTimer = setTimeout(() => {
    try {
      if (process.platform === "win32") child.kill("SIGKILL");
      else if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
    } catch {
      // The child or its process group already exited.
    }
  }, 20_000);
  forceKillTimer.unref();
}

async function persistStepOutput({
  artifactRoot,
  repositoryRoot,
  laneId,
  stepId,
  output,
  truncated,
}: {
  artifactRoot: string;
  repositoryRoot: string;
  laneId: VerificationLaneId;
  stepId: string;
  output: string;
  truncated: boolean;
}) {
  const path = join(artifactRoot, `step-${laneId}-${stepId}.log`);
  await writeFile(path, output, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return {
    path: relative(repositoryRoot, path),
    sha256: createHash("sha256").update(output).digest("hex"),
    truncated,
  };
}

function incompleteEvidence(explanation: string) {
  return {
    status: "incomplete" as const,
    tests: "unavailable" as const,
    targets: "not-applicable" as const,
    databases: "not-applicable" as const,
    cleanup: "unknown" as const,
    artifacts: [] as ArtifactReceipt[],
    explanation,
  };
}

const migrationJournalSchema = z.object({
  entries: z.array(z.object({ tag: z.string().optional() })).optional(),
});
const packageManifestSchema = z.object({
  packageManager: z.string().optional(),
});

async function sourceMigrationRevision(repositoryRoot: string) {
  const path = join(repositoryRoot, "db/migrations/meta/_journal.json");
  const source: unknown = JSON.parse(await readFile(path, "utf8"));
  const tag = migrationJournalSchema.parse(source).entries?.at(-1)?.tag;
  if (tag === undefined || tag.length === 0) {
    throw new Error("Could not identify the latest source migration revision.");
  }
  return tag;
}

async function packageManagerDeclaration(repositoryRoot: string) {
  const source: unknown = JSON.parse(
    await readFile(join(repositoryRoot, "package.json"), "utf8")
  );
  return packageManifestSchema.parse(source).packageManager ?? "unknown";
}

async function readJson(
  path: string,
  artifactRoot: string
): Promise<Record<string, unknown> | undefined> {
  const text = await readText(path, artifactRoot);
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function readText(path: string, artifactRoot: string) {
  const root = resolve(artifactRoot);
  const absolutePath = resolve(path);
  const childPath = relative(root, absolutePath);
  if (
    childPath === "" ||
    childPath === ".." ||
    childPath.startsWith(`..${sep}`) ||
    isAbsolute(childPath)
  ) {
    return undefined;
  }
  const rootMetadata = await lstat(root).catch((error: unknown) => {
    if (isNotFound(error)) return undefined;
    throw error;
  });
  if (
    rootMetadata === undefined ||
    !rootMetadata.isDirectory() ||
    rootMetadata.isSymbolicLink()
  ) {
    return undefined;
  }
  const components = childPath.split(sep);
  let parent = root;
  for (const component of components.slice(0, -1)) {
    parent = join(parent, component);
    const metadata = await lstat(parent).catch((error: unknown) => {
      if (isNotFound(error)) return undefined;
      throw error;
    });
    if (
      metadata === undefined ||
      !metadata.isDirectory() ||
      metadata.isSymbolicLink()
    ) {
      return undefined;
    }
  }
  const metadata = await lstat(absolutePath).catch((error: unknown) => {
    if (isNotFound(error)) return undefined;
    throw error;
  });
  if (
    metadata === undefined ||
    !metadata.isFile() ||
    metadata.isSymbolicLink()
  ) {
    return undefined;
  }
  const handle = await open(
    absolutePath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    if (!(await handle.stat()).isFile()) return undefined;
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function addCounts(left: TestCounts, right: TestCounts): TestCounts {
  return {
    discovered: left.discovered + right.discovered,
    passed: left.passed + right.passed,
    failed: left.failed + right.failed,
    skipped: left.skipped + right.skipped,
    flaky: left.flaky + right.flaky,
  };
}

function emptyCounts(): TestCounts {
  return { discovered: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFound(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replaceAll(
      /(?:postgres(?:ql)?:\/\/)[^\s"']+/giu,
      "[database-url]"
    );
  }
  return "Unexpected verification failure.";
}
