import { describe, expect, it, vi } from "vitest";
import {
  authenticatedOriginFromFacts,
  readBoundDiagnosticTarget,
} from "../../scripts/diagnostics";

describe("authenticated diagnostic target binding", () => {
  it("makes zero authenticated fetches when deployment metadata does not bind to the configured project", async () => {
    const facts = {
      projectId: { status: "observed", value: "prj_configured" },
      deploymentProjectId: {
        status: "mismatch",
        declared: "prj_configured",
        observed: "prj_other",
      },
      teamId: { status: "observed", value: "team_configured" },
      environment: { status: "observed", value: "production" },
      canonicalAliasOrigin: {
        status: "observed",
        value: "https://app.example.test",
      },
      immutableDeploymentOrigin: {
        status: "observed",
        value: "https://immutable.example.test",
      },
    } as const;
    const reader = vi.fn<() => Promise<string>>(async () => "must-not-run");
    const result = await readBoundDiagnosticTarget(
      facts,
      ["--cookie-file", "/does-not-need-to-exist"],
      reader
    );

    expect(result).toEqual({ kind: "missing" });
    expect(reader).not.toHaveBeenCalled();
    expect(authenticatedOriginFromFacts(facts)).toBeUndefined();
  });

  it("requires verified local ownership before using a loopback manifest origin", () => {
    expect(
      authenticatedOriginFromFacts({
        environment: { status: "observed", value: "local" },
        localRunOwner: { status: "observed", value: false },
        localAppChild: { status: "observed", value: true },
        localAppOrigin: {
          status: "observed",
          value: "http://127.0.0.1:3000",
        },
      })
    ).toBeUndefined();
  });

  it("makes zero authenticated fetches when project-account provenance conflicts with deployment-team provenance", async () => {
    const reader = vi.fn<() => Promise<string>>(async () => "must-not-run");
    const result = await readBoundDiagnosticTarget(
      {
        projectId: { status: "observed", value: "prj_configured" },
        deploymentProjectId: { status: "observed", value: "prj_configured" },
        teamId: {
          status: "mismatch",
          declared: "team_configured",
          observed: "team_other",
        },
        deploymentTeamId: { status: "observed", value: "team_configured" },
        environment: { status: "observed", value: "production" },
        canonicalAliasOrigin: {
          status: "observed",
          value: "https://app.example.test",
        },
      },
      ["--cookie-file", "/does-not-need-to-exist"],
      reader
    );

    expect(result).toEqual({ kind: "missing" });
    expect(reader).not.toHaveBeenCalled();
  });
});
