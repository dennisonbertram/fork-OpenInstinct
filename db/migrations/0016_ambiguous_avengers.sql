ALTER TABLE "api_idempotency_keys" ADD COLUMN "lease_expires_at" text;--> statement-breakpoint
UPDATE "api_idempotency_keys"
SET "lease_expires_at" = ("created_at"::timestamptz + interval '5 minutes')::text
WHERE "lease_expires_at" IS NULL;
