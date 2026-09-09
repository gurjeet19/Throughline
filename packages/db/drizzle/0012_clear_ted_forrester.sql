CREATE TABLE "pull_request_diff" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"pull_request_id" text NOT NULL,
	"head_sha" text NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"diff" text DEFAULT '' NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "pull_request_diff_pull_request_id_unique" UNIQUE("pull_request_id")
);
--> statement-breakpoint
ALTER TABLE "pull_request_diff" ADD CONSTRAINT "pull_request_diff_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_diff" ADD CONSTRAINT "pull_request_diff_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE cascade ON UPDATE no action;