ALTER TABLE "task" ADD COLUMN "kind" text DEFAULT 'feature' NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "review_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_review_id_pull_request_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."pull_request_review"("id") ON DELETE set null ON UPDATE no action;