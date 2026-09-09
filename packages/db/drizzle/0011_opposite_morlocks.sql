ALTER TABLE "feature_request" ADD COLUMN "repository_id" text;--> statement-breakpoint
ALTER TABLE "feature_request" ADD COLUMN "development_branch" text;--> statement-breakpoint
ALTER TABLE "feature_request" ADD COLUMN "implementer" text;--> statement-breakpoint
ALTER TABLE "pull_request" ADD COLUMN "feature_request_id" text;--> statement-breakpoint
ALTER TABLE "feature_request" ADD CONSTRAINT "feature_request_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request" ADD CONSTRAINT "pull_request_feature_request_id_feature_request_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_request"("id") ON DELETE set null ON UPDATE no action;