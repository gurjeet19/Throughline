ALTER TABLE "workspace" ADD COLUMN "ingest_token" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_ingest_token_unique" UNIQUE("ingest_token");