import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { DiagnosticResult } from "../../scripts/diagnostics/contract";
import {
  parseDiagnosticArgs,
  serializeDiagnosticResult,
} from "../../scripts/diagnostics/contract";

const since = "2026-09-12T10:00:00.000Z";
const until = "2026-09-12T10:15:00.000Z";

function journeyArgs(...selector: string[]) {
  return ["--target", "local", ...selector, "--since", since, "--until", until];
}

function diagnosticResult(
  overrides: Partial<DiagnosticResult> = {}
): DiagnosticResult {
  return {
    query: {
      mode: "target_status",
      target: "preview",
      surface: "app",
    },
    status: "partial",
    targetIdentity: {
      facts: {
        projectId: { status: "observed", value: "prj_synthetic" },
        environmentId: { status: "observed", value: "preview" },
        projectName: {
          status: "mismatch",
          declared: "open-instinct",
          observed: "jory",
        },
        declaredSourceSha: { status: "observed", value: "abc123" },
        servedRuntimeSha: { status: "unknown" },
        databaseLogicalIdentity: { status: "observed", value: "db_synthetic" },
        databasePoolRole: {
          status: "mismatch",
          declared: "pooled",
          observed: "direct",
        },
      },
    },
    capabilities: [
      { name: "eve-session-events", state: "available" },
      { name: "browser-trace-metadata", state: "missing" },
    ],
    observations: [],
    gaps: [{ owner: "browser", reason: "missing" }],
    bounds: {
      pageLimit: 100,
      pagesRead: 0,
      truncated: false,
      redaction: "allowlist",
    },
    ...overrides,
  };
}

describe("diagnostic command contract", () => {
  it("parses target status without a journey selector and defaults the surface to app", () => {
    expect(parseDiagnosticArgs(["--target", "local", "--status"])).toEqual({
      mode: "target_status",
      target: "local",
      surface: "app",
    });
  });

  it("parses a bounded journey with exactly one selector", () => {
    expect(
      parseDiagnosticArgs(journeyArgs("--session", "ses_synthetic"))
    ).toEqual({
      mode: "journey",
      target: "local",
      surface: "app",
      selector: { kind: "session", value: "ses_synthetic" },
      since,
      until,
    });

    expect(() =>
      parseDiagnosticArgs(
        journeyArgs("--session", "ses_synthetic", "--request", "req_synthetic")
      )
    ).toThrow(/exactly one selector/u);
    expect(() => parseDiagnosticArgs(journeyArgs())).toThrow(
      /exactly one selector/u
    );
  });

  it("requires strict UTC bounds in chronological order for a journey", () => {
    expect(() =>
      parseDiagnosticArgs([
        "--target",
        "local",
        "--session",
        "ses_synthetic",
        "--since",
        "2026-09-12T06:00:00-04:00",
        "--until",
        until,
      ])
    ).toThrow(/UTC/u);
    expect(() =>
      parseDiagnosticArgs([
        "--target",
        "local",
        "--session",
        "ses_synthetic",
        "--since",
        until,
        "--until",
        since,
      ])
    ).toThrow(/positive/u);
    expect(() =>
      parseDiagnosticArgs([
        "--target",
        "local",
        "--session",
        "ses_synthetic",
        "--since",
        "2026-09-11T10:00:00.000Z",
        "--until",
        until,
      ])
    ).toThrow(/positive/u);
    expect(() =>
      parseDiagnosticArgs([
        "--target",
        "local",
        "--session",
        "ses_synthetic",
        "--since",
        since,
      ])
    ).toThrow(/UTC/u);
  });

  it("requires an exact immutable deployment only for preview", () => {
    const preview = parseDiagnosticArgs([
      "--target",
      "preview",
      "--surface",
      "marketing",
      "--deployment",
      "dpl_synthetic_123",
      "--status",
    ]);
    expect(preview).toMatchObject({
      mode: "target_status",
      target: "preview",
      surface: "marketing",
      deploymentId: "dpl_synthetic_123",
    });
    expect(() =>
      parseDiagnosticArgs(["--target", "preview", "--status"])
    ).toThrow(/immutable/u);
    expect(
      parseDiagnosticArgs([
        "--target",
        "preview",
        "--session",
        "ses_synthetic",
        "--deployment",
        "dpl_synthetic_123",
        "--since",
        since,
        "--until",
        until,
      ])
    ).toMatchObject({
      mode: "journey",
      target: "preview",
      deploymentId: "dpl_synthetic_123",
    });
    expect(() =>
      parseDiagnosticArgs([
        "--target",
        "preview",
        "--deployment",
        "latest",
        "--status",
      ])
    ).toThrow(/immutable/u);
    expect(() =>
      parseDiagnosticArgs([
        "--target",
        "production",
        "--deployment",
        "dpl_synthetic_123",
        "--status",
      ])
    ).toThrow(/only valid/u);
  });
});

describe("diagnostic result contract", () => {
  it("uses the same target identity shape for target status and journey results", () => {
    const status = diagnosticResult();
    const journey = diagnosticResult({
      query: {
        mode: "journey",
        target: "preview",
        surface: "app",
        selectorKind: "session",
        selector: "ses_synthetic",
        since,
        until,
        deploymentId: "dpl_synthetic_123",
      },
    });

    const statusJson = parseJson(serializeDiagnosticResult(status));
    const journeyJson = parseJson(serializeDiagnosticResult(journey));
    expect(statusJson.targetIdentity).toEqual(journeyJson.targetIdentity);
    expect(statusJson.targetIdentity.facts.projectId?.status).toBe("observed");
    expect(statusJson.targetIdentity.facts.projectName?.status).toBe(
      "mismatch"
    );
    expect(statusJson.targetIdentity.facts.servedRuntimeSha?.status).toBe(
      "unknown"
    );
  });

  it("keeps pooled and direct database role mismatch and declared/runtime disagreement explicit", () => {
    const result = parseJson(
      serializeDiagnosticResult(
        diagnosticResult({
          targetIdentity: {
            facts: {
              databasePoolRole: {
                status: "mismatch",
                declared: "pooled",
                observed: "direct",
              },
              declaredSourceSha: { status: "observed", value: "sha_declared" },
              servedRuntimeSha: {
                status: "mismatch",
                declared: "sha_declared",
                observed: "sha_served",
              },
            },
          },
        })
      )
    );

    expect(result.targetIdentity.facts.databasePoolRole?.status).toBe(
      "mismatch"
    );
    expect(result.targetIdentity.facts.servedRuntimeSha).toEqual({
      status: "mismatch",
      declared: "sha_declared",
      observed: "sha_served",
    });
  });

  it("allowlists safe metadata and drops secrets, content, and unsafe URLs", () => {
    const result = diagnosticResult({
      targetIdentity: {
        facts: {
          canonicalAuthOrigin: {
            status: "observed",
            value: "https://auth.example.test",
          },
          unsafeUserInfoUrl: {
            status: "observed",
            value: "https://operator:secret@example.test",
          },
          unsafeQueryUrl: {
            status: "observed",
            value: "https://example.test/?token=synthetic-secret",
          },
          unsafeFragmentUrl: {
            status: "observed",
            value: "https://example.test/#private",
          },
          unsafePathUrl: {
            status: "observed",
            value: "https://example.test/private",
          },
          apiToken: { status: "observed", value: "synthetic-secret" },
          message: { status: "observed", value: "synthetic message content" },
          task: { status: "observed", value: "synthetic task content" },
          pageText: { status: "observed", value: "synthetic page content" },
          rawWorkflow: {
            status: "observed",
            value: "synthetic workflow payload",
          },
          providerSendblue: {
            status: "observed",
            value: "configured-not-validated",
          },
          providerSquare: { status: "observed", value: "not-configured" },
          otpProvider: { status: "observed", value: "linq" },
          sendblueConversations: { status: "observed", value: "off" },
          providerPayload: {
            status: "observed",
            value: "synthetic provider response",
          },
          unsafeProviderState: {
            status: "observed",
            value: "raw provider payload",
          },
          otpProviderUnsafe: {
            status: "observed",
            value: "unexpected raw payload",
          },
        },
      },
      observations: [
        {
          owner: "eve",
          kind: "step",
          eventId: "evt_synthetic",
          message: "synthetic response body",
          toolInput: "synthetic-secret",
          pageUrl: "https://example.test/private?session=synthetic-secret",
        },
      ],
    });
    const serialized = serializeDiagnosticResult(result);

    expect(serialized).toContain("https://auth.example.test");
    expect(parseJson(serialized).targetIdentity.facts).toMatchObject({
      providerSendblue: {
        status: "observed",
        value: "configured-not-validated",
      },
      providerSquare: { status: "observed", value: "not-configured" },
      otpProvider: { status: "observed", value: "linq" },
      sendblueConversations: { status: "observed", value: "off" },
    });
    for (const forbidden of [
      "synthetic-secret",
      "synthetic message content",
      "synthetic task content",
      "synthetic page content",
      "synthetic workflow payload",
      "synthetic response body",
      "https://operator:",
      "?token=",
      "#private",
      "/private",
      "synthetic provider response",
      "raw provider payload",
      "unexpected raw payload",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("retains only enumerated provider configuration states", () => {
    const result = parseJson(
      serializeDiagnosticResult(
        diagnosticResult({
          targetIdentity: {
            facts: {
              providerSendblue: {
                status: "observed",
                value: "raw provider payload",
              },
              otpProvider: {
                status: "observed",
                value: "unexpected raw payload",
              },
              sendblueConversations: {
                status: "observed",
                value: "raw mode",
              },
            },
          },
        })
      )
    );

    expect(result.targetIdentity.facts).toMatchObject({
      providerSendblue: { status: "observed" },
      otpProvider: { status: "observed" },
      sendblueConversations: { status: "observed" },
    });
    expect(result.targetIdentity.facts.providerSendblue).not.toHaveProperty(
      "value"
    );
    expect(result.targetIdentity.facts.otpProvider).not.toHaveProperty("value");
    expect(
      result.targetIdentity.facts.sendblueConversations
    ).not.toHaveProperty("value");
  });

  it("retains distinct missing, truncated, and forbidden evidence gaps", () => {
    const serialized = serializeDiagnosticResult(
      diagnosticResult({
        gaps: [
          { owner: "eve", reason: "missing" },
          { owner: "browser", reason: "truncated" },
          { owner: "deployment", reason: "forbidden" },
        ],
        bounds: {
          pageLimit: 100,
          pagesRead: 100,
          truncated: true,
          redaction: "allowlist",
        },
      })
    );
    const result = parseJson(serialized);

    expect(result.gaps.map((gap: { reason: string }) => gap.reason)).toEqual([
      "missing",
      "truncated",
      "forbidden",
    ]);
    expect(result.bounds.truncated).toBe(true);
  });

  it("does not upgrade uncertain delivery to accepted or recipient receipt", () => {
    const serialized = serializeDiagnosticResult(
      diagnosticResult({
        observations: [
          {
            owner: "completion-report",
            kind: "delivery",
            delivery: "uncertain",
            ref: "part_synthetic",
          },
        ],
      })
    );
    const result = parseJson(serialized);

    expect(result.observations[0]?.delivery).toBe("uncertain");
    expect(result.observations[0]?.delivery).not.toBe("accepted");
    expect(result.observations[0]).not.toHaveProperty("recipientReceipt");
  });
});

function parseJson(value: string) {
  return serializedResultSchema.parse(JSON.parse(value));
}

const serializedResultSchema = z.object({
  targetIdentity: z.object({
    facts: z.record(z.string(), z.object({ status: z.string() }).loose()),
  }),
  observations: z.array(z.record(z.string(), z.string())),
  gaps: z.array(z.object({ owner: z.string(), reason: z.string() })),
  bounds: z.object({ truncated: z.boolean() }).loose(),
});
