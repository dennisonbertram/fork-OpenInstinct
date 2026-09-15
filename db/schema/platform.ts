import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AgentManifest } from "@/lib/agent-manifest";
import { user } from "./auth";
import { sqlValues, workspaceMemberships, workspaces } from "./workspaces";

const tsColumn = (name: string) =>
  timestamp(name, { mode: "date", precision: 3, withTimezone: true });

export const phoneIdentityStatuses = [
  "verified",
  "active",
  "revoked",
  "recycled",
] as const;
export type PhoneIdentityStatus = (typeof phoneIdentityStatuses)[number];

export const phoneIdentityAssurances = [
  "otp_verified",
  "channel_observed",
] as const;
export type PhoneIdentityAssurance = (typeof phoneIdentityAssurances)[number];

export const platformLineProviders = ["linq", "sendblue"] as const;
export type PlatformLineProvider = (typeof platformLineProviders)[number];

export const platformLineStatuses = ["active", "suspended", "retired"] as const;
export type PlatformLineStatus = (typeof platformLineStatuses)[number];

export const channelConversationStatuses = ["active", "closed"] as const;
export type ChannelConversationStatus =
  (typeof channelConversationStatuses)[number];

export const channelParticipantRoles = ["owner", "participant"] as const;
export type ChannelParticipantRole = (typeof channelParticipantRoles)[number];

export const channelParticipantStatuses = ["active", "revoked"] as const;
export type ChannelParticipantStatus =
  (typeof channelParticipantStatuses)[number];

export const channelOnboardingEnrollmentStatuses = [
  "ready",
  "stopped",
] as const;
export type ChannelOnboardingEnrollmentStatus =
  (typeof channelOnboardingEnrollmentStatuses)[number];

export const channelOnboardingOperationKinds = [
  "welcome",
  "opening_request",
  "outbound_reply",
] as const;
export type ChannelOnboardingOperationKind =
  (typeof channelOnboardingOperationKinds)[number];

export const channelOnboardingOperationStates = [
  "pending",
  "leased",
  "attempted",
  "accepted",
  "delivered",
  "failed",
  "uncertain",
  "cancelled",
] as const;
export type ChannelOnboardingOperationState =
  (typeof channelOnboardingOperationStates)[number];

export const channelOnboardingQuotaKinds = [
  "enrollment",
  "model_turn",
  "outbound_message",
] as const;
export type ChannelOnboardingQuotaKind =
  (typeof channelOnboardingQuotaKinds)[number];

export const channelCommunicationSuppressionStates = [
  "active",
  "stopped",
] as const;
export type ChannelCommunicationSuppressionState =
  (typeof channelCommunicationSuppressionStates)[number];

export const channelCommunicationPreferenceCommands = [
  "stop",
  "start",
] as const;
export type ChannelCommunicationPreferenceCommand =
  (typeof channelCommunicationPreferenceCommands)[number];

export const connectionInstallationProviders = [
  "google",
  "linq",
  "square",
] as const;
export type ConnectionInstallationProvider =
  (typeof connectionInstallationProviders)[number];

export const connectionInstallationStatuses = ["active", "revoked"] as const;
export type ConnectionInstallationStatus =
  (typeof connectionInstallationStatuses)[number];

export const usageEventKinds = [
  "model_tokens",
  "browser_session",
  "provider_message",
  "storage_bytes",
] as const;
export type UsageEventKind = (typeof usageEventKinds)[number];

export const workspaceBudgetPeriods = ["monthly"] as const;
export type WorkspaceBudgetPeriod = (typeof workspaceBudgetPeriods)[number];

export const auditEventOutcomes = ["ok", "denied", "error"] as const;
export type AuditEventOutcome = (typeof auditEventOutcomes)[number];

export const apiCredentialScopes = [
  "agents:read",
  "agents:write",
  "usage:read",
] as const;
export type ApiCredentialScope = (typeof apiCredentialScopes)[number];

export const apiCredentialStatuses = ["active", "revoked"] as const;
export type ApiCredentialStatus = (typeof apiCredentialStatuses)[number];

export const webhookEndpointStatuses = ["active", "disabled"] as const;
export type WebhookEndpointStatus = (typeof webhookEndpointStatuses)[number];

export const webhookDeliveryOutcomes = [
  "pending",
  "delivered",
  "failed",
  "dead",
] as const;
export type WebhookDeliveryOutcome = (typeof webhookDeliveryOutcomes)[number];

export const agentStatuses = ["draft", "active", "archived"] as const;
export type AgentStatus = (typeof agentStatuses)[number];

function activeRevisionForeignColumns(): [
  AnyPgColumn,
  AnyPgColumn,
  AnyPgColumn,
] {
  return [
    agentRevisions.workspaceId,
    agentRevisions.agentId,
    agentRevisions.id,
  ];
}

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    slug: text("slug").notNull(),
    displayName: text("display_name"),
    status: text("status", { enum: agentStatuses }).notNull().default("draft"),
    activeRevisionId: text("active_revision_id"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "agents_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check(
      "agents_status_check",
      sql`${table.status} IN (${sqlValues(agentStatuses)})`
    ),
    uniqueIndex("agents_workspace_id_uidx").on(table.workspaceId, table.id),
    uniqueIndex("agents_workspace_slug_uidx").on(table.workspaceId, table.slug),
    foreignKey({
      name: "agents_workspace_active_revision_fkey",
      columns: [table.workspaceId, table.id, table.activeRevisionId],
      foreignColumns: activeRevisionForeignColumns(),
    }),
  ]
);

export const agentRevisions = pgTable(
  "agent_revisions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    agentId: text("agent_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    manifest: jsonb("manifest").$type<AgentManifest>().notNull(),
    contentDigest: text("content_digest").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "agent_revisions_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_revisions_workspace_agent_fkey",
      columns: [table.workspaceId, table.agentId],
      foreignColumns: [agents.workspaceId, agents.id],
    }).onDelete("cascade"),
    uniqueIndex("agent_revisions_workspace_id_uidx").on(
      table.workspaceId,
      table.id
    ),
    uniqueIndex("agent_revisions_agent_revision_number_uidx").on(
      table.agentId,
      table.revisionNumber
    ),
    uniqueIndex("agent_revisions_workspace_agent_id_uidx").on(
      table.workspaceId,
      table.agentId,
      table.id
    ),
  ]
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id"),
    kind: text("kind", { enum: usageEventKinds }).notNull(),
    quantity: integer("quantity").notNull(),
    unit: text("unit").notNull(),
    costEstimateUsd: doublePrecision("cost_estimate_usd"),
    sessionId: text("session_id"),
    metadata: jsonb("metadata"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "usage_events_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check(
      "usage_events_kind_check",
      sql`${table.kind} IN (${sqlValues(usageEventKinds)})`
    ),
    index("usage_events_workspace_kind_created_idx").on(
      table.workspaceId,
      table.kind,
      table.createdAt
    ),
  ]
);

export const workspaceBudgets = pgTable(
  "workspace_budgets",
  {
    workspaceId: text("workspace_id").primaryKey(),
    period: text("period", { enum: workspaceBudgetPeriods })
      .notNull()
      .default("monthly"),
    modelTokenLimit: integer("model_token_limit"),
    browserSessionLimit: integer("browser_session_limit"),
    messageLimit: integer("message_limit"),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "workspace_budgets_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check(
      "workspace_budgets_period_check",
      sql`${table.period} IN (${sqlValues(workspaceBudgetPeriods)})`
    ),
  ]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    target: text("target"),
    outcome: text("outcome", { enum: auditEventOutcomes })
      .notNull()
      .default("ok"),
    correlationId: text("correlation_id"),
    metadata: jsonb("metadata"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "audit_events_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check(
      "audit_events_outcome_check",
      sql`${table.outcome} IN (${sqlValues(auditEventOutcomes)})`
    ),
    index("audit_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
);

export const apiCredentials = pgTable(
  "api_credentials",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    scopes: jsonb("scopes").$type<readonly ApiCredentialScope[]>().notNull(),
    status: text("status", { enum: apiCredentialStatuses })
      .notNull()
      .default("active"),
    createdByUserId: text("created_by_user_id").notNull(),
    expiresAt: tsColumn("expires_at"),
    revokedAt: tsColumn("revoked_at"),
    lastUsedAt: tsColumn("last_used_at"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "api_credentials_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    uniqueIndex("api_credentials_key_hash_uidx").on(table.keyHash),
    check(
      "api_credentials_status_check",
      sql`${table.status} IN (${sqlValues(apiCredentialStatuses)})`
    ),
  ]
);

export const apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    route: text("route").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    resourceId: text("resource_id"),
    responseStatus: integer("response_status").notNull(),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    leaseExpiresAt: tsColumn("lease_expires_at"),
  },
  (table) => [
    foreignKey({
      name: "api_idempotency_keys_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    uniqueIndex("api_idempotency_keys_workspace_route_key_uidx").on(
      table.workspaceId,
      table.route,
      table.idempotencyKey
    ),
  ]
);

export const phoneIdentities = pgTable(
  "phone_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    encryptedPhoneNumber: text("encrypted_phone_number").notNull(),
    phoneLookupHash: text("phone_lookup_hash").notNull(),
    status: text("status", { enum: phoneIdentityStatuses })
      .notNull()
      .default("verified"),
    assurance: text("assurance", { enum: phoneIdentityAssurances })
      .notNull()
      .default("otp_verified"),
    provenanceProvider: text("provenance_provider", {
      enum: platformLineProviders,
    }),
    provenanceAccountId: text("provenance_account_id"),
    provenanceLineId: text("provenance_line_id"),
    observedAt: tsColumn("observed_at"),
    verifiedAt: tsColumn("verified_at"),
    revokedAt: tsColumn("revoked_at"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "phone_identities_status_check",
      sql`${table.status} IN (${sqlValues(phoneIdentityStatuses)})`
    ),
    check(
      "phone_identities_assurance_check",
      sql`${table.assurance} IN (${sqlValues(phoneIdentityAssurances)})`
    ),
    check(
      "phone_identities_assurance_provenance_check",
      sql`(
        (${table.assurance} = 'otp_verified' AND ${table.verifiedAt} IS NOT NULL)
        OR (
          ${table.assurance} = 'channel_observed'
          AND ${table.verifiedAt} IS NULL
          AND ${table.provenanceProvider} IS NOT NULL
          AND ${table.provenanceAccountId} IS NOT NULL
          AND ${table.provenanceLineId} IS NOT NULL
          AND ${table.observedAt} IS NOT NULL
        )
      )`
    ),
    foreignKey({
      name: "phone_identities_user_id_fkey",
      columns: [table.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    uniqueIndex("phone_identities_active_lookup_hash_uidx")
      .on(table.phoneLookupHash)
      .where(sql`${table.status} IN ('verified', 'active')`),
    index("phone_identities_user_id_idx").on(table.userId),
    uniqueIndex("phone_identities_id_user_uidx").on(table.id, table.userId),
  ]
);

export const channelOnboardingEnrollments = pgTable(
  "channel_onboarding_enrollments",
  {
    id: text("id").primaryKey(),
    phoneIdentityId: text("phone_identity_id").notNull(),
    userId: text("user_id").notNull(),
    principalId: text("principal_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    channelConversationId: text("channel_conversation_id")
      .notNull()
      .references(() => channelConversations.id, { onDelete: "cascade" }),
    status: text("status", { enum: channelOnboardingEnrollmentStatuses })
      .notNull()
      .default("ready"),
    capabilities: jsonb("capabilities").$type<readonly string[]>().notNull(),
    nextOpeningRequestOrdinal: integer("next_opening_request_ordinal")
      .notNull()
      .default(0),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "channel_onboarding_enrollments_status_check",
      sql`${table.status} IN (${sqlValues(channelOnboardingEnrollmentStatuses)})`
    ),
    foreignKey({
      name: "channel_onboarding_enrollments_phone_identity_user_fkey",
      columns: [table.phoneIdentityId, table.userId],
      foreignColumns: [phoneIdentities.id, phoneIdentities.userId],
    }),
    foreignKey({
      name: "channel_onboarding_enrollments_workspace_member_fkey",
      columns: [table.workspaceId, table.principalId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.userId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "channel_onboarding_enrollments_user_id_fkey",
      columns: [table.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    uniqueIndex("channel_onboarding_enrollments_phone_identity_uidx").on(
      table.phoneIdentityId
    ),
    uniqueIndex("channel_onboarding_enrollments_conversation_uidx").on(
      table.channelConversationId
    ),
    uniqueIndex(
      "channel_onboarding_enrollments_workspace_conversation_uidx"
    ).on(table.workspaceId, table.channelConversationId),
  ]
);

export const channelCommunicationSuppressions = pgTable(
  "channel_communication_suppressions",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: platformLineProviders }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerLineId: text("provider_line_id").notNull(),
    phoneLookupHash: text("phone_lookup_hash").notNull(),
    status: text("status", { enum: channelCommunicationSuppressionStates })
      .notNull()
      .default("active"),
    stoppedAt: tsColumn("stopped_at"),
    providerOptedInAt: tsColumn("provider_opted_in_at"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "channel_communication_suppressions_status_check",
      sql`${table.status} IN (${sqlValues(channelCommunicationSuppressionStates)})`
    ),
    uniqueIndex("channel_communication_suppressions_subject_uidx").on(
      table.provider,
      table.providerAccountId,
      table.providerLineId,
      table.phoneLookupHash
    ),
  ]
);

/** Idempotency ledger for authenticated STOP/START events, never an account. */
export const channelCommunicationPreferenceEvents = pgTable(
  "channel_communication_preference_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: platformLineProviders }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerLineId: text("provider_line_id").notNull(),
    phoneLookupHash: text("phone_lookup_hash").notNull(),
    messageHandle: text("message_handle").notNull(),
    command: text("command", {
      enum: channelCommunicationPreferenceCommands,
    }).notNull(),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "channel_communication_preference_events_command_check",
      sql`${table.command} IN (${sqlValues(channelCommunicationPreferenceCommands)})`
    ),
    uniqueIndex("channel_communication_preference_events_message_uidx").on(
      table.provider,
      table.providerAccountId,
      table.providerLineId,
      table.messageHandle
    ),
  ]
);

/**
 * Narrow, durable counters for the explicitly configured SendBlue onboarding
 * limits. They are not billing records and are intentionally scoped only to
 * provider admission and first-contact delivery.
 */
export const channelOnboardingQuotaBuckets = pgTable(
  "channel_onboarding_quota_buckets",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: channelOnboardingQuotaKinds }).notNull(),
    provider: text("provider", { enum: platformLineProviders }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerLineId: text("provider_line_id"),
    senderLookupHash: text("sender_lookup_hash"),
    bucketStart: tsColumn("bucket_start").notNull(),
    used: integer("used").notNull().default(0),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "channel_onboarding_quota_buckets_kind_check",
      sql`${table.kind} IN (${sqlValues(channelOnboardingQuotaKinds)})`
    ),
    check(
      "channel_onboarding_quota_buckets_dimension_check",
      sql`(
        ${table.kind} = 'enrollment'
        AND ${table.senderLookupHash} IS NOT NULL
        AND ${table.providerLineId} IS NOT NULL
      ) OR (
        ${table.kind} IN ('model_turn', 'outbound_message')
        AND ${table.senderLookupHash} IS NULL
        AND ${table.providerLineId} IS NULL
      )`
    ),
    check(
      "channel_onboarding_quota_buckets_nonnegative_check",
      sql`${table.used} >= 0`
    ),
    uniqueIndex("channel_onboarding_quota_buckets_sender_uidx")
      .on(
        table.kind,
        table.provider,
        table.providerAccountId,
        table.providerLineId,
        table.senderLookupHash,
        table.bucketStart
      )
      .where(sql`${table.senderLookupHash} IS NOT NULL`),
    uniqueIndex("channel_onboarding_quota_buckets_account_day_uidx")
      .on(
        table.kind,
        table.provider,
        table.providerAccountId,
        table.bucketStart
      )
      .where(sql`${table.senderLookupHash} IS NULL`),
  ]
);

export const channelOnboardingQuotaReservations = pgTable(
  "channel_onboarding_quota_reservations",
  {
    operationKey: text("operation_key").primaryKey(),
    counterId: text("counter_id").notNull(),
    kind: text("kind", { enum: channelOnboardingQuotaKinds }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    provider: text("provider", { enum: platformLineProviders }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerLineId: text("provider_line_id"),
    senderLookupHash: text("sender_lookup_hash"),
    bucketStart: tsColumn("bucket_start").notNull(),
    accepted: boolean("accepted").notNull(),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "channel_onboarding_quota_reservations_kind_check",
      sql`${table.kind} IN (${sqlValues(channelOnboardingQuotaKinds)})`
    ),
    check(
      "channel_onboarding_quota_reservations_quantity_check",
      sql`${table.quantity} > 0`
    ),
    check(
      "channel_onboarding_quota_reservations_dimension_check",
      sql`(
        ${table.kind} = 'enrollment'
        AND ${table.senderLookupHash} IS NOT NULL
        AND ${table.providerLineId} IS NOT NULL
      ) OR (
        ${table.kind} IN ('model_turn', 'outbound_message')
        AND ${table.senderLookupHash} IS NULL
        AND ${table.providerLineId} IS NULL
      )`
    ),
    foreignKey({
      name: "channel_onboarding_quota_reservations_counter_id_fkey",
      columns: [table.counterId],
      foreignColumns: [channelOnboardingQuotaBuckets.id],
    }).onDelete("cascade"),
    index("channel_onboarding_quota_reservations_counter_id_idx").on(
      table.counterId
    ),
  ]
);

export const channelOnboardingReceipts = pgTable(
  "channel_onboarding_receipts",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id").notNull(),
    provider: text("provider", { enum: platformLineProviders }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerLineId: text("provider_line_id").notNull(),
    providerConversationId: text("provider_conversation_id").notNull(),
    messageHandle: text("message_handle").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "channel_onboarding_receipts_enrollment_id_fkey",
      columns: [table.enrollmentId],
      foreignColumns: [channelOnboardingEnrollments.id],
    }).onDelete("cascade"),
    uniqueIndex("channel_onboarding_receipts_provider_message_uidx").on(
      table.provider,
      table.providerAccountId,
      table.providerLineId,
      table.messageHandle
    ),
    uniqueIndex("channel_onboarding_receipts_id_enrollment_uidx").on(
      table.id,
      table.enrollmentId
    ),
  ]
);

export const channelOnboardingOperations = pgTable(
  "channel_onboarding_operations",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id").notNull(),
    receiptId: text("receipt_id"),
    kind: text("kind", { enum: channelOnboardingOperationKinds }).notNull(),
    provider: text("provider", { enum: platformLineProviders }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerLineId: text("provider_line_id").notNull(),
    providerConversationId: text("provider_conversation_id").notNull(),
    copyVersion: text("copy_version").notNull().default("v1"),
    ordinal: integer("ordinal").notNull(),
    optional: boolean("optional").notNull().default(false),
    dependsOnOperationId: text("depends_on_operation_id"),
    state: text("state", { enum: channelOnboardingOperationStates })
      .notNull()
      .default("pending"),
    version: integer("version").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseExpiresAt: tsColumn("lease_expires_at"),
    retryAt: tsColumn("retry_at"),
    attemptCount: integer("attempt_count").notNull().default(0),
    providerHandle: text("provider_handle"),
    eveSessionId: text("eve_session_id"),
    replyKey: text("reply_key"),
    encryptedPayload: text("encrypted_payload"),
    lastError: text("last_error"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "channel_onboarding_operations_kind_check",
      sql`${table.kind} IN (${sqlValues(channelOnboardingOperationKinds)})`
    ),
    check(
      "channel_onboarding_operations_state_check",
      sql`${table.state} IN (${sqlValues(channelOnboardingOperationStates)})`
    ),
    check(
      "channel_onboarding_operations_last_error_bound_check",
      sql`${table.lastError} IS NULL OR char_length(${table.lastError}) <= 1000`
    ),
    check(
      "channel_onboarding_operations_direct_payload_check",
      sql`${table.kind} = 'opening_request' OR ${table.encryptedPayload} IS NOT NULL`
    ),
    foreignKey({
      name: "channel_onboarding_operations_enrollment_id_fkey",
      columns: [table.enrollmentId],
      foreignColumns: [channelOnboardingEnrollments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "channel_onboarding_operations_receipt_enrollment_fkey",
      columns: [table.receiptId, table.enrollmentId],
      foreignColumns: [
        channelOnboardingReceipts.id,
        channelOnboardingReceipts.enrollmentId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "channel_onboarding_operations_dependency_fkey",
      columns: [table.dependsOnOperationId],
      foreignColumns: [table.id],
    }),
    uniqueIndex(
      "channel_onboarding_operations_enrollment_kind_copy_ordinal_uidx"
    ).on(table.enrollmentId, table.kind, table.copyVersion, table.ordinal),
    uniqueIndex("channel_onboarding_operations_reply_key_uidx")
      .on(table.replyKey)
      .where(sql`${table.replyKey} IS NOT NULL`),
    index("channel_onboarding_operations_ready_drain_idx").on(
      table.state,
      table.retryAt,
      table.leaseExpiresAt,
      table.createdAt
    ),
  ]
);

export const connectionInstallations = pgTable(
  "connection_installations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    provider: text("provider", {
      enum: connectionInstallationProviders,
    }).notNull(),
    connectorId: text("connector_id").notNull(),
    authorizationSubject: text("authorization_subject").notNull(),
    scopes: jsonb("scopes").$type<readonly string[]>(),
    status: text("status", { enum: connectionInstallationStatuses })
      .notNull()
      .default("active"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
    revokedAt: tsColumn("revoked_at"),
  },
  (table) => [
    foreignKey({
      name: "connection_installations_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check(
      "connection_installations_provider_check",
      sql`${table.provider} IN (${sqlValues(connectionInstallationProviders)})`
    ),
    check(
      "connection_installations_status_check",
      sql`${table.status} IN (${sqlValues(connectionInstallationStatuses)})`
    ),
    uniqueIndex("connection_installations_workspace_connector_subject_uidx").on(
      table.workspaceId,
      table.provider,
      table.connectorId,
      table.authorizationSubject
    ),
  ]
);

export const platformLines = pgTable(
  "platform_lines",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: platformLineProviders }).notNull(),
    providerLineId: text("provider_line_id").notNull(),
    connectorId: text("connector_id"),
    status: text("status", { enum: platformLineStatuses })
      .notNull()
      .default("active"),
    environment: text("environment"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "platform_lines_provider_check",
      sql`${table.provider} IN (${sqlValues(platformLineProviders)})`
    ),
    check(
      "platform_lines_status_check",
      sql`${table.status} IN (${sqlValues(platformLineStatuses)})`
    ),
    uniqueIndex("platform_lines_provider_line_uidx").on(
      table.provider,
      table.providerLineId
    ),
  ]
);

export const channelConversations = pgTable(
  "channel_conversations",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerConversationId: text("provider_conversation_id").notNull(),
    platformLineId: text("platform_line_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    agentId: text("agent_id").notNull(),
    pinnedRevisionId: text("pinned_revision_id").notNull(),
    lastInboundMessageId: text("last_inbound_message_id"),
    status: text("status", { enum: channelConversationStatuses })
      .notNull()
      .default("active"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("channel_conversations_provider_conversation_uidx").on(
      table.provider,
      table.providerAccountId,
      table.providerConversationId
    ),
    uniqueIndex("channel_conversations_workspace_id_uidx").on(
      table.workspaceId,
      table.id
    ),
    foreignKey({
      name: "channel_conversations_platform_line_id_fkey",
      columns: [table.platformLineId],
      foreignColumns: [platformLines.id],
    }),
    foreignKey({
      name: "channel_conversations_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "channel_conversations_workspace_agent_fkey",
      columns: [table.workspaceId, table.agentId],
      foreignColumns: [agents.workspaceId, agents.id],
    }),
    foreignKey({
      name: "channel_conversations_workspace_agent_revision_fkey",
      columns: [table.workspaceId, table.agentId, table.pinnedRevisionId],
      foreignColumns: [
        agentRevisions.workspaceId,
        agentRevisions.agentId,
        agentRevisions.id,
      ],
    }),
    check(
      "channel_conversations_status_check",
      sql`${table.status} IN (${sqlValues(channelConversationStatuses)})`
    ),
  ]
);

export const channelParticipants = pgTable(
  "channel_participants",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    phoneIdentityId: text("phone_identity_id").notNull(),
    role: text("role", { enum: channelParticipantRoles })
      .notNull()
      .default("owner"),
    status: text("status", { enum: channelParticipantStatuses })
      .notNull()
      .default("active"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "channel_participants_conversation_id_fkey",
      columns: [table.conversationId],
      foreignColumns: [channelConversations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "channel_participants_phone_identity_id_fkey",
      columns: [table.phoneIdentityId],
      foreignColumns: [phoneIdentities.id],
    }),
    check(
      "channel_participants_role_check",
      sql`${table.role} IN (${sqlValues(channelParticipantRoles)})`
    ),
    check(
      "channel_participants_status_check",
      sql`${table.status} IN (${sqlValues(channelParticipantStatuses)})`
    ),
    uniqueIndex("channel_participants_conversation_identity_uidx").on(
      table.conversationId,
      table.phoneIdentityId
    ),
  ]
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    url: text("url").notNull(),
    encryptedSigningSecret: text("encrypted_signing_secret").notNull(),
    status: text("status", { enum: webhookEndpointStatuses })
      .notNull()
      .default("active"),
    subscribedEvents: jsonb("subscribed_events").notNull(),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
    disabledAt: tsColumn("disabled_at"),
  },
  (table) => [
    foreignKey({
      name: "webhook_endpoints_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check(
      "webhook_endpoints_status_check",
      sql`${table.status} IN (${sqlValues(webhookEndpointStatuses)})`
    ),
    index("webhook_endpoints_workspace_status_idx").on(
      table.workspaceId,
      table.status
    ),
  ]
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    correlationId: text("correlation_id"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    fannedOutAt: tsColumn("fanned_out_at"),
  },
  (table) => [
    foreignKey({
      name: "webhook_events_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    index("webhook_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    eventId: text("event_id").notNull(),
    endpointId: text("endpoint_id").notNull(),
    attempt: integer("attempt").notNull().default(0),
    responseStatus: integer("response_status"),
    outcome: text("outcome", { enum: webhookDeliveryOutcomes })
      .notNull()
      .default("pending"),
    nextAttemptAt: tsColumn("next_attempt_at").notNull(),
    claimToken: text("claim_token"),
    claimExpiresAt: tsColumn("claim_expires_at"),
    createdAt: tsColumn("created_at").defaultNow().notNull(),
    updatedAt: tsColumn("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "webhook_deliveries_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "webhook_deliveries_event_id_fkey",
      columns: [table.eventId],
      foreignColumns: [webhookEvents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "webhook_deliveries_endpoint_id_fkey",
      columns: [table.endpointId],
      foreignColumns: [webhookEndpoints.id],
    }).onDelete("cascade"),
    check(
      "webhook_deliveries_outcome_check",
      sql`${table.outcome} IN (${sqlValues(webhookDeliveryOutcomes)})`
    ),
    index("webhook_deliveries_outcome_next_attempt_idx").on(
      table.outcome,
      table.nextAttemptAt
    ),
  ]
);
