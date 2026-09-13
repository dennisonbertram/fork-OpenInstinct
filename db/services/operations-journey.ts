import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { AccessScope } from "@/lib/access-scope";
import {
  agentSessions,
  browserTraces,
  completionReportAttempts,
  db,
  scheduledAgentJobs,
  scheduledAgentRuns,
} from "@/db";

const ownerPageLimit = 100;
const readTimeoutMs = 2_000;
export interface OperationsJourneyInput {
  readonly sessionId: string;
  readonly since: Date;
  readonly until: Date;
}

interface OperationsJourneyGap {
  readonly owner:
    | "browser"
    | "completion-report"
    | "eve"
    | "schedule"
    | "session";
  readonly reason: "cannot_determine" | "missing" | "truncated" | "unavailable";
}

interface OperationsJourneyObservation {
  readonly owner: "browser" | "completion-report" | "session" | "schedule";
  readonly kind: "delivery" | "root_session" | "scheduled_run" | "trace";
  readonly ref: string;
  readonly at: string;
  readonly execution?: string;
  readonly reporting?: string;
  readonly delivery?: "accepted" | "failed_before_dispatch" | "uncertain";
}

export async function readOperationsJourneyMetadata(
  scope: AccessScope,
  input: OperationsJourneyInput
) {
  const session = await withReadTimeout((database) =>
    database
      .select({
        sessionId: agentSessions.sessionId,
        createdAt: agentSessions.createdAt,
      })
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.workspaceId, scope.workspaceId),
          eq(agentSessions.sessionId, input.sessionId)
        )
      )
      .limit(1)
  );
  const ownedSession = session[0];
  if (!ownedSession) {
    return {
      observations: [] as const,
      gaps: [{ owner: "session", reason: "missing" }] as const,
      pageLimit: ownerPageLimit,
      pagesRead: 1,
      truncated: false,
    };
  }

  const readers = [
    { owner: "browser", read: readBrowserMetadata(scope, input) },
    { owner: "completion-report", read: readReportMetadata(scope, input) },
    { owner: "schedule", read: readScheduleMetadata(scope, input) },
  ] as const;
  const readerResults = await Promise.allSettled(
    readers.map(async ({ read }) => await read)
  );
  const observations: OperationsJourneyObservation[] = [
    {
      owner: "session",
      kind: "root_session",
      ref: ownedSession.sessionId,
      at: ownedSession.createdAt.toISOString(),
    },
  ];
  const gaps: OperationsJourneyGap[] = [
    // This database projection has no Eve client. The CLI separately uses Eve's
    // authenticated historical stream with a metadata-only allowlist; the gap
    // here prevents a DB-only caller from treating that independent read as run.
    { owner: "eve", reason: "cannot_determine" },
  ];
  let pagesRead = 1;
  let truncated = false;

  for (const [index, reader] of readerResults.entries()) {
    const readerOwner = readers[index]?.owner;
    if (readerOwner === undefined) continue;
    if (reader.status === "rejected") {
      gaps.push({
        owner: readerOwner,
        reason: "unavailable",
      });
      continue;
    }
    pagesRead += 1;
    observations.push(...reader.value.observations);
    truncated ||= reader.value.truncated;
    if (reader.value.observations.length === 0) {
      gaps.push({ owner: reader.value.owner, reason: "missing" });
    }
    if (reader.value.truncated) {
      gaps.push({ owner: reader.value.owner, reason: "truncated" });
    }
  }

  return {
    observations,
    gaps,
    pageLimit: ownerPageLimit,
    pagesRead,
    truncated,
  };
}

async function readBrowserMetadata(
  scope: AccessScope,
  input: OperationsJourneyInput
) {
  const rows = await withReadTimeout((database) =>
    database
      .select({
        completedAt: browserTraces.completedAt,
        sessionId: browserTraces.sessionId,
        startedAt: browserTraces.startedAt,
        status: browserTraces.status,
      })
      .from(browserTraces)
      .where(
        and(
          eq(browserTraces.workspaceId, scope.workspaceId),
          eq(browserTraces.sessionId, input.sessionId),
          gte(browserTraces.startedAt, input.since),
          lte(browserTraces.startedAt, input.until)
        )
      )
      .orderBy(asc(browserTraces.startedAt))
      .limit(ownerPageLimit + 1)
  );
  return {
    owner: "browser" as const,
    truncated: rows.length > ownerPageLimit,
    observations: rows.slice(0, ownerPageLimit).map((row) => ({
      owner: "browser" as const,
      kind: "trace" as const,
      ref: row.sessionId,
      at: (row.completedAt ?? row.startedAt).toISOString(),
      execution: row.status,
    })),
  };
}

async function readReportMetadata(
  scope: AccessScope,
  input: OperationsJourneyInput
) {
  const rows = await withReadTimeout((database) =>
    database
      .select({
        id: completionReportAttempts.id,
        state: completionReportAttempts.state,
        updatedAt: completionReportAttempts.updatedAt,
      })
      .from(completionReportAttempts)
      .where(
        and(
          eq(completionReportAttempts.workspaceId, scope.workspaceId),
          eq(completionReportAttempts.rootSessionId, input.sessionId),
          gte(completionReportAttempts.updatedAt, input.since),
          lte(completionReportAttempts.updatedAt, input.until)
        )
      )
      .orderBy(
        asc(completionReportAttempts.updatedAt),
        asc(completionReportAttempts.id)
      )
      .limit(ownerPageLimit + 1)
  );
  return {
    owner: "completion-report" as const,
    truncated: rows.length > ownerPageLimit,
    observations: rows.slice(0, ownerPageLimit).map((row) => {
      const delivery = deliveryForReportState(row.state);
      if (delivery === undefined) {
        return {
          owner: "completion-report" as const,
          kind: "delivery" as const,
          ref: row.id,
          at: row.updatedAt.toISOString(),
          reporting: row.state,
        };
      }
      return {
        owner: "completion-report" as const,
        kind: "delivery" as const,
        ref: row.id,
        at: row.updatedAt.toISOString(),
        reporting: row.state,
        delivery,
      };
    }),
  };
}

async function readScheduleMetadata(
  scope: AccessScope,
  input: OperationsJourneyInput
) {
  const rows = await withReadTimeout((database) =>
    database
      .select({
        completedAt: scheduledAgentRuns.completedAt,
        id: scheduledAgentRuns.id,
        reportStatus: scheduledAgentRuns.reportStatus,
        startedAt: scheduledAgentRuns.startedAt,
        status: scheduledAgentRuns.status,
        updatedAt: scheduledAgentRuns.updatedAt,
      })
      .from(scheduledAgentRuns)
      .innerJoin(
        scheduledAgentJobs,
        eq(scheduledAgentJobs.id, scheduledAgentRuns.jobId)
      )
      .where(
        and(
          eq(scheduledAgentJobs.workspaceId, scope.workspaceId),
          eq(scheduledAgentRuns.workerSessionId, input.sessionId),
          gte(scheduledAgentRuns.updatedAt, input.since),
          lte(scheduledAgentRuns.updatedAt, input.until)
        )
      )
      .orderBy(asc(scheduledAgentRuns.updatedAt), asc(scheduledAgentRuns.id))
      .limit(ownerPageLimit + 1)
  );
  return {
    owner: "schedule" as const,
    truncated: rows.length > ownerPageLimit,
    observations: rows.slice(0, ownerPageLimit).map((row) => ({
      owner: "schedule" as const,
      kind: "scheduled_run" as const,
      ref: row.id,
      at: (row.completedAt ?? row.startedAt ?? row.updatedAt).toISOString(),
      execution: row.status,
      reporting: row.reportStatus,
    })),
  };
}

function deliveryForReportState(
  state: string
): "accepted" | "uncertain" | undefined {
  if (state === "accepted") return "accepted";
  if (state === "claimed") return undefined;
  return "uncertain";
}

async function withReadTimeout<T>(
  operation: (database: Pick<typeof db, "select">) => Promise<T>
): Promise<T> {
  return await db.transaction(async (transaction) => {
    // PGlite does not implement PostgreSQL's statement_timeout. Production and
    // local Postgres execute the read on this transaction's connection, so the
    // timeout cancels the statement rather than merely abandoning its caller.
    if (!isPGlite())
      await transaction.execute(
        sql.raw(`SET LOCAL statement_timeout = '${String(readTimeoutMs)}ms'`)
      );
    return await operation(transaction);
  });
}

function isPGlite() {
  return db.$client.constructor.name === "PGlite";
}
