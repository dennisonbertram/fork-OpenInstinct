CREATE TABLE "completion_report_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"root_session_id" text NOT NULL,
	"channel" text NOT NULL,
	"conversation_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"report_revision" integer NOT NULL,
	"part" text NOT NULL,
	"state" text NOT NULL,
	"content_digest" text NOT NULL,
	"artifact_id" text,
	"media_type" text,
	"byte_size" integer,
	"provider_handle" text,
	"lease_owner" text NOT NULL,
	"lease_expires_at" timestamp (3) with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "completion_report_attempts_state_check" CHECK ("completion_report_attempts"."state" IN ('claimed', 'attempted', 'accepted', 'unconfirmed')),
	CONSTRAINT "completion_report_attempts_revision_check" CHECK ("completion_report_attempts"."report_revision" >= 0),
	CONSTRAINT "completion_report_attempts_version_check" CHECK ("completion_report_attempts"."version" >= 1),
	CONSTRAINT "completion_report_attempts_byte_size_check" CHECK ("completion_report_attempts"."byte_size" IS NULL OR "completion_report_attempts"."byte_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "completion_report_attempts" ADD CONSTRAINT "completion_report_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "completion_report_attempts_logical_idx" ON "completion_report_attempts" USING btree ("workspace_id","root_session_id","cohort_id","report_revision","part");--> statement-breakpoint
CREATE INDEX "completion_report_attempts_session_idx" ON "completion_report_attempts" USING btree ("workspace_id","root_session_id");