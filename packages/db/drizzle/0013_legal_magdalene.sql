CREATE TABLE "agent_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"feature_request_id" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"current_step" text,
	"summary" text DEFAULT '' NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"pr_number" integer,
	"pr_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agent_proposal" ADD CONSTRAINT "agent_proposal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposal" ADD CONSTRAINT "agent_proposal_feature_request_id_feature_request_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_request"("id") ON DELETE cascade ON UPDATE no action;