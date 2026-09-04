CREATE TABLE "vault_import_batches" (
	"workspace_id" text NOT NULL,
	"batch_key" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "vault_import_batches_pkey" PRIMARY KEY("workspace_id","batch_key")
);
--> statement-breakpoint
ALTER TABLE "vault_import_batches" ADD CONSTRAINT "vault_import_batches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;