CREATE TABLE "channel_communication_suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_line_id" text NOT NULL,
	"phone_lookup_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stopped_at" timestamp (3) with time zone,
	"provider_opted_in_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_communication_suppressions_status_check" CHECK ("channel_communication_suppressions"."status" IN ('active', 'stopped'))
);
--> statement-breakpoint
CREATE TABLE "channel_onboarding_enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"phone_identity_id" text NOT NULL,
	"user_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_conversation_id" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"capabilities" jsonb NOT NULL,
	"next_opening_request_ordinal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_onboarding_enrollments_status_check" CHECK ("channel_onboarding_enrollments"."status" IN ('ready', 'stopped'))
);
--> statement-breakpoint
CREATE TABLE "channel_onboarding_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"enrollment_id" text NOT NULL,
	"receipt_id" text,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_line_id" text NOT NULL,
	"provider_conversation_id" text NOT NULL,
	"copy_version" text DEFAULT 'v1' NOT NULL,
	"ordinal" integer NOT NULL,
	"depends_on_operation_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp (3) with time zone,
	"retry_at" timestamp (3) with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"provider_handle" text,
	"eve_session_id" text,
	"reply_key" text,
	"encrypted_payload" text,
	"last_error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_onboarding_operations_kind_check" CHECK ("channel_onboarding_operations"."kind" IN ('welcome', 'opening_request', 'outbound_reply')),
	CONSTRAINT "channel_onboarding_operations_state_check" CHECK ("channel_onboarding_operations"."state" IN ('pending', 'leased', 'attempted', 'accepted', 'delivered', 'failed', 'uncertain', 'cancelled')),
	CONSTRAINT "channel_onboarding_operations_last_error_bound_check" CHECK ("channel_onboarding_operations"."last_error" IS NULL OR char_length("channel_onboarding_operations"."last_error") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "channel_onboarding_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"enrollment_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_line_id" text NOT NULL,
	"provider_conversation_id" text NOT NULL,
	"message_handle" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_receipts_id_enrollment_uidx" ON "channel_onboarding_receipts" USING btree ("id","enrollment_id");--> statement-breakpoint
ALTER TABLE "phone_identities" DROP CONSTRAINT "phone_identities_status_check";--> statement-breakpoint
DROP INDEX "phone_identities_verified_lookup_hash_uidx";--> statement-breakpoint
ALTER TABLE "phone_identities" ALTER COLUMN "verified_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "phone_identities" ADD COLUMN "assurance" text DEFAULT 'otp_verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "phone_identities" ADD COLUMN "provenance_provider" text;--> statement-breakpoint
ALTER TABLE "phone_identities" ADD COLUMN "provenance_account_id" text;--> statement-breakpoint
ALTER TABLE "phone_identities" ADD COLUMN "provenance_line_id" text;--> statement-breakpoint
ALTER TABLE "phone_identities" ADD COLUMN "observed_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "phone_identities_id_user_uidx" ON "phone_identities" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_conversations_workspace_id_uidx" ON "channel_conversations" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "channel_onboarding_enrollments" ADD CONSTRAINT "channel_onboarding_enrollments_channel_conversation_id_channel_conversations_id_fk" FOREIGN KEY ("channel_conversation_id") REFERENCES "public"."channel_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_onboarding_enrollments" ADD CONSTRAINT "channel_onboarding_enrollments_phone_identity_user_fkey" FOREIGN KEY ("phone_identity_id","user_id") REFERENCES "public"."phone_identities"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_onboarding_enrollments" ADD CONSTRAINT "channel_onboarding_enrollments_workspace_member_fkey" FOREIGN KEY ("workspace_id","principal_id") REFERENCES "public"."workspace_memberships"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_onboarding_enrollments" ADD CONSTRAINT "channel_onboarding_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_onboarding_operations" ADD CONSTRAINT "channel_onboarding_operations_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."channel_onboarding_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_onboarding_operations" ADD CONSTRAINT "channel_onboarding_operations_receipt_enrollment_fkey" FOREIGN KEY ("receipt_id","enrollment_id") REFERENCES "public"."channel_onboarding_receipts"("id","enrollment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_onboarding_operations" ADD CONSTRAINT "channel_onboarding_operations_dependency_fkey" FOREIGN KEY ("depends_on_operation_id") REFERENCES "public"."channel_onboarding_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_onboarding_receipts" ADD CONSTRAINT "channel_onboarding_receipts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."channel_onboarding_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_communication_suppressions_subject_uidx" ON "channel_communication_suppressions" USING btree ("provider","provider_account_id","provider_line_id","phone_lookup_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_enrollments_phone_identity_uidx" ON "channel_onboarding_enrollments" USING btree ("phone_identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_enrollments_conversation_uidx" ON "channel_onboarding_enrollments" USING btree ("channel_conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_enrollments_workspace_conversation_uidx" ON "channel_onboarding_enrollments" USING btree ("workspace_id","channel_conversation_id");--> statement-breakpoint
ALTER TABLE "channel_onboarding_enrollments" ADD CONSTRAINT "channel_onboarding_enrollments_workspace_conversation_fkey" FOREIGN KEY ("workspace_id","channel_conversation_id") REFERENCES "public"."channel_conversations"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_operations_enrollment_kind_copy_ordinal_uidx" ON "channel_onboarding_operations" USING btree ("enrollment_id","kind","copy_version","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_operations_reply_key_uidx" ON "channel_onboarding_operations" USING btree ("reply_key") WHERE "channel_onboarding_operations"."reply_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "channel_onboarding_operations_ready_drain_idx" ON "channel_onboarding_operations" USING btree ("state","retry_at","lease_expires_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_receipts_provider_message_uidx" ON "channel_onboarding_receipts" USING btree ("provider","provider_account_id","provider_line_id","message_handle");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_identities_active_lookup_hash_uidx" ON "phone_identities" USING btree ("phone_lookup_hash") WHERE "phone_identities"."status" IN ('verified', 'active');--> statement-breakpoint
ALTER TABLE "phone_identities" ADD CONSTRAINT "phone_identities_assurance_check" CHECK ("phone_identities"."assurance" IN ('otp_verified', 'channel_observed'));--> statement-breakpoint
ALTER TABLE "phone_identities" ADD CONSTRAINT "phone_identities_assurance_provenance_check" CHECK ((
        ("phone_identities"."assurance" = 'otp_verified' AND "phone_identities"."verified_at" IS NOT NULL)
        OR (
          "phone_identities"."assurance" = 'channel_observed'
          AND "phone_identities"."verified_at" IS NULL
          AND "phone_identities"."provenance_provider" IS NOT NULL
          AND "phone_identities"."provenance_account_id" IS NOT NULL
          AND "phone_identities"."provenance_line_id" IS NOT NULL
          AND "phone_identities"."observed_at" IS NOT NULL
        )
      ));--> statement-breakpoint
ALTER TABLE "phone_identities" ADD CONSTRAINT "phone_identities_status_check" CHECK ("phone_identities"."status" IN ('verified', 'active', 'revoked', 'recycled'));
