CREATE TABLE "release_decision" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"feature_request_id" text NOT NULL,
	"decision" text NOT NULL,
	"reviewed_by" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "release_decision" ADD CONSTRAINT "release_decision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_decision" ADD CONSTRAINT "release_decision_feature_request_id_feature_request_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_request"("id") ON DELETE cascade ON UPDATE no action;