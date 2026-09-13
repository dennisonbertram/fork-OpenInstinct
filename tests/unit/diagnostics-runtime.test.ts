import { describe, expect, it } from "vitest";
import {
  compareRuntimeControlFacts,
  runtimeMetadataFacts,
} from "../../scripts/diagnostics";
import { serializeDiagnosticResult } from "../../scripts/diagnostics/contract";

describe("runtime target identity comparison", () => {
  it("composes safe runtime versions, build metadata, and provider state through the output sanitizer", () => {
    const facts = runtimeMetadataFacts({
      appliedEvePatch: { status: "unknown", reason: "not_runtime_attested" },
      declaredEvePatch: { status: "observed", value: "eve-patch-1" },
      declaredEvePatchSha256: { status: "observed", value: "a".repeat(64) },
      eveVersion: { status: "observed", value: "0.49.0" },
      lockSha256: { status: "observed", value: "b".repeat(64) },
      nextVersion: { status: "observed", value: "16.0.0" },
      nodeVersion: { status: "observed", value: "24.15.0" },
      otpProvider: { status: "observed", value: "linq" },
      providerGoogle: { status: "observed", value: "not-configured" },
      providerLinq: {
        status: "observed",
        value: "configured-not-validated",
      },
      providerSendblue: { status: "observed", value: "not-configured" },
      providerSquare: { status: "observed", value: "not-configured" },
      sendblueConversations: { status: "observed", value: "off" },
      squareEnvironment: { status: "observed", value: "sandbox" },
    });
    const output = serializeDiagnosticResult({
      query: { mode: "target_status", target: "local", surface: "app" },
      status: "partial",
      targetIdentity: { facts },
      capabilities: [],
      observations: [],
      gaps: [],
      bounds: {
        pageLimit: 100,
        pagesRead: 0,
        truncated: false,
        redaction: "allowlist",
      },
    });

    for (const value of [
      '"runtimeNodeVersion":{"status":"observed","value":"24.15.0"}',
      '"runtimeNextVersion":{"status":"observed","value":"16.0.0"}',
      '"runtimeEveVersion":{"status":"observed","value":"0.49.0"}',
      '"providerLinq":{"status":"observed","value":"configured-not-validated"}',
      '"otpProvider":{"status":"observed","value":"linq"}',
      '"sendblueConversations":{"status":"observed","value":"off"}',
    ])
      expect(output).toContain(value);
  });

  it("keeps control-plane metadata and marks a different runtime SHA, project, deployment, and environment as mismatches", () => {
    const control = {
      projectId: { status: "observed" as const, value: "prj_production" },
      deploymentId: { status: "observed" as const, value: "dpl_production" },
      environment: { status: "observed" as const, value: "production" },
      declaredSourceSha: {
        status: "observed" as const,
        value: "aaaaaaaaaaaa",
      },
    };

    expect(
      compareRuntimeControlFacts(control, {
        projectId: { status: "observed", value: "prj_preview" },
        deploymentId: { status: "observed", value: "dpl_preview" },
        environment: { status: "observed", value: "preview" },
        buildRevision: { status: "observed", value: "bbbbbbbbbbbb" },
      })
    ).toEqual({
      runtimeProjectId: {
        status: "mismatch",
        declared: "prj_production",
        observed: "prj_preview",
      },
      runtimeDeploymentId: {
        status: "mismatch",
        declared: "dpl_production",
        observed: "dpl_preview",
      },
      runtimeEnvironment: {
        status: "mismatch",
        declared: "production",
        observed: "preview",
      },
      servedRuntimeSha: {
        status: "mismatch",
        declared: "aaaaaaaaaaaa",
        observed: "bbbbbbbbbbbb",
      },
    });
    expect(control).toEqual({
      projectId: { status: "observed", value: "prj_production" },
      deploymentId: { status: "observed", value: "dpl_production" },
      environment: { status: "observed", value: "production" },
      declaredSourceSha: {
        status: "observed",
        value: "aaaaaaaaaaaa",
      },
    });
  });
});
