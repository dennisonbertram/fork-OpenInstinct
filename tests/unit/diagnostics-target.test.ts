import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  projectVercelMetadataJson,
  readTarget,
} from "../../scripts/diagnostics/read-target";

const roots: string[] = [];

interface VercelFixture {
  readonly accountId?: string;
  readonly alias?: string;
  readonly id?: string;
  readonly name?: string;
  readonly deploymentId?: string;
  readonly projectId?: string;
  readonly teamId?: string;
  readonly target?: string | null;
  readonly readyState?: string;
  readonly url?: string;
  readonly meta?: { readonly githubCommitSha?: string };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true }))
  );
});

describe("Vercel target metadata reader", () => {
  it("accepts the project endpoint's object alias without rejecting its safe projection", async () => {
    expect(
      projectVercelMetadataJson(
        "/v9/projects/prj_synthetic",
        JSON.stringify({
          id: "prj_synthetic",
          accountId: "team_synthetic",
          name: "jory",
          alias: { configured: "not-projected" },
        })
      )
    ).toEqual({
      id: "prj_synthetic",
      accountId: "team_synthetic",
      name: "jory",
    });
    const root = await fixtureRoot();
    const api = vi.fn<(endpoint: string) => Promise<VercelFixture>>(
      async (endpoint) => {
        if (endpoint === "/v9/projects/prj_synthetic")
          return {
            id: "prj_synthetic",
            accountId: "team_synthetic",
            name: "jory",
          };
        if (endpoint === "/v4/aliases/app.example.test")
          return {
            alias: "app.example.test",
            deploymentId: "dpl_immutable_synthetic",
          };
        if (endpoint === "/v13/deployments/dpl_immutable_synthetic")
          return {
            id: "dpl_immutable_synthetic",
            projectId: "prj_synthetic",
            teamId: "team_synthetic",
            target: "production",
          };
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      }
    );

    const result = await readTarget(
      { target: "production", surface: "app" },
      { root, vercelApi: api }
    );

    expect(result.facts.projectId).toEqual({
      status: "observed",
      value: "prj_synthetic",
    });
    expect(result.facts.teamId).toEqual({
      status: "observed",
      value: "team_synthetic",
    });
  });

  it("resolves production through its configured canonical alias to one immutable deployment", async () => {
    const root = await fixtureRoot();
    const api = vi.fn<(endpoint: string) => Promise<VercelFixture>>(
      async (endpoint) => {
        if (endpoint === "/v9/projects/prj_synthetic")
          return {
            id: "prj_synthetic",
            accountId: "team_synthetic",
            name: "jory",
          };
        if (endpoint === "/v4/aliases/app.example.test")
          return {
            alias: "app.example.test",
            deploymentId: "dpl_immutable_synthetic",
          };
        if (endpoint === "/v13/deployments/dpl_immutable_synthetic")
          return {
            id: "dpl_immutable_synthetic",
            projectId: "prj_synthetic",
            teamId: "team_synthetic",
            target: "production",
            readyState: "READY",
            url: "dpl-immutable.example.test",
            meta: { githubCommitSha: "abcdef0123456789" },
          };
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      }
    );

    const result = await readTarget(
      { target: "production", surface: "app" },
      { root, vercelApi: api }
    );

    expect(api.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      "/v9/projects/prj_synthetic",
      "/v4/aliases/app.example.test",
      "/v13/deployments/dpl_immutable_synthetic",
    ]);
    expect(result.facts).toMatchObject({
      declaredProjectId: { status: "observed", value: "prj_synthetic" },
      projectId: { status: "observed", value: "prj_synthetic" },
      teamId: { status: "observed", value: "team_synthetic" },
      environment: { status: "observed", value: "production" },
      deploymentId: { status: "observed", value: "dpl_immutable_synthetic" },
      canonicalAliasOrigin: {
        status: "observed",
        value: "https://app.example.test",
      },
      immutableDeploymentOrigin: {
        status: "observed",
        value: "https://dpl-immutable.example.test",
      },
      declaredSourceSha: { status: "observed", value: "abcdef0123456789" },
    });
    expect(result.facts.schemaVersion).toEqual({ status: "unknown" });
    expect(result.facts.rollbackCompatibility).toEqual({ status: "unknown" });
  });

  it("keeps configured values declared when Vercel metadata proves a mismatch", async () => {
    const root = await fixtureRoot();
    const api = vi.fn<(endpoint: string) => Promise<VercelFixture>>(
      async (endpoint) => {
        if (endpoint === "/v9/projects/prj_synthetic")
          return {
            id: "prj_other",
            accountId: "team_other",
            name: "open-instinct",
          };
        if (endpoint === "/v4/aliases/app.example.test")
          return {
            alias: "app.example.test",
            deploymentId: "dpl_immutable_synthetic",
          };
        if (endpoint === "/v13/deployments/dpl_immutable_synthetic")
          return {
            id: "dpl_immutable_synthetic",
            projectId: "prj_other",
            teamId: "team_other",
            target: "preview",
          };
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      }
    );

    const result = await readTarget(
      { target: "production", surface: "app" },
      { root, vercelApi: api }
    );

    expect(result.facts.declaredProjectId).toEqual({
      status: "observed",
      value: "prj_synthetic",
    });
    expect(result.facts.projectId).toEqual({
      status: "mismatch",
      declared: "prj_synthetic",
      observed: "prj_other",
    });
    expect(result.facts.projectName).toEqual({
      status: "mismatch",
      declared: "jory",
      observed: "open-instinct",
    });
    expect(result.facts.deploymentProjectId).toEqual({
      status: "mismatch",
      declared: "prj_synthetic",
      observed: "prj_other",
    });
    expect(result.facts.teamId).toEqual({
      status: "mismatch",
      declared: "team_synthetic",
      observed: "team_other",
    });
    expect(result.facts.environment).toEqual({
      status: "mismatch",
      declared: "production",
      observed: "preview",
    });
  });

  it("retains a project-account mismatch when deployment team metadata happens to match", async () => {
    const root = await fixtureRoot();
    const api = vi.fn<(endpoint: string) => Promise<VercelFixture>>(
      async (endpoint) => {
        if (endpoint === "/v9/projects/prj_synthetic")
          return {
            id: "prj_synthetic",
            accountId: "team_other",
            name: "jory",
          };
        if (endpoint === "/v4/aliases/app.example.test")
          return {
            alias: "app.example.test",
            deploymentId: "dpl_immutable_synthetic",
          };
        if (endpoint === "/v13/deployments/dpl_immutable_synthetic")
          return {
            id: "dpl_immutable_synthetic",
            projectId: "prj_synthetic",
            teamId: "team_synthetic",
            target: "production",
          };
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      }
    );

    const result = await readTarget(
      { target: "production", surface: "app" },
      { root, vercelApi: api }
    );

    expect(result.facts.teamId).toEqual({
      status: "mismatch",
      declared: "team_synthetic",
      observed: "team_other",
    });
    expect(result.facts.deploymentTeamId).toEqual({
      status: "observed",
      value: "team_synthetic",
    });
  });

  it("treats Vercel's null deployment target as preview only for an exact preview read", async () => {
    const root = await fixtureRoot("preview");
    const api = vi.fn<(endpoint: string) => Promise<VercelFixture>>(
      async (endpoint) => {
        if (endpoint === "/v9/projects/prj_synthetic")
          return {
            id: "prj_synthetic",
            accountId: "team_synthetic",
            name: "jory",
          };
        if (endpoint === "/v13/deployments/dpl_preview_synthetic")
          return {
            id: "dpl_preview_synthetic",
            projectId: "prj_synthetic",
            teamId: "team_synthetic",
            target: null,
            readyState: "READY",
            url: "jory-immutable.example.test",
            meta: {
              githubCommitSha: "bc2b8075c594d9116352c357f7f9867cdefd0e4c",
            },
          };
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      }
    );

    const result = await readTarget(
      {
        target: "preview",
        surface: "app",
        deploymentId: "dpl_preview_synthetic",
      },
      { root, vercelApi: api }
    );

    expect(result.facts.environment).toEqual({
      status: "observed",
      value: "preview",
    });
    expect(result.facts.deploymentState).toEqual({
      status: "observed",
      value: "READY",
    });
    expect(result.facts.declaredSourceSha).toEqual({
      status: "observed",
      value: "bc2b8075c594d9116352c357f7f9867cdefd0e4c",
    });
  });

  it("reports a malformed local run record as an incomplete reader gap", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, ".eve", "dev-runs"), { recursive: true });
    await writeFile(
      join(root, ".eve", "dev-runs", "run-malformed.json"),
      "{not-json}"
    );

    const result = await readTarget(
      { target: "local", surface: "app" },
      { root }
    );

    expect(result.capabilities).toEqual([
      { name: "local_metadata", state: "unavailable" },
    ]);
    expect(result.gaps).toEqual([
      { owner: "local_metadata", reason: "unavailable" },
    ]);
    expect(result.facts.environment).toEqual({
      status: "observed",
      value: "local",
    });
  });
});

async function fixtureRoot(target = "production") {
  const root = await mkdtemp(join(tmpdir(), "diagnostics-target-"));
  roots.push(root);
  await mkdir(join(root, "config"));
  const targetRecord = {
    surface: "app",
    target,
    projectId: "prj_synthetic",
    teamId: "team_synthetic",
    projectName: "jory",
    canonicalOrigin: "https://app.example.test",
  };
  await writeFile(
    join(root, "config", "production-targets.json"),
    JSON.stringify({
      schemaVersion: 1,
      targets: [targetRecord],
    })
  );
  return root;
}
