-- Custom SQL migration file, put your code below! --

-- Backfill so the project layer is invisible to pre-existing data: every
-- workspace gets a default project, and every feature request is attached to its
-- workspace's default project so no row is left orphaned.

-- 1. Create a default project for every workspace that doesn't already have one.
INSERT INTO "project" ("id", "workspace_id", "name", "slug", "description", "is_default")
SELECT gen_random_uuid()::text,
       w."id",
       'Default Project',
       'default',
       'The default home for this workspace''s feature requests.',
       true
FROM "workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "project" p
  WHERE p."workspace_id" = w."id" AND p."is_default" = true
);
--> statement-breakpoint
-- 2. Attach every project-less feature request to its workspace's default project.
UPDATE "feature_request" fr
SET "project_id" = p."id"
FROM "project" p
WHERE p."workspace_id" = fr."workspace_id"
  AND p."is_default" = true
  AND fr."project_id" IS NULL;
