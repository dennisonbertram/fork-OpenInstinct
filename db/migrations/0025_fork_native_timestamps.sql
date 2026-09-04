ALTER TABLE "workspaces" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "workspace_memberships" ALTER COLUMN "invited_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "workspace_memberships" ALTER COLUMN "invited_at" SET DATA TYPE timestamp (3) with time zone USING "invited_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "agent_revisions" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "agent_revisions" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "agent_revisions" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "vault_import_batches" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "vault_import_batches" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "vault_import_batches" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "workspace_budgets" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "workspace_budgets" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "workspace_budgets" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "expires_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "expires_at" SET DATA TYPE timestamp (3) with time zone USING "expires_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "revoked_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "revoked_at" SET DATA TYPE timestamp (3) with time zone USING "revoked_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "last_used_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "last_used_at" SET DATA TYPE timestamp (3) with time zone USING "last_used_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "api_credentials" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "api_idempotency_keys" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "api_idempotency_keys" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "api_idempotency_keys" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "api_idempotency_keys" ALTER COLUMN "lease_expires_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "api_idempotency_keys" ALTER COLUMN "lease_expires_at" SET DATA TYPE timestamp (3) with time zone USING "lease_expires_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "verified_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "verified_at" SET DATA TYPE timestamp (3) with time zone USING "verified_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "revoked_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "revoked_at" SET DATA TYPE timestamp (3) with time zone USING "revoked_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "connection_installations" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "connection_installations" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "connection_installations" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "connection_installations" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "connection_installations" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "connection_installations" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "connection_installations" ALTER COLUMN "revoked_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "connection_installations" ALTER COLUMN "revoked_at" SET DATA TYPE timestamp (3) with time zone USING "revoked_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "platform_lines" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "platform_lines" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "platform_lines" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "platform_lines" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "platform_lines" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "platform_lines" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "channel_conversations" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "channel_conversations" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "channel_conversations" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "channel_conversations" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "channel_conversations" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "channel_conversations" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "channel_participants" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "channel_participants" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "channel_participants" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ALTER COLUMN "updated_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ALTER COLUMN "disabled_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ALTER COLUMN "disabled_at" SET DATA TYPE timestamp (3) with time zone USING "disabled_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "fanned_out_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "fanned_out_at" SET DATA TYPE timestamp (3) with time zone USING "fanned_out_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "next_attempt_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "next_attempt_at" SET DATA TYPE timestamp (3) with time zone USING "next_attempt_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "claim_expires_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "claim_expires_at" SET DATA TYPE timestamp (3) with time zone USING "claim_expires_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "created_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone USING "created_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "updated_at" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone USING "updated_at"::timestamptz;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "updated_at" SET DEFAULT now();
