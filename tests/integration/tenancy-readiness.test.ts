import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import * as schema from "../../db/schema";

const databases: PGlite[] = [];

afterEach(async () => {
  resetDatabaseForIntegrationTest();
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("tenancy readiness inventory", () => {
  it("reports only aggregate owner, agent, binding, and installation counts", async () => {
    const database = new PGlite();
    databases.push(database);
    await applyAllMigrations(database);
    await database.exec(`
      INSERT INTO workspaces (id, created_at) VALUES
        ('workspace-good', '2026-01-01'),
        ('workspace-missing-owner', '2026-01-01'),
        ('workspace-revoked-owner', '2026-01-01'),
        ('workspace-ambiguous', '2026-01-01'),
        ('workspace-stale', '2026-01-01');
      INSERT INTO workspace_memberships (workspace_id, user_id, role, status, created_at) VALUES
        ('workspace-good', 'good-owner', 'owner', 'active', '2026-01-01'),
        ('workspace-revoked-owner', 'revoked-owner', 'owner', 'revoked', '2026-01-01'),
        ('workspace-ambiguous', 'ambiguous-owner-a', 'owner', 'active', '2026-01-01'),
        ('workspace-ambiguous', 'ambiguous-owner-b', 'owner', 'active', '2026-01-01'),
        ('workspace-stale', 'stale-owner', 'owner', 'active', '2026-01-01');
      INSERT INTO agents (id, workspace_id, slug, status, created_at, updated_at) VALUES
        ('agent-good', 'workspace-good', 'good', 'draft', '2026-01-01', '2026-01-01'),
        ('agent-stale', 'workspace-stale', 'stale', 'draft', '2026-01-01', '2026-01-01'),
        ('agent-ambiguous-a', 'workspace-ambiguous', 'ambiguous-a', 'draft', '2026-01-01', '2026-01-01'),
        ('agent-ambiguous-b', 'workspace-ambiguous', 'ambiguous-b', 'draft', '2026-01-01', '2026-01-01');
      INSERT INTO agent_revisions (id, workspace_id, agent_id, revision_number, manifest, content_digest, created_by_user_id, created_at) VALUES
        ('revision-good', 'workspace-good', 'agent-good', 1, '{"version":1,"instructions":"Good","capabilities":[]}', 'digest-good', 'good-owner', '2026-01-01'),
        ('revision-stale', 'workspace-stale', 'agent-stale', 1, '{"version":1,"instructions":"Stale","capabilities":[]}', 'digest-stale', 'stale-owner', '2026-01-01'),
        ('revision-ambiguous-a', 'workspace-ambiguous', 'agent-ambiguous-a', 1, '{"version":1,"instructions":"A","capabilities":[]}', 'digest-a', 'ambiguous-owner-a', '2026-01-01'),
        ('revision-ambiguous-b', 'workspace-ambiguous', 'agent-ambiguous-b', 1, '{"version":1,"instructions":"B","capabilities":[]}', 'digest-b', 'ambiguous-owner-b', '2026-01-01');
      UPDATE agents SET status = 'active', active_revision_id = CASE id
        WHEN 'agent-good' THEN 'revision-good'
        WHEN 'agent-stale' THEN 'revision-stale'
        WHEN 'agent-ambiguous-a' THEN 'revision-ambiguous-a'
        WHEN 'agent-ambiguous-b' THEN 'revision-ambiguous-b'
      END;
      INSERT INTO platform_lines (id, provider, provider_line_id, status, created_at, updated_at)
      VALUES ('line-stale', 'linq', '+12025550123', 'active', '2026-01-01', '2026-01-01');
      INSERT INTO channel_conversations (
        id, provider, provider_account_id, provider_conversation_id,
        platform_line_id, workspace_id, agent_id, pinned_revision_id,
        status, created_at, updated_at
      ) VALUES (
        'binding-stale', 'linq', 'linq/test', 'conversation-stale',
        'line-stale', 'workspace-stale', 'agent-stale', 'revision-stale',
        'active', '2026-01-01', '2026-01-01'
      );
      INSERT INTO connection_installations (
        id, workspace_id, provider, connector_id, authorization_subject,
        status, created_at, updated_at, revoked_at
      ) VALUES (
        'installation-stale', 'workspace-stale', 'google', 'google/test',
        'subject-stale', 'active', '2026-01-01', '2026-01-01', NULL
      );
      UPDATE workspaces SET lifecycle_state = 'suspended'
      WHERE id = 'workspace-stale';
    `);
    setDatabaseForIntegrationTest(drizzle(database, { schema }));

    const { getTenancyReadiness } =
      await import("@/db/services/tenancy-readiness");
    const report = await getTenancyReadiness();

    expect(report).toEqual({
      agents: { multipleActive: 1, zeroActive: 2 },
      owners: {
        ambiguous: 1,
        missing: 1,
        revoked: 1,
        total: 5,
      },
      staleBindings: 1,
      staleInstallations: 1,
    });
    expect(JSON.stringify(report)).not.toMatch(
      /workspace-|agent-|revision-|binding-|installation-/
    );
  });
});

async function applyAllMigrations(database: PGlite) {
  const names = (
    await readdir(new URL("../../db/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  for (const migrationName of names) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Migrations must execute in committed order.
    const migration = await readFile(
      new URL(`../../db/migrations/${migrationName}`, import.meta.url),
      "utf8"
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Migrations must execute in committed order.
        await database.exec(statement);
      }
    }
  }
}
