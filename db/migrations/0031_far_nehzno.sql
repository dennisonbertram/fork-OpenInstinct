CREATE TABLE "channel_communication_preference_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_line_id" text NOT NULL,
	"phone_lookup_hash" text NOT NULL,
	"message_handle" text NOT NULL,
	"command" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_communication_preference_events_command_check" CHECK ("channel_communication_preference_events"."command" IN ('stop', 'start'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_communication_preference_events_message_uidx" ON "channel_communication_preference_events" USING btree ("provider","provider_account_id","provider_line_id","message_handle");