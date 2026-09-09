CREATE TABLE "workspace_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ai_review_credits_used" integer DEFAULT 0 NOT NULL,
	"cycle_start" timestamp DEFAULT now() NOT NULL,
	"razorpay_customer_id" text,
	"razorpay_subscription_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "workspace_subscription_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_subscription" ADD CONSTRAINT "workspace_subscription_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;