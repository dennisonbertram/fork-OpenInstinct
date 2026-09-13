import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { TargetIdentityFact } from "../../scripts/diagnostics/contract";

interface TargetReadFixture {
  readonly facts: Record<string, TargetIdentityFact>;
  readonly capabilities: readonly [];
  readonly gaps: readonly [];
}

interface AdminIdentityFixture {
  readonly kind: "result";
  readonly value: {
    readonly serverOrigin: TargetIdentityFact;
    readonly facts: ReturnType<typeof runtimeIdentityFixture>;
  };
}

const diagnosticsMocks = vi.hoisted(() => ({
  readAdminIdentity: vi.fn<() => Promise<AdminIdentityFixture>>(),
  readEveSessionMetadata: vi.fn<
    () => Promise<{
      observations: never[];
      childSessionIds: string[];
      gap?: "cannot_determine" | "forbidden" | "truncated" | "unavailable";
    }>
  >(),
  readProtectedJourney: vi.fn<
    (input: { readonly sessionId: string }) => Promise<{
      kind: "result";
      value: {
        observations: never[];
        gaps: { owner: string; reason: "cannot_determine" | "missing" }[];
        bounds: { truncated: boolean };
      };
    }>
  >(),
  readDiagnosticCookie: vi.fn<() => Promise<string>>(),
  readTarget: vi.fn<() => Promise<TargetReadFixture>>(),
}));

vi.mock("../../scripts/diagnostics/operations-query", () => ({
  readAdminIdentity: diagnosticsMocks.readAdminIdentity,
  readProtectedJourney: diagnosticsMocks.readProtectedJourney,
}));

vi.mock("../../scripts/diagnostics/eve-stream", () => ({
  readEveSessionMetadata: diagnosticsMocks.readEveSessionMetadata,
}));

vi.mock("../../scripts/diagnostics/read-target", () => ({
  readDiagnosticCookie: diagnosticsMocks.readDiagnosticCookie,
  readTarget: diagnosticsMocks.readTarget,
}));

afterEach(() => {
  diagnosticsMocks.readAdminIdentity.mockReset();
  diagnosticsMocks.readEveSessionMetadata.mockReset();
  diagnosticsMocks.readProtectedJourney.mockReset();
  diagnosticsMocks.readDiagnosticCookie.mockReset();
  diagnosticsMocks.readTarget.mockReset();
  vi.restoreAllMocks();
});

describe("diagnostic CLI runtime composition", () => {
  it("reconciles only the root database placeholder after a successful Eve stream", async () => {
    setJourneyCliFixtures();
    diagnosticsMocks.readEveSessionMetadata.mockResolvedValue({
      observations: [],
      childSessionIds: ["ses_child"],
    });
    diagnosticsMocks.readProtectedJourney.mockImplementation(
      async ({ sessionId }) => ({
        kind: "result",
        value: {
          observations: [],
          gaps:
            sessionId === "ses_root"
              ? [
                  { owner: "eve", reason: "cannot_determine" },
                  { owner: "session", reason: "missing" },
                ]
              : [{ owner: "eve", reason: "cannot_determine" }],
          bounds: { truncated: false },
        },
      })
    );
    const output = await runJourneyCli();

    expect(output.gaps).toEqual([
      { owner: "session", reason: "missing" },
      { owner: "eve", reason: "cannot_determine" },
    ]);
    expect(diagnosticsMocks.readProtectedJourney).toHaveBeenCalledTimes(2);
  });

  it.each(["unavailable", "truncated"] as const)(
    "retains the root database placeholder when the Eve stream is %s",
    async (gap) => {
      setJourneyCliFixtures();
      diagnosticsMocks.readEveSessionMetadata.mockResolvedValue({
        observations: [],
        childSessionIds: [],
        gap,
      });
      diagnosticsMocks.readProtectedJourney.mockResolvedValue({
        kind: "result",
        value: {
          observations: [],
          gaps: [{ owner: "eve", reason: "cannot_determine" }],
          bounds: { truncated: false },
        },
      });
      const output = await runJourneyCli();

      expect(output.gaps).toEqual(
        expect.arrayContaining([
          { owner: "eve", reason: gap },
          { owner: "eve", reason: "cannot_determine" },
        ])
      );
    }
  );

  it("retains safe operations identity versions and provider configuration through main", async () => {
    diagnosticsMocks.readTarget.mockResolvedValue({
      facts: {
        environment: { status: "observed", value: "local" },
        localRunOwner: { status: "observed", value: true },
        localAppChild: { status: "observed", value: true },
        localAppOrigin: { status: "observed", value: "http://127.0.0.1:3000" },
        projectId: { status: "unknown" },
        deploymentId: { status: "unknown" },
        declaredSourceSha: { status: "unknown" },
      },
      capabilities: [],
      gaps: [],
    });
    diagnosticsMocks.readDiagnosticCookie.mockResolvedValue("synthetic-cookie");
    diagnosticsMocks.readAdminIdentity.mockResolvedValue({
      kind: "result",
      value: {
        serverOrigin: { status: "unknown" },
        facts: runtimeIdentityFixture(),
      },
    });
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    const { main } = await import("../../scripts/diagnostics");

    await main(["--target", "local", "--status", "--cookie-file", "/safe"]);

    const result = z
      .object({
        targetIdentity: z.object({
          facts: z.record(
            z.string(),
            z.object({ value: z.union([z.string(), z.boolean()]).optional() })
          ),
        }),
      })
      .parse(JSON.parse(output.join("")));
    expect(result.targetIdentity.facts.runtimeNodeVersion?.value).toBe(
      "24.15.0"
    );
    expect(result.targetIdentity.facts.runtimeNextVersion?.value).toBe(
      "16.0.0"
    );
    expect(result.targetIdentity.facts.runtimeEveVersion?.value).toBe("0.49.0");
    expect(result.targetIdentity.facts.providerLinq?.value).toBe(
      "configured-not-validated"
    );
    expect(result.targetIdentity.facts.otpProvider?.value).toBe("linq");
    expect(result.targetIdentity.facts.sendblueConversations?.value).toBe(
      "off"
    );
  });
});

function setJourneyCliFixtures() {
  diagnosticsMocks.readTarget.mockResolvedValue({
    facts: {
      environment: { status: "observed", value: "local" },
      localRunOwner: { status: "observed", value: true },
      localAppChild: { status: "observed", value: true },
      localAppOrigin: { status: "observed", value: "http://127.0.0.1:3000" },
      projectId: { status: "unknown" },
      deploymentId: { status: "unknown" },
      declaredSourceSha: { status: "unknown" },
    },
    capabilities: [],
    gaps: [],
  });
  diagnosticsMocks.readDiagnosticCookie.mockResolvedValue("synthetic-cookie");
  diagnosticsMocks.readAdminIdentity.mockResolvedValue({
    kind: "result",
    value: {
      serverOrigin: { status: "unknown" },
      facts: runtimeIdentityFixture(),
    },
  });
}

async function runJourneyCli() {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  const { main } = await import("../../scripts/diagnostics");
  await main([
    "--target",
    "local",
    "--session",
    "ses_root",
    "--since",
    "2026-09-12T10:00:00.000Z",
    "--until",
    "2026-09-12T11:00:00.000Z",
    "--cookie-file",
    "/safe",
  ]);
  return z
    .object({
      gaps: z.array(z.object({ owner: z.string(), reason: z.string() })),
    })
    .parse(JSON.parse(output.join("")));
}

function runtimeIdentityFixture() {
  return {
    database: { status: "unknown" as const, reason: "not_configured" },
    buildRevision: observed("aaaaaaaaaaaa"),
    deploymentId: { status: "unknown" as const, reason: "not_configured" },
    environment: observed("local-development"),
    projectId: { status: "unknown" as const, reason: "not_configured" },
    appliedEvePatch: {
      status: "unknown" as const,
      reason: "not_runtime_attested",
    },
    declaredEvePatch: observed("eve-patch-1"),
    declaredEvePatchSha256: observed("a".repeat(64)),
    eveVersion: observed("0.49.0"),
    lockSha256: observed("b".repeat(64)),
    nextVersion: observed("16.0.0"),
    nodeVersion: observed("24.15.0"),
    otpProvider: observed("linq"),
    providerGoogle: observed("not-configured"),
    providerLinq: observed("configured-not-validated"),
    providerSendblue: observed("not-configured"),
    providerSquare: observed("not-configured"),
    sendblueConversations: observed("off"),
    squareEnvironment: observed("sandbox"),
  };
}

function observed(value: string | boolean) {
  return { status: "observed" as const, value };
}
