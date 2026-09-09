CREATE TABLE "pull_request" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"merged" boolean DEFAULT false NOT NULL,
	"branch" text NOT NULL,
	"head_sha" text NOT NULL,
	"html_url" text NOT NULL,
	"author_login" text,
	"github_created_at" timestamp,
	"github_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "pull_request_repo_number_unique" UNIQUE("repository_id","number")
);
--> statement-breakpoint
ALTER TABLE "pull_request" ADD CONSTRAINT "pull_request_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request" ADD CONSTRAINT "pull_request_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;