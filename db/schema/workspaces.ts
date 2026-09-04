import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const utcTimestampDefault = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export function sqlValues(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(", "));
}

export const workspaceMembershipRoles = ["owner", "admin", "member"] as const;
export type WorkspaceMembershipRole = (typeof workspaceMembershipRoles)[number];

export const workspaceMembershipStatuses = [
  "active",
  "invited",
  "revoked",
] as const;
export type WorkspaceMembershipStatus =
  (typeof workspaceMembershipStatuses)[number];

export const workspaceLifecycleStates = [
  "trial",
  "active",
  "suspended",
  "pending_deletion",
  "deleted",
] as const;
export type WorkspaceLifecycleState = (typeof workspaceLifecycleStates)[number];

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name"),
    plan: text("plan").notNull().default("free"),
    lifecycleState: text("lifecycle_state").notNull().default("active"),
    policyVersion: integer("policy_version").notNull().default(1),
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
    check(
      "workspaces_lifecycle_state_check",
      sql`${table.lifecycleState} IN (${sqlValues(workspaceLifecycleStates)})`
    ),
  ]
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    workspaceId: text("workspace_id").primaryKey(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    countryCode: text("country_code"),
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
      name: "user_profiles_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check(
      "user_profiles_country_code_check",
      sql`${table.countryCode} IS NULL OR char_length(${table.countryCode}) = 2`
    ),
  ]
);

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: workspaceMembershipRoles }).notNull(),
    status: text("status", { enum: workspaceMembershipStatuses })
      .notNull()
      .default("active"),
    invitedByUserId: text("invited_by_user_id"),
    invitedAt: timestamp("invited_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", {
      mode: "date",
      precision: 3,
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.userId],
      name: "workspace_memberships_pkey",
    }),
    foreignKey({
      name: "workspace_memberships_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check(
      "workspace_memberships_role_check",
      sql`${table.role} IN (${sqlValues(workspaceMembershipRoles)})`
    ),
    check(
      "workspace_memberships_status_check",
      sql`${table.status} IN (${sqlValues(workspaceMembershipStatuses)})`
    ),
  ]
);

export const settings = pgTable(
  "settings",
  {
    workspaceId: text("workspace_id").notNull(),
    key: text("key", { enum: ["gateway_model"] }).notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.key],
      name: "settings_pkey",
    }),
    foreignKey({
      name: "settings_workspace_id_fkey",
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
    }).onDelete("cascade"),
    check("settings_key_check", sql`${table.key} = 'gateway_model'`),
  ]
);

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  memberships: many(workspaceMemberships),
  profile: one(userProfiles),
  settings: many(settings),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [userProfiles.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspaceMembershipsRelations = relations(
  workspaceMemberships,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMemberships.workspaceId],
      references: [workspaces.id],
    }),
  })
);

export const settingsRelations = relations(settings, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [settings.workspaceId],
    references: [workspaces.id],
  }),
}));
