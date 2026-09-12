import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProductionOperations,
  type ProductionOwner,
  type ProductionTargetRead,
} from "../../scripts/production/operations.ts";
import { parseArguments } from "../../scripts/production/cli.ts";

const directories: string[] = [];
type Reader = (input: {
  readonly target: string;
  readonly surface: string;
  readonly deploymentId?: string;
}) => Promise<ProductionTargetRead>;
type ObserveRelease = ProductionOwner["observeGitRelease"];
type Rollback = ProductionOwner["rollback"];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await (
        await import("node:fs/promises")
      ).rm(directory, {
        force: true,
        recursive: true,
      });
    })
  );
});

describe("production operations", () => {
  it("requires a target and treats app as the default surface", () => {
    expect(parseArguments(["status", "--target", "production"])).toMatchObject({
      command: "status",
      target: "production",
      surface: "app",
    });
    expect(
      parseArguments([
        "status",
        "--target",
        "production",
        "--surface",
        "marketing",
      ])
    ).toMatchObject({
      surface: "marketing",
    });
    expect(() => parseArguments(["status", "--target", "preview"])).toThrow(
      "Preview requires --deployment"
    );
    expect(() =>
      parseArguments(["plan", "provision", "--target", "production"])
    ).toThrow("require their owning reviewed runbooks");
    expect(() =>
      parseArguments([
        "status",
        "--target",
        "production",
        "--ignored-option",
        "value",
      ])
    ).toThrow("Invalid production operation arguments");
  });

  it("reports a stale project display name without writing or normalizing it", async () => {
    const reader = vi.fn<Reader>(async () =>
      targetRead({ projectName: fact("mismatch", "open-instinct") })
    );
    const owner = ownerStub();
    const operations = await fixture({ reader, owner });

    const result = await operations.status({
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
    });

    expect(reader).toHaveBeenCalledWith({
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
    });
    expect(owner.observeGitRelease).not.toHaveBeenCalled();
    expect(owner.rollback).not.toHaveBeenCalled();
    expect(result.state).toBe("blocked");
    expect(result.gaps).toContain("projectName:mismatch");
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("plans a Git-connected release without deploying", async () => {
    const reader = vi.fn<Reader>(async () => targetRead());
    const owner = ownerStub();
    const operations = await fixture({ reader, owner });

    const plan = await operations.plan({
      operation: "release",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    expect(plan.operation).toBe("release");
    expect(plan.target.projectId).toBe("prj_GIIYS7WKKuY0400OCVVFntPw1H0r");
    expect(plan.expiresAt).toBe("2026-09-12T12:05:00.000Z");
    expect(owner.observeGitRelease).not.toHaveBeenCalled();
    expect(owner.rollback).not.toHaveBeenCalled();
  });

  it("reports an unmapped marketing surface without reading or writing app metadata", async () => {
    const reader = vi.fn<Reader>(async () => targetRead());
    const owner = ownerStub();
    const operations = await fixture({ reader, owner });

    const status = await operations.status({
      target: "production",
      surface: "marketing",
    });

    expect(status).toMatchObject({
      state: "partial",
      gaps: ["inventory:missing"],
      target: { target: "production", surface: "marketing" },
    });
    expect(reader).not.toHaveBeenCalled();
    expect(owner.observeGitRelease).not.toHaveBeenCalled();
    expect(owner.rollback).not.toHaveBeenCalled();
  });

  it("blocks a release when the exact planned target drifts before observation", async () => {
    let drifted = false;
    const reader = vi.fn<Reader>(async (input) =>
      targetRead(
        drifted && input.deploymentId !== undefined
          ? {
              projectId: fact("mismatch", "prj_other"),
            }
          : {}
      )
    );
    const owner = ownerStub();
    const operations = await fixture({ reader, owner });
    const plan = await operations.plan({
      operation: "release",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    drifted = true;
    await expect(operations.apply(plan)).rejects.toMatchObject({
      code: "TARGET_UNRESOLVED",
    });
    expect(owner.observeGitRelease).not.toHaveBeenCalled();
  });

  it("requires the production alias to still select the planned deployment before release observation", async () => {
    let aliasDeployment = "dpl_current";
    const reader = vi.fn<Reader>(async (input) => {
      if (input.deploymentId === undefined) {
        return targetRead({
          canonicalAliasOrigin: fact(
            "observed",
            "https://open-instinct-ashy.vercel.app"
          ),
          currentDeploymentId: fact("observed", aliasDeployment),
        });
      }
      return targetRead({
        deploymentId: fact("observed", input.deploymentId),
      });
    });
    const owner = ownerStub();
    const operations = await fixture({ reader, owner });
    const plan = await operations.plan({
      operation: "release",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    aliasDeployment = "dpl_other";
    await expect(operations.apply(plan)).rejects.toMatchObject({
      code: "TARGET_UNRESOLVED",
    });
    expect(owner.observeGitRelease).not.toHaveBeenCalled();
  });

  it("plans a preview release from its exact immutable deployment without a production alias", async () => {
    const reader = vi.fn<Reader>(async (input) =>
      targetRead({
        deploymentId: fact("observed", input.deploymentId ?? "dpl_preview"),
        environment: fact("observed", "preview"),
        canonicalAuthOrigin: fact("unknown"),
        immutableDeploymentOrigin: fact(
          "observed",
          "https://preview-abc.vercel.app"
        ),
      })
    );
    const owner = ownerStub();
    const operations = await fixture({ reader, owner });

    const plan = await operations.plan({
      operation: "release",
      target: "preview",
      surface: "app",
      deploymentId: "dpl_preview",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    expect(plan.current.deploymentId).toBe("dpl_preview");
    expect(owner.observeGitRelease).not.toHaveBeenCalled();
  });

  it("records Git release observation without issuing a direct deploy", async () => {
    const reader = vi.fn<Reader>(async () => targetRead());
    const owner = ownerStub();
    owner.observeGitRelease.mockResolvedValue({
      deploymentId: "dpl_new",
      state: "ready",
    });
    const operations = await fixture({ reader, owner });
    const plan = await operations.plan({
      operation: "release",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    const receipt = await operations.apply(plan);

    const [releaseInput] = owner.observeGitRelease.mock.calls[0] ?? [];
    expect(releaseInput?.target.projectId).toBe(
      "prj_GIIYS7WKKuY0400OCVVFntPw1H0r"
    );
    expect(owner.rollback).not.toHaveBeenCalled();
    expect(reader).toHaveBeenCalledTimes(4);
    expect(receipt.state).toBe("attempting");
    expect(receipt.handle).toBe("dpl_new");
  });

  it("freshly verifies a pending release without replaying its owner operation", async () => {
    let aliasDeployment = "dpl_current";
    const reader = vi.fn<Reader>(async (input) =>
      targetRead({
        deploymentId: fact("observed", input.deploymentId ?? "dpl_current"),
        currentDeploymentId: fact("observed", aliasDeployment),
      })
    );
    const owner = ownerStub();
    owner.observeGitRelease.mockResolvedValue({
      deploymentId: "dpl_new",
      state: "pending",
    });
    const operations = await fixture({ reader, owner });
    const plan = await operations.plan({
      operation: "release",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    expect((await operations.apply(plan)).state).toBe("attempting");
    aliasDeployment = "dpl_new";
    const receipt = await operations.verify(plan, "dpl_new");

    expect(receipt).toMatchObject({ state: "completed", handle: "dpl_new" });
    expect(owner.observeGitRelease).toHaveBeenCalledTimes(1);
  });

  it("keeps an unknown post-write outcome uncertain and forbids replay", async () => {
    const reader = vi.fn<Reader>(async () => targetRead());
    const owner = ownerStub();
    owner.observeGitRelease.mockResolvedValue({
      deploymentId: "dpl_unknown",
      state: "timeout",
    });
    const operations = await fixture({ reader, owner });
    const plan = await operations.plan({
      operation: "release",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    const receipt = await operations.apply(plan);

    expect(receipt.state).toBe("uncertain");
    await expect(operations.apply(plan)).rejects.toMatchObject({
      code: "UNCERTAIN_REPLAY",
    });
    expect(owner.observeGitRelease).toHaveBeenCalledTimes(1);
  });

  it("records a ready release observation as attempting until separate verification", async () => {
    const reader = vi.fn<Reader>(async () => targetRead());
    const owner = ownerStub();
    owner.observeGitRelease.mockResolvedValue({
      deploymentId: "dpl_post",
      state: "ready",
    });
    const operations = await fixture({ reader, owner });
    const plan = await operations.plan({
      operation: "release",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    const receipt = await operations.apply(plan);

    expect(receipt).toMatchObject({ state: "attempting" });
    expect(owner.observeGitRelease).toHaveBeenCalledTimes(1);
  });

  it("persists an uncertain receipt when an owner fails after a possible write", async () => {
    const reader = vi.fn<Reader>(async () => targetRead());
    const owner = ownerStub();
    owner.observeGitRelease.mockRejectedValue(
      new Error("transport stopped after submission")
    );
    const operations = await fixture({ reader, owner });
    const plan = await operations.plan({
      operation: "release",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    const receipt = await operations.apply(plan);

    expect(receipt).toMatchObject({
      state: "uncertain",
      reason: "owner:unknown",
    });
    await expect(operations.apply(plan)).rejects.toMatchObject({
      code: "UNCERTAIN_REPLAY",
    });
    expect(owner.observeGitRelease).toHaveBeenCalledTimes(1);
  });

  it("rejects expired plans and a conflicting local operation lock before owner calls", async () => {
    const reader = vi.fn<Reader>(async () => targetRead());
    const owner = ownerStub();
    let instant = "2026-09-12T12:00:00.000Z";
    const operations = await fixture({
      reader,
      owner,
      now: () => new Date(instant),
    });
    const plan = await operations.plan({
      operation: "release",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      expectedSourceSha: "7875a08348adf2d567120e7e7f3d803b101aa45a",
    });

    // A valid plan expires when the operator clock advances; changing the plan
    // file itself must instead fail its fingerprint check.
    instant = "2026-09-12T12:06:00.000Z";
    await expect(operations.apply(plan)).rejects.toMatchObject({
      code: "PLAN_EXPIRED",
    });
    instant = "2026-09-12T12:00:00.000Z";
    let resolveObservation:
      | ((value: { deploymentId: string; state: "ready" }) => void)
      | undefined;
    owner.observeGitRelease.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveObservation = resolve;
        })
    );
    const first = operations.apply(plan);
    await vi.waitFor(() => {
      expect(owner.observeGitRelease).toHaveBeenCalledTimes(1);
    });
    await expect(operations.apply(plan)).rejects.toMatchObject({
      code: "LOCKED",
    });
    resolveObservation?.({ deploymentId: "dpl_lock", state: "ready" });
    await first;
  });

  it("blocks rollback when compatibility is unknown or false", async () => {
    const reader = vi.fn<Reader>(async () =>
      targetRead({ rollbackCompatibility: fact("unknown") })
    );
    const owner = ownerStub();
    const operations = await fixture({ reader, owner });

    await expect(
      operations.plan({
        operation: "rollback",
        target: "production",
        surface: "app",
        deploymentId: "dpl_current",
        knownGoodDeploymentId: "dpl_good",
      })
    ).rejects.toMatchObject({ code: "TARGET_UNRESOLVED" });
    expect(owner.rollback).not.toHaveBeenCalled();
  });

  it("uses the supported rollback owner only for a compatible known-good deployment", async () => {
    const reader = vi.fn<Reader>(async (input) =>
      targetRead({
        deploymentId: fact("observed", input.deploymentId ?? "dpl_current"),
      })
    );
    const owner = ownerStub();
    owner.rollback.mockResolvedValue({
      deploymentId: "dpl_good",
      state: "ready",
    });
    const operations = await fixture({ reader, owner });
    const plan = await operations.plan({
      operation: "rollback",
      target: "production",
      surface: "app",
      deploymentId: "dpl_current",
      knownGoodDeploymentId: "dpl_good",
    });

    const receipt = await operations.apply(plan);

    const [rollbackInput] = owner.rollback.mock.calls[0] ?? [];
    expect(rollbackInput).toMatchObject({
      deploymentId: "dpl_good",
      target: { projectId: "prj_GIIYS7WKKuY0400OCVVFntPw1H0r" },
    });
    expect(receipt.state).toBe("attempting");
    expect(receipt.handle).toBe("dpl_good");
  });
});

async function fixture({
  reader,
  owner,
  now,
}: {
  readonly reader: Reader;
  readonly owner: ReturnType<typeof ownerStub>;
  readonly now?: () => Date;
}) {
  const receiptDirectory = await mkdtemp(
    join(tmpdir(), "open-instinct-production-operations-")
  );
  directories.push(receiptDirectory);
  return createProductionOperations({
    inventoryPath: join(process.cwd(), "config", "production-targets.json"),
    readTarget: reader,
    owner,
    now: now ?? (() => new Date("2026-09-12T12:00:00.000Z")),
    receiptDirectory,
  });
}

function ownerStub() {
  return {
    observeGitRelease: vi.fn<ObserveRelease>(),
    rollback: vi.fn<Rollback>(),
  };
}

function targetRead(
  overrides: Record<string, ProductionTargetRead["facts"][string]> = {}
): ProductionTargetRead {
  return {
    capturedAt: "2026-09-12T12:00:00.000Z",
    target: "production",
    surface: "app",
    deploymentId: "dpl_current",
    capabilities: [],
    gaps: [],
    facts: {
      projectId: fact("observed", "prj_GIIYS7WKKuY0400OCVVFntPw1H0r"),
      teamId: fact("observed", "team_cwyLpng8LCwWgINdiQ27hHYa"),
      environment: fact("observed", "production"),
      projectName: fact("observed", "jory"),
      canonicalAliasOrigin: fact(
        "observed",
        "https://open-instinct-ashy.vercel.app"
      ),
      deploymentId: fact("observed", "dpl_current"),
      currentDeploymentId: fact("observed", "dpl_current"),
      immutableDeploymentOrigin: fact(
        "observed",
        "https://jory-immutable.vercel.app"
      ),
      declaredSourceSha: fact(
        "observed",
        "7875a08348adf2d567120e7e7f3d803b101aa45a"
      ),
      schemaVersion: fact("observed", "schema-v1"),
      configVersion: fact("observed", "config-v1"),
      databaseLogicalIdentity: fact("observed", "database-v1"),
      rollbackCompatibility: fact("observed", true),
      ...overrides,
    },
  };
}

function fact(
  status: "observed" | "unknown" | "mismatch",
  value?: string | boolean
) {
  return value === undefined ? { status } : { status, value };
}
