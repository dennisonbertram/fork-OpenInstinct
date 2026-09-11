import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const chats = pgTable(
  "chats",
  {
    sessionId: text("session_id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    channel: text("channel"),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", {
      mode: "number",
      precision: 16,
      scale: 8,
    }),
  },
  (table) => [
    foreignKey({
      name: "chats_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check("chats_input_tokens_check", sql`${table.inputTokens} >= 0`),
    check("chats_output_tokens_check", sql`${table.outputTokens} >= 0`),
    check(
      "chats_cost_usd_check",
      sql`${table.costUsd} IS NULL OR ${table.costUsd} >= 0`
    ),
    index("chats_workspace_updated_idx").on(
      table.workspaceId,
      table.updatedAt.desc().nullsFirst()
    ),
  ]
);

export const chatsRelations = relations(chats, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [chats.workspaceId],
    references: [workspaces.id],
  }),
}));

/**
 * One physical side effect of one interactive completion report.
 *
 * This exists because a report cannot be claimed durably anywhere else. Eve's
 * own documentation is explicit that "an interruption before the durable step
 * completes can re-run the step and execute the tool again even if the first
 * request reached the upstream service", and prescribes recording a unique
 * application operation before writing. SendBlue has no demonstrated
 * idempotency key for `messages.send`, so that record has to live here.
 *
 * It is not a task engine, outbox, queue or scheduler. There is no poller and
 * no retry: a part found `attempted` without acceptance is reported to the user
 * as uncertain, never re-sent.
 *
 * `part` names each physical effect of one logical report — a text send, an
 * attachment send, a media upload, a media send — so a multi-part report cannot
 * half-repeat. Only digests and identities are stored: never message text, a
 * provider body, a phone number, a secret, or artifact bytes.
 */
export const completionReportAttempts = pgTable(
  "completion_report_attempts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    rootSessionId: text("root_session_id").notNull(),
    /** Channel and conversation this report is owed to. */
    channel: text("channel").notNull(),
    conversationId: text("conversation_id").notNull(),
    /** The settled task cohort owing the report. */
    cohortId: text("cohort_id").notNull(),
    /** Bumped when a later turn owes a fresh report for the same cohort. */
    reportRevision: integer("report_revision").notNull(),
    /** Ordinal role of this physical effect within the report. */
    part: text("part").notNull(),
    state: text("state").notNull(),
    /** Digest of the composed content, so a repeat can be recognised without storing it. */
    contentDigest: text("content_digest").notNull(),
    /** Artifact identity for a media part; null for a text part. */
    artifactId: text("artifact_id"),
    mediaType: text("media_type"),
    byteSize: integer("byte_size"),
    /** Safe provider handle, when the provider returned one. */
    providerHandle: text("provider_handle"),
    /** Holder of the right to transition this part, and its version for CAS. */
    leaseOwner: text("lease_owner").notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }).notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "completion_report_attempts_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    // The logical identity of one physical effect. This is what makes a
    // regenerated model call ID unable to dispatch the same part twice.
    uniqueIndex("completion_report_attempts_logical_idx").on(
      table.workspaceId,
      table.rootSessionId,
      table.cohortId,
      table.reportRevision,
      table.part
    ),
    check(
      "completion_report_attempts_state_check",
      sql`${table.state} IN ('claimed', 'attempted', 'accepted', 'unconfirmed')`
    ),
    check(
      "completion_report_attempts_revision_check",
      sql`${table.reportRevision} >= 0`
    ),
    check(
      "completion_report_attempts_version_check",
      sql`${table.version} >= 1`
    ),
    check(
      "completion_report_attempts_byte_size_check",
      sql`${table.byteSize} IS NULL OR ${table.byteSize} > 0`
    ),
    index("completion_report_attempts_session_idx").on(
      table.workspaceId,
      table.rootSessionId
    ),
  ]
);

export const completionReportAttemptsRelations = relations(
  completionReportAttempts,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [completionReportAttempts.workspaceId],
      references: [workspaces.id],
    }),
  })
);
