CREATE TABLE "channel_onboarding_quota_buckets" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_line_id" text,
	"sender_lookup_hash" text,
	"bucket_start" timestamp (3) with time zone NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_onboarding_quota_buckets_kind_check" CHECK ("channel_onboarding_quota_buckets"."kind" IN ('enrollment', 'model_turn', 'outbound_message')),
	CONSTRAINT "channel_onboarding_quota_buckets_dimension_check" CHECK ((
        "channel_onboarding_quota_buckets"."kind" = 'enrollment'
        AND "channel_onboarding_quota_buckets"."sender_lookup_hash" IS NOT NULL
        AND "channel_onboarding_quota_buckets"."provider_line_id" IS NOT NULL
      ) OR (
        "channel_onboarding_quota_buckets"."kind" IN ('model_turn', 'outbound_message')
        AND "channel_onboarding_quota_buckets"."sender_lookup_hash" IS NULL
        AND "channel_onboarding_quota_buckets"."provider_line_id" IS NULL
      )),
	CONSTRAINT "channel_onboarding_quota_buckets_nonnegative_check" CHECK ("channel_onboarding_quota_buckets"."used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "channel_onboarding_quota_reservations" (
	"operation_key" text PRIMARY KEY NOT NULL,
	"counter_id" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_line_id" text,
	"sender_lookup_hash" text,
	"bucket_start" timestamp (3) with time zone NOT NULL,
	"accepted" boolean NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_onboarding_quota_reservations_kind_check" CHECK ("channel_onboarding_quota_reservations"."kind" IN ('enrollment', 'model_turn', 'outbound_message')),
	CONSTRAINT "channel_onboarding_quota_reservations_quantity_check" CHECK ("channel_onboarding_quota_reservations"."quantity" > 0),
	CONSTRAINT "channel_onboarding_quota_reservations_dimension_check" CHECK ((
        "channel_onboarding_quota_reservations"."kind" = 'enrollment'
        AND "channel_onboarding_quota_reservations"."sender_lookup_hash" IS NOT NULL
        AND "channel_onboarding_quota_reservations"."provider_line_id" IS NOT NULL
      ) OR (
        "channel_onboarding_quota_reservations"."kind" IN ('model_turn', 'outbound_message')
        AND "channel_onboarding_quota_reservations"."sender_lookup_hash" IS NULL
        AND "channel_onboarding_quota_reservations"."provider_line_id" IS NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "channel_onboarding_quota_reservations" ADD CONSTRAINT "channel_onboarding_quota_reservations_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "public"."channel_onboarding_quota_buckets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_quota_buckets_sender_uidx" ON "channel_onboarding_quota_buckets" USING btree ("kind","provider","provider_account_id","provider_line_id","sender_lookup_hash","bucket_start") WHERE "channel_onboarding_quota_buckets"."sender_lookup_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_onboarding_quota_buckets_account_day_uidx" ON "channel_onboarding_quota_buckets" USING btree ("kind","provider","provider_account_id","bucket_start") WHERE "channel_onboarding_quota_buckets"."sender_lookup_hash" IS NULL;--> statement-breakpoint
CREATE INDEX "channel_onboarding_quota_reservations_counter_id_idx" ON "channel_onboarding_quota_reservations" USING btree ("counter_id");--> statement-breakpoint
ALTER TABLE "channel_onboarding_operations" ADD CONSTRAINT "channel_onboarding_operations_direct_payload_check" CHECK ("channel_onboarding_operations"."kind" = 'opening_request' OR "channel_onboarding_operations"."encrypted_payload" IS NOT NULL);