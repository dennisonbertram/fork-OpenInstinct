import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it } from "vitest";
import {
  resetDatabaseForIntegrationTest,
  setDatabaseForIntegrationTest,
} from "@/db";
import type { AccessScope } from "@/lib/access-scope";
import { readOperationsJourney } from "@/lib/operations/journey";
import * as schema from "../../db/schema";

const databaseInstances: PGlite[] = [];
const scope = {
  userId: "user:diagnostics-synthetic",
  workspaceId: "workspace:diagnostics-synthetic",
} satisfies AccessScope;
const foreignScope = {
  userId: "user:diagnostics-foreign",
  workspaceId: "workspace:diagnostics-foreign",
} satisfies AccessScope;
const rootSessionId = "ses_diagnostics_synthetic_root";
const foreignSessionId = "ses_diagnostics_foreign_root";
const sinceUtc = "2026-09-12T10:00:00.000Z";
const untilUtc = "2026-09-12T11:00:00.000Z";

afterEach(async () => {
  resetDatabaseForIntegrationTest();
  await Promise.all(
    databaseInstances.splice(0).map((database) => database.close())
  );
});

describe("scoped operations journey projection", () => {
  it("joins safe browser, report, and scheduled metadata while omitting raw content", async () => {
    const database = await createDatabase();
    await seedWorkspace(database, scope);
    await seedSession(database, scope, rootSessionId);
    await database.exec(`
      INSERT INTO browser_sessions (
        session_id, workspace_id, created_by_user_id, created_at, worker_session_id
      ) VALUES (
        'browser_synthetic', '${scope.workspaceId}', '${scope.userId}',
        '${sinceUtc}', '${rootSessionId}'
      );
      INSERT INTO browser_traces (
        session_id, workspace_id, created_by_user_id, task, status,
        result_message, started_at, completed_at, duration_ms
      ) VALUES (
        '${rootSessionId}', '${scope.workspaceId}', '${scope.userId}',
        'PRIVATE_TASK_CANARY', 'success', 'PRIVATE_RESULT_CANARY',
        '${sinceUtc}', '${untilUtc}', 60000
      );
      INSERT INTO browser_trace_events (id, trace_session_id, at, type, label, detail)
      VALUES ('evt_synthetic', '${rootSessionId}', '${untilUtc}', 'step',
        'PRIVATE_LABEL_CANARY', 'PRIVATE_EVENT_CANARY');
      INSERT INTO completion_report_attempts (
        id, workspace_id, root_session_id, channel, conversation_id, cohort_id,
        report_revision, part, state, content_digest, provider_handle, lease_owner,
        lease_expires_at, created_at, updated_at
      ) VALUES (
        'report_synthetic', '${scope.workspaceId}', '${rootSessionId}', 'synthetic',
        'conversation_synthetic', 'cohort_synthetic', 0, 'text', 'unconfirmed',
        'digest_synthetic', 'handle_synthetic', 'lease_synthetic', '${untilUtc}',
        '${untilUtc}', '${untilUtc}'
      );
      INSERT INTO scheduled_agent_jobs (
        id, workspace_id, created_by_user_id, prompt, conversation_channel,
        conversation_id, timing, missed_run_policy, status, created_at, updated_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000001', '${scope.workspaceId}', '${scope.userId}',
        'PRIVATE_SCHEDULE_PROMPT_CANARY', 'eve', 'conversation_synthetic',
        '{"kind":"once","at":"2026-09-12T10:30:00.000Z"}', 'skip', 'completed',
        '${sinceUtc}', '${untilUtc}'
      );
      INSERT INTO scheduled_agent_runs (
        id, job_id, scheduled_for, status, worker_session_id, outcome, report_status,
        last_error, created_at, updated_at
      ) VALUES (
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000001', '${sinceUtc}', 'completed',
        '${rootSessionId}', '{"summary":"PRIVATE_RUN_OUTCOME_CANARY"}', 'delivered',
        'PRIVATE_SCHEDULE_ERROR_CANARY', '${untilUtc}', '${untilUtc}'
      );
    `);
    setDatabaseForIntegrationTest(drizzle(database, { schema }));

    const result = await readOperationsJourney(scope, {
      sessionId: rootSessionId,
      sinceUtc,
      untilUtc,
    });

    expect(result.query).toMatchObject({
      sessionId: rootSessionId,
      sinceUtc,
      untilUtc,
    });
    expect(result.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: "browser" }),
        expect.objectContaining({
          owner: "completion-report",
          delivery: "uncertain",
        }),
        expect.objectContaining({ owner: "schedule" }),
      ])
    );
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: "eve", reason: "cannot_determine" }),
      ])
    );
    const serialized = JSON.stringify(result);
    for (const canary of [
      "PRIVATE_TASK_CANARY",
      "PRIVATE_RESULT_CANARY",
      "PRIVATE_LABEL_CANARY",
      "PRIVATE_EVENT_CANARY",
      "PRIVATE_SCHEDULE_PROMPT_CANARY",
      "PRIVATE_RUN_OUTCOME_CANARY",
      "PRIVATE_SCHEDULE_ERROR_CANARY",
    ]) {
      expect(serialized).not.toContain(canary);
    }
    expect(serialized).not.toMatch(/did_not_run|did not run/i);
  });

  it("does not disclose whether an absent or foreign root session exists", async () => {
    const database = await createDatabase();
    await seedWorkspace(database, scope);
    await seedWorkspace(database, foreignScope);
    await seedSession(database, foreignScope, foreignSessionId);
    setDatabaseForIntegrationTest(drizzle(database, { schema }));

    const absent = await readOperationsJourney(scope, {
      sessionId: "ses_diagnostics_absent_root",
      sinceUtc,
      untilUtc,
    });
    const foreign = await readOperationsJourney(scope, {
      sessionId: foreignSessionId,
      sinceUtc,
      untilUtc,
    });

    expect(absent.status).toBe("incomplete");
    expect(foreign.status).toBe(absent.status);
    expect(foreign.observations).toEqual(absent.observations);
    expect(foreign.gaps).toEqual(absent.gaps);
    expect(foreign.bounds).toEqual(absent.bounds);
    expect(absent.observations).toEqual([]);
    expect(absent.gaps).toEqual([
      expect.objectContaining({ owner: "session", reason: "missing" }),
    ]);
  });

  it("returns explicit owner gaps for an owned session with no matching evidence", async () => {
    const database = await createDatabase();
    await seedWorkspace(database, scope);
    await seedSession(database, scope, rootSessionId);
    setDatabaseForIntegrationTest(drizzle(database, { schema }));

    const result = await readOperationsJourney(scope, {
      sessionId: rootSessionId,
      sinceUtc,
      untilUtc,
    });

    expect(result.status).not.toBe("complete");
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toMatch(/did_not_run|did not run/i);
  });

  it("rejects non-UTC, reversed, and over-24-hour windows", async () => {
    const database = await createDatabase();
    await seedWorkspace(database, scope);
    await seedSession(database, scope, rootSessionId);
    setDatabaseForIntegrationTest(drizzle(database, { schema }));

    await expect(
      readOperationsJourney(scope, {
        sessionId: rootSessionId,
        sinceUtc: "2026-09-12T06:00:00-04:00",
        untilUtc,
      })
    ).rejects.toThrow("UTC is required.");
    await expect(
      readOperationsJourney(scope, {
        sessionId: rootSessionId,
        sinceUtc: untilUtc,
        untilUtc: sinceUtc,
      })
    ).rejects.toThrow(
      "Journey window must be positive and no longer than 24 hours."
    );
    await expect(
      readOperationsJourney(scope, {
        sessionId: rootSessionId,
        sinceUtc: "2026-09-11T10:00:00.000Z",
        untilUtc,
      })
    ).rejects.toThrow(
      "Journey window must be positive and no longer than 24 hours."
    );
  });

  it("caps each owner at 100 rows and marks the result truncated", async () => {
    const database = await createDatabase();
    await seedWorkspace(database, scope);
    await seedSession(database, scope, rootSessionId);
    const reportRows = Array.from({ length: 101 }, (_, index) => {
      const sequence = String(index).padStart(3, "0");
      return `('report_${sequence}', '${scope.workspaceId}', '${rootSessionId}', 'synthetic',
        'conversation_synthetic', 'cohort_${sequence}', 0, 'text', 'accepted',
        'digest_${sequence}', 'lease_synthetic', '${untilUtc}', '${untilUtc}', '${untilUtc}')`;
    }).join(",");
    await database.exec(`
      INSERT INTO completion_report_attempts (
        id, workspace_id, root_session_id, channel, conversation_id, cohort_id,
        report_revision, part, state, content_digest, lease_owner, lease_expires_at,
        created_at, updated_at
      ) VALUES ${reportRows};
    `);
    setDatabaseForIntegrationTest(drizzle(database, { schema }));

    const result = await readOperationsJourney(scope, {
      sessionId: rootSessionId,
      sinceUtc,
      untilUtc,
    });

    const reports = result.observations.filter(
      (observation: { owner: string }) =>
        observation.owner === "completion-report"
    );
    expect(reports).toHaveLength(100);
    expect(result.bounds).toMatchObject({ pageLimit: 100, truncated: true });
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "completion-report",
          reason: "truncated",
        }),
      ])
    );
  });

  it("does not mutate source rows while reading a journey", async () => {
    const database = await createDatabase();
    await seedWorkspace(database, scope);
    await seedSession(database, scope, rootSessionId);
    setDatabaseForIntegrationTest(drizzle(database, { schema }));
    const before = await countEvidenceRows(database);

    await readOperationsJourney(scope, {
      sessionId: rootSessionId,
      sinceUtc,
      untilUtc,
    });

    expect(await countEvidenceRows(database)).toEqual(before);
  });
});

async function createDatabase() {
  const database = new PGlite();
  databaseInstances.push(database);
  for (const migrationName of (
    await readdir(new URL("../../db/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .toSorted()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Migrations run in committed order.
    const migration = await readFile(
      new URL(`../../db/migrations/${migrationName}`, import.meta.url),
      "utf8"
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Migration statements run in committed order.
        await database.exec(statement);
      }
    }
  }
  return database;
}

async function seedWorkspace(database: PGlite, workspaceScope: AccessScope) {
  await database.exec(`
    INSERT INTO workspaces (id) VALUES ('${workspaceScope.workspaceId}');
    INSERT INTO workspace_memberships (workspace_id, user_id, role)
    VALUES ('${workspaceScope.workspaceId}', '${workspaceScope.userId}', 'owner');
  `);
}

async function seedSession(
  database: PGlite,
  sessionScope: AccessScope,
  sessionId: string
) {
  await database.exec(`
    INSERT INTO agent_sessions (session_id, workspace_id, created_by_user_id)
    VALUES ('${sessionId}', '${sessionScope.workspaceId}', '${sessionScope.userId}');
  `);
}

async function countEvidenceRows(database: PGlite) {
  const result = await database.query<{ count: string }>(`
    SELECT (
      (SELECT count(*) FROM agent_sessions) +
      (SELECT count(*) FROM browser_sessions) +
      (SELECT count(*) FROM browser_traces) +
      (SELECT count(*) FROM browser_trace_events) +
      (SELECT count(*) FROM completion_report_attempts) +
      (SELECT count(*) FROM scheduled_agent_jobs) +
      (SELECT count(*) FROM scheduled_agent_runs)
    )::text AS count
  `);
  return result.rows[0]?.count;
}
