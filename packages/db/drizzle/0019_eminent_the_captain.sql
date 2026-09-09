CREATE TABLE "release_readiness" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"feature_request_id" text NOT NULL,
	"head_sha" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"model" text,
	"ready" boolean DEFAULT false NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "release_readiness" ADD CONSTRAINT "release_readiness_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_readiness" ADD CONSTRAINT "release_readiness_feature_request_id_feature_request_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_request"("id") ON DELETE cascade ON UPDATE no action;