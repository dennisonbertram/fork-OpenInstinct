import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface TenancyReadinessReport {
  readonly agents: {
    readonly multipleActive: number;
    readonly zeroActive: number;
  };
  readonly owners: {
    readonly ambiguous: number;
    readonly missing: number;
    readonly revoked: number;
    readonly total: number;
  };
  readonly staleBindings: number;
  readonly staleInstallations: number;
}

interface ReadinessRow extends Record<string, unknown> {
  readonly ambiguousOwners: number | string;
  readonly missingOwners: number | string;
  readonly multipleActiveAgents: number | string;
  readonly revokedOwners: number | string;
  readonly staleBindings: number | string;
  readonly staleInstallations: number | string;
  readonly totalWorkspaces: number | string;
  readonly zeroActiveAgents: number | string;
}

/**
 * Returns aggregate preflight counts only. Never add identifiers or row data
 * to this result; operators use the counts to decide whether repair is safe.
 */
export async function getTenancyReadiness(): Promise<TenancyReadinessReport> {
  const result = await db.execute<ReadinessRow>(sql`
    WITH owner_counts AS (
      SELECT
        w.id,
        count(m.user_id) FILTER (WHERE m.role = 'owner') AS owner_count,
        count(m.user_id) FILTER (
          WHERE m.role = 'owner' AND m.status = 'active'
        ) AS active_owner_count,
        count(m.user_id) FILTER (
          WHERE m.role = 'owner' AND m.status = 'revoked'
        ) AS revoked_owner_count
      FROM workspaces AS w
      LEFT JOIN workspace_memberships AS m ON m.workspace_id = w.id
      GROUP BY w.id
    ),
    agent_counts AS (
      SELECT
        w.id,
        count(a.id) FILTER (
          WHERE a.status = 'active' AND a.active_revision_id IS NOT NULL
        ) AS active_agent_count
      FROM workspaces AS w
      LEFT JOIN agents AS a ON a.workspace_id = w.id
      GROUP BY w.id
    ),
    binding_counts AS (
      SELECT count(*) AS stale_bindings
      FROM channel_conversations AS c
      LEFT JOIN workspaces AS w ON w.id = c.workspace_id
      LEFT JOIN agents AS a
        ON a.workspace_id = c.workspace_id AND a.id = c.agent_id
      LEFT JOIN agent_revisions AS r
        ON r.workspace_id = c.workspace_id
        AND r.agent_id = c.agent_id
        AND r.id = c.pinned_revision_id
      LEFT JOIN platform_lines AS l ON l.id = c.platform_line_id
      WHERE c.status = 'active'
        AND (
          w.lifecycle_state NOT IN ('trial', 'active')
          OR w.id IS NULL
          OR a.status IS DISTINCT FROM 'active'
          OR r.id IS NULL
          OR l.status IS DISTINCT FROM 'active'
        )
    ),
    installation_counts AS (
      SELECT count(*) AS stale_installations
      FROM connection_installations AS i
      LEFT JOIN workspaces AS w ON w.id = i.workspace_id
      WHERE i.status <> 'active'
        OR i.revoked_at IS NOT NULL
        OR w.lifecycle_state NOT IN ('trial', 'active')
        OR w.id IS NULL
    ),
    owner_summary AS (
      SELECT
        count(*) AS total_workspaces,
        count(*) FILTER (WHERE owner_count = 0) AS missing_owners,
        count(*) FILTER (WHERE active_owner_count > 1) AS ambiguous_owners,
        count(*) FILTER (
          WHERE owner_count > 0
            AND active_owner_count = 0
            AND revoked_owner_count > 0
        ) AS revoked_owners
      FROM owner_counts
    ),
    agent_summary AS (
      SELECT
        count(*) FILTER (WHERE active_agent_count = 0) AS zero_active_agents,
        count(*) FILTER (WHERE active_agent_count > 1) AS multiple_active_agents
      FROM agent_counts
    )
    SELECT
      owner_summary.total_workspaces AS "totalWorkspaces",
      owner_summary.missing_owners AS "missingOwners",
      owner_summary.ambiguous_owners AS "ambiguousOwners",
      owner_summary.revoked_owners AS "revokedOwners",
      agent_summary.zero_active_agents AS "zeroActiveAgents",
      agent_summary.multiple_active_agents AS "multipleActiveAgents",
      binding_counts.stale_bindings AS "staleBindings",
      installation_counts.stale_installations AS "staleInstallations"
    FROM owner_summary, agent_summary, binding_counts, installation_counts
  `);
  const row = result.rows[0];
  if (!row) {
    return {
      agents: { multipleActive: 0, zeroActive: 0 },
      owners: { ambiguous: 0, missing: 0, revoked: 0, total: 0 },
      staleBindings: 0,
      staleInstallations: 0,
    };
  }
  return {
    agents: {
      multipleActive: numberValue(row.multipleActiveAgents),
      zeroActive: numberValue(row.zeroActiveAgents),
    },
    owners: {
      ambiguous: numberValue(row.ambiguousOwners),
      missing: numberValue(row.missingOwners),
      revoked: numberValue(row.revokedOwners),
      total: numberValue(row.totalWorkspaces),
    },
    staleBindings: numberValue(row.staleBindings),
    staleInstallations: numberValue(row.staleInstallations),
  };
}

function numberValue(value: number | string) {
  return Number(value);
}
