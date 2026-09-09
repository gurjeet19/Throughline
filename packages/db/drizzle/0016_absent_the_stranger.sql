ALTER TABLE "pull_request_review" ADD COLUMN "posted_at" timestamp;--> statement-breakpoint
ALTER TABLE "pull_request_review" ADD COLUMN "posted_url" text;--> statement-breakpoint
ALTER TABLE "pull_request_review" ADD COLUMN "post_error" text;