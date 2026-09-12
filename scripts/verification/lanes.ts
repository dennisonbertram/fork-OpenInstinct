export const verificationLanes = [
  {
    id: "checks",
    ciName: "Checks",
    steps: [
      { id: "checks", command: "pnpm", args: ["check"] },
      { id: "diff-check", command: "git", args: ["diff", "--check"] },
    ],
    environmentProfile: "checks-synthetic-v1",
    timeoutMs: 30 * 60 * 1000,
    requiredCommands: ["pnpm"],
    artifacts: [],
  },
  {
    id: "build",
    ciName: "Build",
    steps: [{ id: "build", command: "pnpm", args: ["build"] }],
    environmentProfile: "build-synthetic-v1",
    timeoutMs: 20 * 60 * 1000,
    requiredCommands: ["pnpm"],
    artifacts: [".next/BUILD_ID", "apps/marketing/.next/BUILD_ID"],
  },
  {
    id: "real-postgres",
    ciName: "Real Postgres",
    steps: [
      {
        id: "real-postgres",
        command: "node",
        args: ["--experimental-strip-types", "scripts/test-real-postgres.ts"],
      },
    ],
    environmentProfile: "real-postgres-synthetic-v1",
    timeoutMs: 15 * 60 * 1000,
    requiredCommands: ["docker", "node", "pnpm"],
    artifacts: [".eve/ci/real-postgres.xml"],
  },
  {
    id: "contract-evals",
    ciName: "Contract evals",
    steps: [
      {
        id: "contract-evals",
        command: "node",
        args: ["--experimental-strip-types", "scripts/run-contract-evals.ts"],
      },
    ],
    environmentProfile: "contract-synthetic-v1",
    timeoutMs: 20 * 60 * 1000,
    requiredCommands: ["docker", "node", "pnpm"],
    artifacts: [
      ".eve/evals",
      ".eve/contract*.xml",
      "evals/contract/mount-harness/.eve/evals",
      "evals/contract/mount-harness/.eve/contract*.xml",
    ],
  },
  {
    id: "e2e",
    ciName: "E2E",
    steps: [
      {
        id: "e2e-web",
        command: "pnpm",
        args: [
          "exec",
          "playwright",
          "test",
          "--config",
          "playwright.config.ts",
          "--fail-on-flaky-tests",
          "--reporter=html,json",
        ],
      },
      {
        id: "e2e-sendblue",
        command: "pnpm",
        args: [
          "exec",
          "playwright",
          "test",
          "--config",
          "playwright.sendblue.config.ts",
          "--fail-on-flaky-tests",
          "--reporter=html,json",
        ],
      },
    ],
    environmentProfile: "e2e-fixture-synthetic-v1",
    timeoutMs: 45 * 60 * 1000,
    requiredCommands: ["docker", "pnpm"],
    artifacts: ["playwright-report", "test-results"],
  },
] as const;

export type VerificationLaneId = (typeof verificationLanes)[number]["id"];
export type VerificationLane = (typeof verificationLanes)[number];

export const completeLaneIds = verificationLanes.map(({ id }) => id);

const fullGatePaths = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".github/workflows/",
  "scripts/verify.ts",
  "scripts/verification/",
  "scripts/local/",
  "playwright.config.ts",
  "playwright.sendblue.config.ts",
  "vitest.config.ts",
  "next.config.ts",
  "tsconfig.json",
  "db/schema.ts",
  "db/migrations/",
  "agent/",
  "src/",
  "apps/",
] as const;

export interface LaneSelection {
  selected: VerificationLaneId[];
  reasons: Record<VerificationLaneId, string>;
  completeFallback: boolean;
}

export function selectQuickLanes(paths: readonly string[]): LaneSelection {
  const normalized = [...new Set(paths.map(normalizePath))].filter(Boolean);
  if (normalized.length === 0) {
    return fullSelection(
      "No changed paths were found; using the complete gate."
    );
  }

  const broadPath = normalized.find((path) =>
    fullGatePaths.some((candidate) =>
      candidate.endsWith("/") ? path.startsWith(candidate) : path === candidate
    )
  );
  if (broadPath !== undefined) {
    return fullSelection(
      `${broadPath} is a shared, high-impact, or unclassified gate input.`
    );
  }

  const selected = new Set<VerificationLaneId>();
  const reasons = emptyReasons();
  for (const path of normalized) {
    const lane = laneForKnownPath(path);
    if (lane === undefined) {
      return fullSelection(
        `${path} has no verified owner rule; using the complete gate.`
      );
    }
    selected.add(lane.id);
    reasons[lane.id] = lane.reason;
  }

  for (const { id } of verificationLanes) {
    if (reasons[id] === "") reasons[id] = "No changed path maps to this lane.";
  }
  return {
    selected: [...selected],
    reasons,
    completeFallback: false,
  };
}

function laneForKnownPath(path: string) {
  if (path.startsWith("tests/e2e/") || path.startsWith("tests/e2e-sendblue/")) {
    return {
      id: "e2e" as const,
      reason: "Changed browser journey or fixture.",
    };
  }
  if (path.startsWith("tests/integration/real-postgres")) {
    return {
      id: "real-postgres" as const,
      reason: "Changed the real-Postgres contract or its tests.",
    };
  }
  if (path.startsWith("evals/contract/") || path === "docs/CONTRACT_EVALS.md") {
    return {
      id: "contract-evals" as const,
      reason: "Changed the deterministic Eve contract suite or its fixtures.",
    };
  }
  if (
    path.startsWith("tests/unit/") ||
    path.startsWith("tests/integration/") ||
    path.endsWith(".md")
  ) {
    return { id: "checks" as const, reason: "Changed a test or document." };
  }
  return undefined;
}

function fullSelection(reason: string): LaneSelection {
  return {
    selected: [...completeLaneIds],
    reasons: buildReasons(() => `Full-gate fallback: ${reason}`),
    completeFallback: true,
  };
}

function emptyReasons(): Record<VerificationLaneId, string> {
  return {
    checks: "",
    build: "",
    "real-postgres": "",
    "contract-evals": "",
    e2e: "",
  };
}

export function buildReasons(value: (_id: VerificationLaneId) => string) {
  return {
    checks: value("checks"),
    build: value("build"),
    "real-postgres": value("real-postgres"),
    "contract-evals": value("contract-evals"),
    e2e: value("e2e"),
  };
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "");
}
