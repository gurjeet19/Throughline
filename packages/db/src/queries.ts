import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "./client";
import {
  agentProposal,
  featureRequest,
  githubInstallation,
  prd,
  project,
  pullRequest,
  pullRequestDiff,
  pullRequestReview,
  releaseDecision,
  releaseReadiness,
  repository,
  task,
  workspace,
  workspaceSubscription,
  workflowRun,
  type ClarificationEntry,
  type DiffFile,
  type ProposalChange,
  type ReviewFinding,
} from "./schema";
import { member, user } from "./auth-schema";
import { DEFAULT_PLAN, getPlan, type PlanKey } from "./plans";

export async function createWorkspace(data: { name: string; slug: string; logo?: string }) {
  const [row] = await db.insert(workspace).values(data).returning();
  return row;
}

export async function getWorkspaceBySlug(slug: string) {
  const [row] = await db.select().from(workspace).where(eq(workspace.slug, slug));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Projects — the tenant resource between a workspace and its feature requests.
// ---------------------------------------------------------------------------

/** The reserved slug of every workspace's auto-created default project. */
const DEFAULT_PROJECT_SLUG = "default";

/** URL/identifier-safe slug from a free-text name (empty → "project"). */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "project";
}

/**
 * Ensure the workspace's default project exists and return it. Mirrors
 * `ensureBilling`: lazy and race-safe — `onConflictDoNothing` on
 * (workspaceId, slug) guards two concurrent reads both seeding it, and the
 * follow-up select returns whichever insert landed. Called from the workspace
 * after-create hook (new workspaces) and on read (pre-existing ones), so every
 * workspace always has a home for its feature requests. Tenant-scoped.
 */
export async function ensureDefaultProject(workspaceId: string) {
  const [existing] = await db
    .select()
    .from(project)
    .where(and(eq(project.workspaceId, workspaceId), eq(project.isDefault, true)))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(project)
    .values({
      workspaceId,
      name: "Default Project",
      slug: DEFAULT_PROJECT_SLUG,
      description: "The default home for this workspace's feature requests.",
      isDefault: true,
    })
    .onConflictDoNothing({ target: [project.workspaceId, project.slug] })
    .returning();
  if (created) return created;

  const [row] = await db
    .select()
    .from(project)
    .where(
      and(
        eq(project.workspaceId, workspaceId),
        eq(project.slug, DEFAULT_PROJECT_SLUG),
      ),
    )
    .limit(1);
  return row;
}

/** Every project in a workspace, default first then oldest-first. Tenant-scoped. */
export async function listProjects(workspaceId: string) {
  return db
    .select()
    .from(project)
    .where(eq(project.workspaceId, workspaceId))
    .orderBy(desc(project.isDefault), asc(project.createdAt));
}

/** A single project, workspace-scoped (null if it belongs elsewhere). */
export async function getProject(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.workspaceId, workspaceId), eq(project.id, id)));
  return row ?? null;
}

/**
 * Create a project with a slug unique within the workspace — a name collision
 * just gets a numeric suffix (`acme`, `acme-2`, …), which also keeps a
 * user-named "Default" from colliding with the reserved default slug.
 * Tenant-scoped.
 */
export async function createProject(
  workspaceId: string,
  data: { name: string; description?: string | null },
) {
  const base = slugify(data.name);
  const rows = await db
    .select({ slug: project.slug })
    .from(project)
    .where(eq(project.workspaceId, workspaceId));
  const taken = new Set(rows.map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  const [row] = await db
    .insert(project)
    .values({
      workspaceId,
      name: data.name,
      slug,
      description: data.description ?? null,
    })
    .returning();
  return row;
}

/**
 * Rename a project (and optionally edit its description). The slug is left
 * stable so existing links never break. Tenant-scoped; returns null if the
 * project belongs to another workspace.
 */
export async function renameProject(
  workspaceId: string,
  id: string,
  data: { name?: string; description?: string | null },
) {
  const [row] = await db
    .update(project)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(project.workspaceId, workspaceId), eq(project.id, id)))
    .returning();
  return row ?? null;
}

/**
 * Every project in a workspace with a live rollup: how many feature requests it
 * owns, how many have shipped vs are still in flight, and how many distinct
 * repositories its work touches. Ensures the default project exists first, then
 * groups the workspace's feature requests in memory (the per-workspace set is
 * small) rather than running a correlated subquery. Tenant-scoped, nothing
 * hardcoded.
 */
export async function listProjectsWithRollup(workspaceId: string) {
  await ensureDefaultProject(workspaceId);
  const projects = await listProjects(workspaceId);
  const features = await db
    .select({
      projectId: featureRequest.projectId,
      status: featureRequest.status,
      repositoryId: featureRequest.repositoryId,
    })
    .from(featureRequest)
    .where(eq(featureRequest.workspaceId, workspaceId));

  return projects.map((p) => {
    const own = features.filter((f) => f.projectId === p.id);
    const shippedCount = own.filter((f) => f.status === "shipped").length;
    const repoIds = new Set(
      own.map((f) => f.repositoryId).filter((id): id is string => Boolean(id)),
    );
    return {
      ...p,
      featureCount: own.length,
      shippedCount,
      inFlightCount: own.length - shippedCount,
      repositoryCount: repoIds.size,
    };
  });
}

/** Feature requests under one project, newest first. Tenant + project scoped. */
export async function listFeatureRequestsByProject(
  workspaceId: string,
  projectId: string,
) {
  return db
    .select()
    .from(featureRequest)
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        eq(featureRequest.projectId, projectId),
      ),
    )
    .orderBy(desc(featureRequest.createdAt));
}

/**
 * The distinct repositories a project's feature requests are built in — the
 * project's "connected repositories" view. Derived from the work itself
 * (`featureRequest.repositoryId`) since repositories are workspace-level.
 * Tenant + project scoped.
 */
export async function listRepositoriesForProject(
  workspaceId: string,
  projectId: string,
) {
  return db
    .selectDistinct({
      id: repository.id,
      owner: repository.owner,
      name: repository.name,
      defaultBranch: repository.defaultBranch,
    })
    .from(repository)
    .innerJoin(
      featureRequest,
      eq(featureRequest.repositoryId, repository.id),
    )
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        eq(featureRequest.projectId, projectId),
      ),
    );
}

export async function getWorkspaceById(id: string) {
  const [row] = await db.select().from(workspace).where(eq(workspace.id, id));
  return row ?? null;
}

/** Resolve the workspace owning a given inbound-intake bearer token. */
export async function getWorkspaceByIngestToken(token: string) {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.ingestToken, token));
  return row ?? null;
}

/** A long, URL-safe-ish opaque token for the inbound-intake endpoint. */
function newIngestToken() {
  return `tl_ingest_${randomUUID().replace(/-/g, "")}`;
}

/**
 * Return the workspace's ingest token, lazily minting one the first time it's
 * requested (workspaces are created by Better Auth, so we can't set it at
 * creation time).
 */
export async function ensureIngestToken(workspaceId: string) {
  const existing = await getWorkspaceById(workspaceId);
  if (existing?.ingestToken) return existing.ingestToken;
  const token = newIngestToken();
  const [row] = await db
    .update(workspace)
    .set({ ingestToken: token, updatedAt: new Date() })
    .where(eq(workspace.id, workspaceId))
    .returning();
  return row?.ingestToken ?? null;
}

/** Rotate the ingest token, invalidating any previously distributed one. */
export async function regenerateIngestToken(workspaceId: string) {
  const token = newIngestToken();
  const [row] = await db
    .update(workspace)
    .set({ ingestToken: token, updatedAt: new Date() })
    .where(eq(workspace.id, workspaceId))
    .returning();
  return row?.ingestToken ?? null;
}

/**
 * Feature requests in a workspace, optionally narrowed to one project (the
 * active-project filter behind the requests view). Tenant-scoped.
 */
export async function listFeatureRequests(workspaceId: string, projectId?: string) {
  return db
    .select()
    .from(featureRequest)
    .where(
      projectId
        ? and(
            eq(featureRequest.workspaceId, workspaceId),
            eq(featureRequest.projectId, projectId),
          )
        : eq(featureRequest.workspaceId, workspaceId),
    );
}

export async function getFeatureRequest(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(featureRequest)
    .where(and(eq(featureRequest.workspaceId, workspaceId), eq(featureRequest.id, id)));
  return row ?? null;
}

export async function createFeatureRequest(
  workspaceId: string,
  data: { channel: string; rawContent: string; projectId?: string },
) {
  const [row] = await db
    .insert(featureRequest)
    .values({ workspaceId, ...data })
    .returning();
  return row;
}

/**
 * Permanently delete a feature request. Its PRD(s) are removed via the
 * `prd.feature_request_id` cascade; `workflow_run` rows link by a plain
 * `entityId` (not a FK), so we clean those up explicitly. Tenant-scoped.
 */
export async function deleteFeatureRequest(workspaceId: string, id: string) {
  await db
    .delete(workflowRun)
    .where(
      and(
        eq(workflowRun.workspaceId, workspaceId),
        eq(workflowRun.entityId, id),
      ),
    );
  const [row] = await db
    .delete(featureRequest)
    .where(
      and(eq(featureRequest.workspaceId, workspaceId), eq(featureRequest.id, id)),
    )
    .returning();
  return row ?? null;
}

/**
 * Advance a feature request's status (and optionally record a triage note).
 * Tenant-scoped: a no-op if the id doesn't belong to the workspace.
 */
export async function updateFeatureRequestStatus(
  workspaceId: string,
  id: string,
  data: { status: string; triageNote?: string | null },
) {
  const [row] = await db
    .update(featureRequest)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(eq(featureRequest.workspaceId, workspaceId), eq(featureRequest.id, id)),
    )
    .returning();
  return row ?? null;
}

/**
 * Human approval of a feature's engineering plan (the plan-approval gate). Advances
 * the request to "plan-approved" and records who/when. Tenant-scoped. Callers
 * must enforce the guards (status === tasks-planned, has tasks) before calling.
 */
export async function approvePlan(
  workspaceId: string,
  id: string,
  approvedBy: string,
) {
  const [row] = await db
    .update(featureRequest)
    .set({
      status: "plan-approved",
      planApprovedBy: approvedBy,
      planApprovedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(eq(featureRequest.workspaceId, workspaceId), eq(featureRequest.id, id)),
    )
    .returning();
  return row ?? null;
}

/**
 * Record a human release decision. Append-only audit entry — the
 * status transition on the feature is performed separately by the caller. The
 * reason is required on rejection ("request changes") and optional on approval;
 * callers enforce that guard. Tenant-scoped.
 */
export async function recordReleaseDecision(
  workspaceId: string,
  data: {
    featureRequestId: string;
    decision: "approved" | "rejected";
    reviewedBy: string;
    reason?: string | null;
  },
) {
  const [row] = await db
    .insert(releaseDecision)
    .values({ workspaceId, ...data })
    .returning();
  return row;
}

/**
 * A feature's release decision history, newest first — the approve/reject trail
 * shown on the Approval & Release cockpit. Tenant-scoped.
 */
export async function listReleaseDecisionsForFeature(
  workspaceId: string,
  featureRequestId: string,
) {
  return db
    .select()
    .from(releaseDecision)
    .where(
      and(
        eq(releaseDecision.workspaceId, workspaceId),
        eq(releaseDecision.featureRequestId, featureRequestId),
      ),
    )
    .orderBy(desc(releaseDecision.createdAt));
}

/**
 * The workspace's release record — every `shipped` feature with the human
 * release decision that shipped it (approver name + when, read from the real
 * `approved` `release_decision`, never inferred from the status) and its linked
 * pull request(s). Powers the Releases view. Newest ship first. Tenant-scoped.
 */
export async function listReleases(workspaceId: string) {
  const features = await db
    .select({
      featureRequestId: featureRequest.id,
      rawContent: featureRequest.rawContent,
      status: featureRequest.status,
      createdAt: featureRequest.createdAt,
      updatedAt: featureRequest.updatedAt,
    })
    .from(featureRequest)
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        eq(featureRequest.status, "shipped"),
      ),
    )
    .orderBy(desc(featureRequest.updatedAt));
  if (features.length === 0) return [];

  const ids = features.map((f) => f.featureRequestId);

  // The approving decision per feature (reviewer + when), joined to the user
  // for a display name. Newest first so the first row seen per feature is the
  // ship decision — the real recorded approver, not guessed from the status.
  const approvals = await db
    .select({
      featureRequestId: releaseDecision.featureRequestId,
      reviewerName: user.name,
      reviewerEmail: user.email,
      decidedAt: releaseDecision.createdAt,
    })
    .from(releaseDecision)
    .leftJoin(user, eq(user.id, releaseDecision.reviewedBy))
    .where(
      and(
        eq(releaseDecision.workspaceId, workspaceId),
        eq(releaseDecision.decision, "approved"),
        inArray(releaseDecision.featureRequestId, ids),
      ),
    )
    .orderBy(desc(releaseDecision.createdAt));

  const approvedBy = new Map<string, (typeof approvals)[number]>();
  for (const a of approvals) {
    if (!approvedBy.has(a.featureRequestId)) approvedBy.set(a.featureRequestId, a);
  }

  const prs = await db
    .select()
    .from(pullRequest)
    .where(
      and(
        eq(pullRequest.workspaceId, workspaceId),
        inArray(pullRequest.featureRequestId, ids),
      ),
    )
    .orderBy(desc(pullRequest.githubUpdatedAt), desc(pullRequest.createdAt));

  const prsByFeature = new Map<string, typeof prs>();
  for (const pr of prs) {
    if (!pr.featureRequestId) continue;
    const list = prsByFeature.get(pr.featureRequestId);
    if (list) list.push(pr);
    else prsByFeature.set(pr.featureRequestId, [pr]);
  }

  return features.map((f) => {
    const a = approvedBy.get(f.featureRequestId);
    return {
      ...f,
      approvedBy: a
        ? { name: a.reviewerName, email: a.reviewerEmail, at: a.decidedAt }
        : null,
      pullRequests: (prsByFeature.get(f.featureRequestId) ?? []).map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        htmlUrl: pr.htmlUrl,
        merged: pr.merged,
        state: pr.state,
      })),
    };
  });
}

// ── Release-readiness assessment ────────────────────────────────────────────

/** Open a new release-readiness assessment run (pending). Tenant-scoped. */
export async function createReleaseReadiness(
  workspaceId: string,
  data: { featureRequestId: string; headSha: string },
) {
  const [row] = await db
    .insert(releaseReadiness)
    .values({ workspaceId, ...data, status: "pending" })
    .returning();
  return row;
}

/** A single assessment run, workspace-scoped (null if it belongs elsewhere). */
export async function getReleaseReadiness(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(releaseReadiness)
    .where(
      and(
        eq(releaseReadiness.workspaceId, workspaceId),
        eq(releaseReadiness.id, id),
      ),
    );
  return row ?? null;
}

/**
 * The latest release-readiness assessment for a feature, or null if none has
 * run — the cockpit's headline readiness summary. Tenant-scoped.
 */
export async function getLatestReleaseReadiness(
  workspaceId: string,
  featureRequestId: string,
) {
  const [row] = await db
    .select()
    .from(releaseReadiness)
    .where(
      and(
        eq(releaseReadiness.workspaceId, workspaceId),
        eq(releaseReadiness.featureRequestId, featureRequestId),
      ),
    )
    .orderBy(desc(releaseReadiness.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * A live or completed assessment for a feature's reviewed commit — the
 * idempotency guard (per feature + reviewed commit). Excludes `failed` so a
 * failed run can be re-triggered. Tenant-scoped.
 */
export async function getActiveReadinessForSha(
  workspaceId: string,
  featureRequestId: string,
  headSha: string,
) {
  const [row] = await db
    .select()
    .from(releaseReadiness)
    .where(
      and(
        eq(releaseReadiness.workspaceId, workspaceId),
        eq(releaseReadiness.featureRequestId, featureRequestId),
        eq(releaseReadiness.headSha, headSha),
        inArray(releaseReadiness.status, ["pending", "running", "completed"]),
      ),
    )
    .orderBy(desc(releaseReadiness.createdAt))
    .limit(1);
  return row ?? null;
}

/** Update an assessment run by id. Used by the release-readiness workflow. */
export async function updateReleaseReadiness(
  id: string,
  data: {
    status?: string;
    model?: string | null;
    ready?: boolean;
    rationale?: string;
    risks?: string[];
    error?: string | null;
  },
) {
  const [row] = await db
    .update(releaseReadiness)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(releaseReadiness.id, id))
    .returning();
  return row ?? null;
}

/**
 * "Start development": tie a plan-approved feature to a connected
 * repo + working branch + chosen implementer, advancing it to
 * `in-development`. Guarded on the current status so it only fires once, by the
 * explicit user action — never an AI step. Tenant-scoped.
 */
export async function startFeatureDevelopment(
  workspaceId: string,
  id: string,
  data: { repositoryId: string; developmentBranch: string; implementer: string },
) {
  const [row] = await db
    .update(featureRequest)
    .set({
      status: "in-development",
      repositoryId: data.repositoryId,
      developmentBranch: data.developmentBranch,
      implementer: data.implementer,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        eq(featureRequest.id, id),
        eq(featureRequest.status, "plan-approved"),
      ),
    )
    .returning();
  return row ?? null;
}

/** Change a feature's recorded implementer (developer ⇄ agent). Tenant-scoped. */
export async function setFeatureImplementer(
  workspaceId: string,
  id: string,
  implementer: string,
) {
  const [row] = await db
    .update(featureRequest)
    .set({ implementer, updatedAt: new Date() })
    .where(
      and(eq(featureRequest.workspaceId, workspaceId), eq(featureRequest.id, id)),
    )
    .returning();
  return row ?? null;
}

/**
 * Advance a feature `in-development → in-review`. Only transitions from
 * `in-development` (a guarded no-op otherwise), so a redelivered or duplicate
 * PR webhook can't bounce a feature backwards or past review. Tenant-scoped.
 */
export async function advanceFeatureToReview(workspaceId: string, id: string) {
  const [row] = await db
    .update(featureRequest)
    .set({ status: "in-review", updatedAt: new Date() })
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        eq(featureRequest.id, id),
        eq(featureRequest.status, "in-development"),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Apply the AI-review gate to a feature. Reads the feature's latest
 * review and, once it has completed, advances the feature to `fix-needed` when
 * that review carries blocking findings or `awaiting-approval` when it carries
 * none. The newest review is authoritative — re-reading it here (rather than
 * trusting a passed-in count) means a late or out-of-order completion settles on
 * the same result.
 *
 * The write is guarded to the review-loop statuses (`in-review`, `fix-needed`,
 * `awaiting-approval`), so a duplicate or stale review completion can't drag a
 * feature out of an unrelated state (e.g. already shipped) or bounce it
 * backwards, while a re-review on a new commit can still reopen the gate — push
 * a fix that introduces a blocking issue and an approval-ready feature returns to
 * `fix-needed`. Concurrent completions resolve to a single authoritative status.
 * Tenant-scoped.
 */
export async function applyReviewGateToFeature(
  workspaceId: string,
  featureRequestId: string,
) {
  const review = await getLatestReviewForFeature(workspaceId, featureRequestId);
  if (!review || review.status !== "completed") return null;
  const target = review.blockingCount > 0 ? "fix-needed" : "awaiting-approval";
  const [row] = await db
    .update(featureRequest)
    .set({ status: target, updatedAt: new Date() })
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        eq(featureRequest.id, featureRequestId),
        inArray(featureRequest.status, [
          "in-review",
          "fix-needed",
          "awaiting-approval",
          // A human rejection (`changes-requested`) reopens the review loop: a
          // clean re-review returns the feature to `awaiting-approval`, a
          // blocking one to `fix-needed`.
          "changes-requested",
        ]),
      ),
    )
    .returning();

  // Mirror the gate on the task board only when the feature actually moved: a
  // cleared review completes the work, blocking findings pull any completed
  // tasks back into progress.
  if (row) {
    if (target === "awaiting-approval") {
      await setTasksStatusForFeature(workspaceId, featureRequestId, "done", [
        "todo",
        "in-progress",
      ]);
    } else {
      await setTasksStatusForFeature(workspaceId, featureRequestId, "in-progress", [
        "done",
      ]);
    }
  }
  return row ?? null;
}

/**
 * Find the feature whose working branch matches a given branch in a repo — the
 * webhook auto-link lookup. Matched on repo + exact `development_branch`, so a
 * PR opened on `throughline/<feature-id>` resolves to its owning feature.
 */
export async function getFeatureByDevelopmentBranch(
  workspaceId: string,
  repositoryId: string,
  branch: string,
) {
  const [row] = await db
    .select()
    .from(featureRequest)
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        eq(featureRequest.repositoryId, repositoryId),
        eq(featureRequest.developmentBranch, branch),
      ),
    );
  return row ?? null;
}

/**
 * Replace the clarification history with a fresh set of AI questions
 * (answers start null). Called when triage decides it needs more context.
 */
export async function setClarificationQuestions(
  workspaceId: string,
  id: string,
  questions: string[],
) {
  const askedAt = new Date().toISOString();
  const existing = await getFeatureRequest(workspaceId, id);
  const history: ClarificationEntry[] = [
    ...(existing?.clarificationHistory ?? []),
    ...questions.map((question) => ({ question, answer: null, askedAt })),
  ];
  const [row] = await db
    .update(featureRequest)
    .set({
      clarificationHistory: history,
      status: "clarifying",
      updatedAt: new Date(),
    })
    .where(
      and(eq(featureRequest.workspaceId, workspaceId), eq(featureRequest.id, id)),
    )
    .returning();
  return row ?? null;
}

/**
 * Fill in the answers to the currently-open (answer === null) clarification
 * questions, matched by question text.
 */
export async function answerClarifications(
  workspaceId: string,
  id: string,
  answers: { question: string; answer: string }[],
) {
  const existing = await getFeatureRequest(workspaceId, id);
  if (!existing) return null;
  const byQuestion = new Map(answers.map((a) => [a.question, a.answer]));
  const history = existing.clarificationHistory.map((entry) =>
    entry.answer === null && byQuestion.has(entry.question)
      ? { ...entry, answer: byQuestion.get(entry.question)! }
      : entry,
  );
  const [row] = await db
    .update(featureRequest)
    .set({ clarificationHistory: history, updatedAt: new Date() })
    .where(
      and(eq(featureRequest.workspaceId, workspaceId), eq(featureRequest.id, id)),
    )
    .returning();
  return row ?? null;
}

/**
 * The workspace's existing requests + drafted PRDs, used as the catalog the
 * AI checks a new request against for duplicate / already-exists detection.
 * Excludes the request being triaged.
 */
export async function getWorkspaceCatalog(
  workspaceId: string,
  excludeRequestId: string,
) {
  const requests = await db
    .select({ rawContent: featureRequest.rawContent, status: featureRequest.status })
    .from(featureRequest)
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        ne(featureRequest.id, excludeRequestId),
      ),
    );
  const prds = await db
    .select({ problemStatement: prd.problemStatement })
    .from(prd)
    .where(eq(prd.workspaceId, workspaceId));
  return { requests, prds };
}

/**
 * All PRDs in the workspace, newest first, each joined to its originating
 * feature request so the list can show a title without an N+1. This is the
 * The catalog of specs ready to be broken into tasks.
 */
export async function listPrds(workspaceId: string) {
  return db
    .select({
      id: prd.id,
      featureRequestId: prd.featureRequestId,
      status: prd.status,
      problemStatement: prd.problemStatement,
      approvedAt: prd.approvedAt,
      createdAt: prd.createdAt,
      updatedAt: prd.updatedAt,
      requestRawContent: featureRequest.rawContent,
      requestStatus: featureRequest.status,
    })
    .from(prd)
    .innerJoin(featureRequest, eq(prd.featureRequestId, featureRequest.id))
    .where(eq(prd.workspaceId, workspaceId))
    .orderBy(desc(prd.createdAt));
}

export async function listPrdsForFeatureRequest(workspaceId: string, featureRequestId: string) {
  return db
    .select()
    .from(prd)
    .where(and(eq(prd.workspaceId, workspaceId), eq(prd.featureRequestId, featureRequestId)));
}

export async function getPrd(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(prd)
    .where(and(eq(prd.workspaceId, workspaceId), eq(prd.id, id)));
  return row ?? null;
}

export async function getLatestPrdForRequest(
  workspaceId: string,
  featureRequestId: string,
) {
  const [row] = await db
    .select()
    .from(prd)
    .where(
      and(
        eq(prd.workspaceId, workspaceId),
        eq(prd.featureRequestId, featureRequestId),
      ),
    )
    .orderBy(desc(prd.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Persist product-owner edits to a PRD's seven sections. Workspace-scoped so a
 * caller can never edit a PRD belonging to another workspace.
 */
export async function updatePrd(
  workspaceId: string,
  id: string,
  data: {
    problemStatement?: string;
    goals?: string[];
    nonGoals?: string[];
    userStories?: string[];
    acceptanceCriteria?: string[];
    edgeCases?: string[];
    successMetrics?: string[];
  },
) {
  const [row] = await db
    .update(prd)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(prd.workspaceId, workspaceId), eq(prd.id, id)))
    .returning();
  return row ?? null;
}

/**
 * Human approval of a drafted PRD. Advances both the PRD and its originating
 * feature request to the approved state, recording who approved and when.
 */
export async function approvePrd(
  workspaceId: string,
  id: string,
  approvedBy: string,
) {
  const [row] = await db
    .update(prd)
    .set({
      status: "approved",
      approvedBy,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(prd.workspaceId, workspaceId), eq(prd.id, id)))
    .returning();
  if (row) {
    await updateFeatureRequestStatus(workspaceId, row.featureRequestId, {
      status: "prd-approved",
    });
  }
  return row ?? null;
}

export async function createPrd(
  workspaceId: string,
  data: {
    featureRequestId: string;
    problemStatement?: string;
    goals?: string[];
    nonGoals?: string[];
    userStories?: string[];
    acceptanceCriteria?: string[];
    edgeCases?: string[];
    successMetrics?: string[];
  },
) {
  const [row] = await db
    .insert(prd)
    .values({ workspaceId, ...data })
    .returning();
  return row;
}

// ── Tasks ───────────────────────────────────────────────────────────────────

/** A PRD's tasks, ordered for board rendering: by column position then age. */
export async function listTasksByPrd(workspaceId: string, prdId: string) {
  return db
    .select()
    .from(task)
    .where(and(eq(task.workspaceId, workspaceId), eq(task.prdId, prdId)))
    .orderBy(asc(task.orderIndex), asc(task.createdAt));
}

/** All tasks for a feature request (across its PRD), board-ordered. */
export async function listTasksByFeatureRequest(
  workspaceId: string,
  featureRequestId: string,
) {
  return db
    .select()
    .from(task)
    .where(
      and(
        eq(task.workspaceId, workspaceId),
        eq(task.featureRequestId, featureRequestId),
      ),
    )
    .orderBy(asc(task.orderIndex), asc(task.createdAt));
}

/**
 * The workspace's engineering plans — feature requests that have been broken
 * into tasks (status `tasks-planned` or `plan-approved`), each with its task
 * tallies and originating request title. This is the Plan page's data source:
 * one row per planned feature, newest first.
 */
export async function listPlans(workspaceId: string) {
  return db
    .select({
      featureRequestId: featureRequest.id,
      prdId: prd.id,
      requestRawContent: featureRequest.rawContent,
      status: featureRequest.status,
      planApprovedAt: featureRequest.planApprovedAt,
      createdAt: featureRequest.createdAt,
      taskCount: sql<number>`cast(count(${task.id}) as int)`,
      doneCount: sql<number>`cast(count(*) filter (where ${task.status} = 'done') as int)`,
    })
    .from(featureRequest)
    .leftJoin(prd, eq(prd.featureRequestId, featureRequest.id))
    .leftJoin(task, eq(task.featureRequestId, featureRequest.id))
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        inArray(featureRequest.status, ["tasks-planned", "plan-approved"]),
      ),
    )
    .groupBy(featureRequest.id, prd.id)
    .orderBy(desc(featureRequest.createdAt));
}

/** A single task, workspace-scoped (null if it belongs to another workspace). */
export async function getTask(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(task)
    .where(and(eq(task.workspaceId, workspaceId), eq(task.id, id)));
  return row ?? null;
}

export async function createTask(
  workspaceId: string,
  data: {
    prdId: string;
    featureRequestId: string;
    title: string;
    description?: string;
    status?: string;
    orderIndex?: number;
    seq?: number;
    kind?: string;
    reviewId?: string;
    requirementRefs?: string[];
    dependsOn?: string[];
  },
) {
  const [row] = await db
    .insert(task)
    .values({ workspaceId, ...data })
    .returning();
  return row;
}

/**
 * Fix tasks already generated for a given review run — the idempotency guard for
 * the fix-task workflow, so a redelivered review/event can't double-generate.
 * Tenant-scoped, board-ordered.
 */
export async function listTasksByReview(workspaceId: string, reviewId: string) {
  return db
    .select()
    .from(task)
    .where(and(eq(task.workspaceId, workspaceId), eq(task.reviewId, reviewId)))
    .orderBy(asc(task.orderIndex), asc(task.createdAt));
}

/**
 * The highest `seq` assigned to any task of a feature, or 0 when none exist.
 * Fix-task generation continues the plan's numbering from here so fix tasks get
 * stable, non-colliding `#seq` identifiers on the same board. Tenant-scoped.
 */
export async function getMaxTaskSeqForFeature(
  workspaceId: string,
  featureRequestId: string,
) {
  const rows = await db
    .select({ seq: task.seq })
    .from(task)
    .where(
      and(
        eq(task.workspaceId, workspaceId),
        eq(task.featureRequestId, featureRequestId),
      ),
    );
  return rows.reduce((max, r) => Math.max(max, r.seq), 0);
}

/**
 * Move a task to a different board column and/or position. Tenant-scoped: a
 * no-op if the id doesn't belong to the workspace.
 */
export async function updateTaskStatus(
  workspaceId: string,
  id: string,
  data: { status?: string; orderIndex?: number },
) {
  const [row] = await db
    .update(task)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(task.workspaceId, workspaceId), eq(task.id, id)))
    .returning();
  return row ?? null;
}

/** Edit a task's author-facing fields. Tenant-scoped. */
export async function updateTask(
  workspaceId: string,
  id: string,
  data: {
    title?: string;
    description?: string;
    requirementRefs?: string[];
  },
) {
  const [row] = await db
    .update(task)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(task.workspaceId, workspaceId), eq(task.id, id)))
    .returning();
  return row ?? null;
}

/**
 * Persist a new board layout: rewrite each task's column (`status`) and
 * position (`orderIndex`) from a client-computed ordering. Each row is updated
 * independently and workspace-scoped, so a task from another workspace (or a
 * stale id) is silently skipped rather than mutated.
 */
export async function reorderTasks(
  workspaceId: string,
  items: { id: string; status: string; orderIndex: number }[],
) {
  const updated = [];
  for (const item of items) {
    const [row] = await db
      .update(task)
      .set({
        status: item.status,
        orderIndex: item.orderIndex,
        updatedAt: new Date(),
      })
      .where(and(eq(task.workspaceId, workspaceId), eq(task.id, item.id)))
      .returning();
    if (row) updated.push(row);
  }
  return updated;
}

/**
 * Set a task's `dependsOn` ids. Used by the generation workflow's second pass,
 * once every task in the batch exists and batch-local keys can be resolved to
 * real ids. Tenant-scoped.
 */
export async function setTaskDependsOn(
  workspaceId: string,
  id: string,
  dependsOn: string[],
) {
  const [row] = await db
    .update(task)
    .set({ dependsOn, updatedAt: new Date() })
    .where(and(eq(task.workspaceId, workspaceId), eq(task.id, id)))
    .returning();
  return row ?? null;
}

/**
 * Drive a feature's task board from its lifecycle state. Bulk-moves the
 * feature's tasks to `toStatus`, optionally only those
 * currently in `fromStatuses`. System-driven — the board is locked to manual
 * edits after plan approval, but the pipeline still advances the columns so the
 * board reads as live progress. Completion is only ever set off a verified
 * feature state (a cleared review), never guessed. Tenant-scoped.
 */
export async function setTasksStatusForFeature(
  workspaceId: string,
  featureRequestId: string,
  toStatus: string,
  fromStatuses?: string[],
) {
  const conditions = [
    eq(task.workspaceId, workspaceId),
    eq(task.featureRequestId, featureRequestId),
  ];
  if (fromStatuses && fromStatuses.length > 0) {
    conditions.push(inArray(task.status, fromStatuses));
  }
  await db
    .update(task)
    .set({ status: toStatus, updatedAt: new Date() })
    .where(and(...conditions));
}

export async function deleteTask(workspaceId: string, id: string) {
  const [row] = await db
    .delete(task)
    .where(and(eq(task.workspaceId, workspaceId), eq(task.id, id)))
    .returning();
  return row ?? null;
}

// ── GitHub installation ─────────────────────────────────────────────────────

/** The workspace's GitHub App installation, or null if not connected. */
export async function getGithubInstallation(workspaceId: string) {
  const [row] = await db
    .select()
    .from(githubInstallation)
    .where(eq(githubInstallation.workspaceId, workspaceId));
  return row ?? null;
}

/**
 * Persist (or refresh) a workspace's GitHub App installation. Keyed by the
 * unique `workspaceId`, so re-installing simply updates the existing row.
 * Tenant-scoped by construction — a row can only ever belong to one workspace.
 */
export async function upsertGithubInstallation(
  workspaceId: string,
  data: { installationId: string; accountLogin: string; accountType: string },
) {
  const [row] = await db
    .insert(githubInstallation)
    .values({ workspaceId, ...data })
    .onConflictDoUpdate({
      target: githubInstallation.workspaceId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/** Disconnect: remove the workspace's installation link. Tenant-scoped. */
export async function deleteGithubInstallation(workspaceId: string) {
  const [row] = await db
    .delete(githubInstallation)
    .where(eq(githubInstallation.workspaceId, workspaceId))
    .returning();
  return row ?? null;
}

// ── Connected repositories ──────────────────────────────────────────────────

/** A workspace's connected repositories, newest first. Tenant-scoped. */
export async function listRepositories(workspaceId: string) {
  return db
    .select()
    .from(repository)
    .where(eq(repository.workspaceId, workspaceId))
    .orderBy(desc(repository.createdAt));
}

/** A single connected repo, workspace-scoped (null if it belongs elsewhere). */
export async function getRepository(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(repository)
    .where(and(eq(repository.workspaceId, workspaceId), eq(repository.id, id)));
  return row ?? null;
}

/**
 * Connect a repository to the workspace. Keyed on (workspaceId, repoId) so
 * re-connecting the same repo refreshes its live fields rather than duplicating.
 * Tenant-scoped by construction.
 */
export async function connectRepository(
  workspaceId: string,
  data: {
    installationId: string;
    repoId: string;
    nodeId: string;
    owner: string;
    name: string;
    defaultBranch: string;
  },
) {
  const [row] = await db
    .insert(repository)
    .values({ workspaceId, ...data })
    .onConflictDoUpdate({
      target: [repository.workspaceId, repository.repoId],
      set: {
        installationId: data.installationId,
        nodeId: data.nodeId,
        owner: data.owner,
        name: data.name,
        defaultBranch: data.defaultBranch,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/** Disconnect a repo (removes the row only; does not uninstall the App). */
export async function deleteRepository(workspaceId: string, id: string) {
  const [row] = await db
    .delete(repository)
    .where(and(eq(repository.workspaceId, workspaceId), eq(repository.id, id)))
    .returning();
  return row ?? null;
}

/**
 * Resolve the connected repository row a webhook delivery belongs to, matched on
 * the installation id + GitHub repo id from the payload. The (installationId,
 * repoId) pair uniquely identifies a workspace's repo (installation is unique
 * per workspace), so this is the trusted server-side mapping from a delivery to
 * its owning workspace — never client input.
 */
export async function getRepositoryByGithubIds(
  installationId: string,
  repoId: string,
) {
  const [row] = await db
    .select()
    .from(repository)
    .where(
      and(
        eq(repository.installationId, installationId),
        eq(repository.repoId, repoId),
      ),
    );
  return row ?? null;
}

// ── Pull requests (webhook-ingested) ────────────────────────────────────────

/**
 * Upsert a pull request from a verified webhook delivery. Keyed on
 * (repositoryId, number) so duplicate/redelivered events touch one row. The
 * upsert is order-tolerant: an existing row is only advanced when the incoming
 * delivery is at least as new as what's stored (`githubUpdatedAt`), so a late
 * or out-of-order redelivery can't roll state/sha backwards.
 */
export async function upsertPullRequest(
  workspaceId: string,
  repositoryId: string,
  data: {
    number: number;
    title: string;
    state: string;
    merged: boolean;
    branch: string;
    headSha: string;
    htmlUrl: string;
    authorLogin: string | null;
    githubCreatedAt: Date | null;
    githubUpdatedAt: Date | null;
  },
) {
  const [row] = await db
    .insert(pullRequest)
    .values({ workspaceId, repositoryId, ...data })
    .onConflictDoUpdate({
      target: [pullRequest.repositoryId, pullRequest.number],
      set: {
        title: data.title,
        state: data.state,
        merged: data.merged,
        branch: data.branch,
        headSha: data.headSha,
        htmlUrl: data.htmlUrl,
        authorLogin: data.authorLogin,
        githubUpdatedAt: data.githubUpdatedAt,
        updatedAt: new Date(),
      },
      // Order-tolerance: skip the update when the stored row is already newer
      // than this delivery (a late/reordered redelivery).
      setWhere: data.githubUpdatedAt
        ? sql`${pullRequest.githubUpdatedAt} is null or ${pullRequest.githubUpdatedAt} <= ${data.githubUpdatedAt}`
        : undefined,
    })
    .returning();
  return row ?? null;
}

/**
 * Tracked pull requests for a connected repo (newest GitHub activity first).
 * Tenant-scoped: the repo must belong to the workspace.
 */
export async function listPullRequests(
  workspaceId: string,
  repositoryId: string,
) {
  return db
    .select()
    .from(pullRequest)
    .where(
      and(
        eq(pullRequest.workspaceId, workspaceId),
        eq(pullRequest.repositoryId, repositoryId),
      ),
    )
    .orderBy(desc(pullRequest.githubUpdatedAt), desc(pullRequest.createdAt));
}

/** A single tracked PR, workspace-scoped (null if it belongs elsewhere). */
export async function getPullRequest(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(pullRequest)
    .where(
      and(eq(pullRequest.workspaceId, workspaceId), eq(pullRequest.id, id)),
    );
  return row ?? null;
}

/** PRs linked to a given feature (newest GitHub activity first). */
export async function listPullRequestsByFeature(
  workspaceId: string,
  featureRequestId: string,
) {
  return db
    .select()
    .from(pullRequest)
    .where(
      and(
        eq(pullRequest.workspaceId, workspaceId),
        eq(pullRequest.featureRequestId, featureRequestId),
      ),
    )
    .orderBy(desc(pullRequest.githubUpdatedAt), desc(pullRequest.createdAt));
}

/**
 * The stored diff snapshot for a PR, or null. Tenant-scoped so a snapshot can
 * only be read within its own workspace.
 */
export async function getPullRequestDiff(
  workspaceId: string,
  pullRequestId: string,
) {
  const [row] = await db
    .select()
    .from(pullRequestDiff)
    .where(
      and(
        eq(pullRequestDiff.workspaceId, workspaceId),
        eq(pullRequestDiff.pullRequestId, pullRequestId),
      ),
    );
  return row ?? null;
}

/**
 * Store (or replace) a PR's diff snapshot. Keyed on the unique `pullRequestId`,
 * so a re-fetch for a new `headSha` overwrites the previous snapshot in place.
 */
export async function upsertPullRequestDiff(
  workspaceId: string,
  pullRequestId: string,
  data: {
    headSha: string;
    files: DiffFile[];
    additions: number;
    deletions: number;
    diff: string;
    truncated: boolean;
  },
) {
  const [row] = await db
    .insert(pullRequestDiff)
    .values({ workspaceId, pullRequestId, ...data })
    .onConflictDoUpdate({
      target: pullRequestDiff.pullRequestId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/** Point a PR at a feature (manual link or webhook auto-link). Tenant-scoped. */
export async function setPullRequestFeature(
  workspaceId: string,
  pullRequestId: string,
  featureRequestId: string | null,
) {
  const [row] = await db
    .update(pullRequest)
    .set({ featureRequestId, updatedAt: new Date() })
    .where(
      and(
        eq(pullRequest.workspaceId, workspaceId),
        eq(pullRequest.id, pullRequestId),
      ),
    )
    .returning();
  return row ?? null;
}

// ── AI pull-request reviews ─────────────────────────────────────────────────

/** Create a review run in the pending state for a specific commit. Tenant-scoped. */
export async function createPullRequestReview(
  workspaceId: string,
  data: {
    pullRequestId: string;
    featureRequestId: string;
    headSha: string;
  },
) {
  const [row] = await db
    .insert(pullRequestReview)
    .values({ workspaceId, ...data, status: "pending" })
    .returning();
  return row;
}

/** A single review run, workspace-scoped (null if it belongs elsewhere). */
export async function getPullRequestReview(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(pullRequestReview)
    .where(
      and(
        eq(pullRequestReview.workspaceId, workspaceId),
        eq(pullRequestReview.id, id),
      ),
    );
  return row ?? null;
}

/**
 * The latest review run for a feature (any of its PRs), newest first — the gate
 * and the Review tab's headline verdict read this.
 */
export async function getLatestReviewForFeature(
  workspaceId: string,
  featureRequestId: string,
) {
  const [row] = await db
    .select()
    .from(pullRequestReview)
    .where(
      and(
        eq(pullRequestReview.workspaceId, workspaceId),
        eq(pullRequestReview.featureRequestId, featureRequestId),
      ),
    )
    .orderBy(desc(pullRequestReview.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * The most recent *completed* review for a feature, excluding one run — the prior
 * round. The re-review uses this to ground itself: it can check whether the last
 * round's findings were actually resolved instead of judging the diff cold every
 * time. `excludeReviewId` skips the current in-flight run. Tenant-scoped.
 */
export async function getPreviousCompletedReviewForFeature(
  workspaceId: string,
  featureRequestId: string,
  excludeReviewId: string,
) {
  const [row] = await db
    .select()
    .from(pullRequestReview)
    .where(
      and(
        eq(pullRequestReview.workspaceId, workspaceId),
        eq(pullRequestReview.featureRequestId, featureRequestId),
        eq(pullRequestReview.status, "completed"),
        ne(pullRequestReview.id, excludeReviewId),
      ),
    )
    .orderBy(desc(pullRequestReview.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * How many completed review rounds a feature has had — the fix-loop counter. The
 * circuit breaker reads this to stop auto-generating fix plans after a cap, so a
 * review that never converges hands control back to a human instead of looping
 * forever. Tenant-scoped.
 */
export async function countCompletedReviewsForFeature(
  workspaceId: string,
  featureRequestId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(pullRequestReview)
    .where(
      and(
        eq(pullRequestReview.workspaceId, workspaceId),
        eq(pullRequestReview.featureRequestId, featureRequestId),
        eq(pullRequestReview.status, "completed"),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Every review run for a feature, newest first — the re-review history. Each
 * pushed fix produces a fresh run, so this is the trail of how findings changed
 * over the fix loop, not just the latest verdict. Tenant-scoped.
 */
export async function listReviewsForFeature(
  workspaceId: string,
  featureRequestId: string,
) {
  return db
    .select()
    .from(pullRequestReview)
    .where(
      and(
        eq(pullRequestReview.workspaceId, workspaceId),
        eq(pullRequestReview.featureRequestId, featureRequestId),
      ),
    )
    .orderBy(desc(pullRequestReview.createdAt));
}

/**
 * The workspace's review queue (the review cockpit): every feature currently
 * in the review loop — `in-review`, `fix-needed`, `awaiting-approval`, or
 * `changes-requested` (rejected, back in the fix loop) — paired with its latest
 * review's verdict. Two small queries (the in-loop features, then their reviews)
 * instead of a correlated subquery; this set is always small. Tenant-scoped.
 */
export async function listReviewQueue(workspaceId: string) {
  const features = await db
    .select({
      featureRequestId: featureRequest.id,
      rawContent: featureRequest.rawContent,
      status: featureRequest.status,
      createdAt: featureRequest.createdAt,
      updatedAt: featureRequest.updatedAt,
    })
    .from(featureRequest)
    .where(
      and(
        eq(featureRequest.workspaceId, workspaceId),
        inArray(featureRequest.status, [
          "in-review",
          "fix-needed",
          "awaiting-approval",
          "changes-requested",
        ]),
      ),
    );
  if (features.length === 0) return [];

  const ids = features.map((f) => f.featureRequestId);
  const reviews = await db
    .select()
    .from(pullRequestReview)
    .where(
      and(
        eq(pullRequestReview.workspaceId, workspaceId),
        inArray(pullRequestReview.featureRequestId, ids),
      ),
    )
    .orderBy(desc(pullRequestReview.createdAt));

  const latest = new Map<string, (typeof reviews)[number]>();
  for (const r of reviews) {
    if (!latest.has(r.featureRequestId)) latest.set(r.featureRequestId, r);
  }

  return features.map((f) => {
    const r = latest.get(f.featureRequestId);
    return {
      ...f,
      review: r
        ? {
            status: r.status,
            blockingCount: r.blockingCount,
            nonBlockingCount: r.nonBlockingCount,
            createdAt: r.createdAt,
            postedAt: r.postedAt,
          }
        : null,
    };
  });
}

/**
 * An in-flight or completed review for a PR at an exact commit, if one exists —
 * the idempotency check that stops a redelivered/duplicate trigger from starting
 * a second review for the same code. A `failed` run is ignored so it can be
 * retried.
 */
export async function getActiveReviewForSha(
  workspaceId: string,
  pullRequestId: string,
  headSha: string,
) {
  const [row] = await db
    .select()
    .from(pullRequestReview)
    .where(
      and(
        eq(pullRequestReview.workspaceId, workspaceId),
        eq(pullRequestReview.pullRequestId, pullRequestId),
        eq(pullRequestReview.headSha, headSha),
        inArray(pullRequestReview.status, ["pending", "running", "completed"]),
      ),
    )
    .orderBy(desc(pullRequestReview.createdAt))
    .limit(1);
  return row ?? null;
}

/** Update a review run by id. Used by the review workflow and PR-posting. */
export async function updatePullRequestReview(
  id: string,
  data: {
    status?: string;
    model?: string | null;
    summary?: string;
    blockingCount?: number;
    nonBlockingCount?: number;
    findings?: ReviewFinding[];
    truncated?: boolean;
    error?: string | null;
    postedAt?: Date | null;
    postedUrl?: string | null;
    postError?: string | null;
  },
) {
  const [row] = await db
    .update(pullRequestReview)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(pullRequestReview.id, id))
    .returning();
  return row ?? null;
}

// ── Coding-agent proposals ──────────────────────────────────────────────────

/** Create a fresh proposal in the generating state. Tenant-scoped. */
export async function createAgentProposal(
  workspaceId: string,
  featureRequestId: string,
) {
  const [row] = await db
    .insert(agentProposal)
    .values({ workspaceId, featureRequestId, status: "generating" })
    .returning();
  return row;
}

/** The latest proposal for a feature, or null. Tenant-scoped. */
export async function getLatestAgentProposal(
  workspaceId: string,
  featureRequestId: string,
) {
  const [row] = await db
    .select()
    .from(agentProposal)
    .where(
      and(
        eq(agentProposal.workspaceId, workspaceId),
        eq(agentProposal.featureRequestId, featureRequestId),
      ),
    )
    .orderBy(desc(agentProposal.createdAt))
    .limit(1);
  return row ?? null;
}

/** A single proposal, workspace-scoped (null if it belongs elsewhere). */
export async function getAgentProposal(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(agentProposal)
    .where(
      and(eq(agentProposal.workspaceId, workspaceId), eq(agentProposal.id, id)),
    );
  return row ?? null;
}

/** Update a proposal by id. Used by the generation workflow and confirm/reject. */
export async function updateAgentProposal(
  id: string,
  data: {
    status?: string;
    currentStep?: string | null;
    summary?: string;
    changes?: ProposalChange[];
    error?: string | null;
    prNumber?: number | null;
    prUrl?: string | null;
  },
) {
  const [row] = await db
    .update(agentProposal)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(agentProposal.id, id))
    .returning();
  return row ?? null;
}

/**
 * Mark a feature's still-open proposals (generating/ready) as rejected — called
 * before a regenerate so only the newest proposal is ever active. Tenant-scoped.
 */
export async function supersedeAgentProposals(
  workspaceId: string,
  featureRequestId: string,
) {
  await db
    .update(agentProposal)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(
      and(
        eq(agentProposal.workspaceId, workspaceId),
        eq(agentProposal.featureRequestId, featureRequestId),
        inArray(agentProposal.status, ["generating", "ready"]),
      ),
    );
}

/** The caller's role within a workspace (owner/admin/member), or null. */
export async function getWorkspaceMemberRole(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, workspaceId), eq(member.userId, userId)),
    );
  return row?.role ?? null;
}

export async function createWorkflowRun(
  workspaceId: string,
  data: { entityId: string; entityType: string; functionName: string },
) {
  const [row] = await db
    .insert(workflowRun)
    .values({ workspaceId, ...data })
    .returning();
  return row;
}

export async function getWorkflowRunByEntityId(workspaceId: string, entityId: string) {
  const [row] = await db
    .select()
    .from(workflowRun)
    .where(and(eq(workflowRun.workspaceId, workspaceId), eq(workflowRun.entityId, entityId)))
    .orderBy(desc(workflowRun.createdAt))
    .limit(1);
  return row ?? null;
}

export async function updateWorkflowRun(
  id: string,
  data: { status?: string; currentStep?: string | null },
) {
  const [row] = await db
    .update(workflowRun)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(workflowRun.id, id))
    .returning();
  return row;
}

// ── Billing: subscription, entitlements & usage ─────────────────────────────

/**
 * The workspace's billing record, lazily creating a Free row the first time
 * it's read so every workspace — new or pre-existing — always has one (mirrors
 * how `ensureIngestToken` backfills on demand). Idempotent and tenant-scoped.
 */
export async function ensureBilling(workspaceId: string) {
  const [existing] = await db
    .select()
    .from(workspaceSubscription)
    .where(eq(workspaceSubscription.workspaceId, workspaceId));
  if (existing) return existing;

  // onConflictDoNothing guards the race where two concurrent reads both try to
  // seed the row; the follow-up select then returns whichever one landed.
  const [created] = await db
    .insert(workspaceSubscription)
    .values({ workspaceId, plan: DEFAULT_PLAN })
    .onConflictDoNothing({ target: workspaceSubscription.workspaceId })
    .returning();
  if (created) return created;

  const [row] = await db
    .select()
    .from(workspaceSubscription)
    .where(eq(workspaceSubscription.workspaceId, workspaceId));
  return row;
}

/**
 * A workspace's billing status plus the entitlements of its current plan
 * (resolved from the static plan catalog). The single read the billing UI and
 * enforcement need to know "what plan, what status, what's allowed". Ensures a
 * Free record exists first. Tenant-scoped.
 */
export async function getBillingStatus(workspaceId: string) {
  const subscription = await ensureBilling(workspaceId);
  const plan = getPlan(subscription.plan);
  return { subscription, plan, entitlements: plan.entitlements };
}

/**
 * A workspace's current usage measured against its plan's entitlements: AI
 * review credits used/remaining and connected repositories used/remaining. The
 * repository count is derived live from the `repository` table (never a stored
 * counter, so it can't drift); credits come from the subscription counter.
 * `remaining` is clamped at 0. Tenant-scoped.
 */
export async function getBillingUsage(workspaceId: string) {
  const { subscription, entitlements } = await getBillingStatus(workspaceId);

  const [repoRow] = await db
    .select({ count: sql<number>`cast(count(${repository.id}) as int)` })
    .from(repository)
    .where(eq(repository.workspaceId, workspaceId));
  const repositoryCount = repoRow?.count ?? 0;

  const aiReviewCreditsUsed = subscription.aiReviewCreditsUsed;
  const aiCodingAgentRunsUsed = subscription.aiCodingAgentRunsUsed;
  return {
    aiReviewCredits: {
      used: aiReviewCreditsUsed,
      limit: entitlements.aiReviewCredits,
      remaining: Math.max(0, entitlements.aiReviewCredits - aiReviewCreditsUsed),
    },
    aiCodingAgentCredits: {
      used: aiCodingAgentRunsUsed,
      limit: entitlements.aiCodingAgentCredits,
      remaining: Math.max(
        0,
        entitlements.aiCodingAgentCredits - aiCodingAgentRunsUsed,
      ),
    },
    repositories: {
      used: repositoryCount,
      limit: entitlements.repositoryLimit,
      remaining: Math.max(0, entitlements.repositoryLimit - repositoryCount),
    },
    cycleStart: subscription.cycleStart,
  };
}

/**
 * Increment a workspace's consumed AI review credits (default +1), atomically at
 * the database so concurrent review starts can't lose a count. Ensures the Free
 * record exists first. Returns the updated row. Tenant-scoped.
 */
export async function incrementAiReviewCreditsUsed(workspaceId: string, by = 1) {
  await ensureBilling(workspaceId);
  const [row] = await db
    .update(workspaceSubscription)
    .set({
      aiReviewCreditsUsed: sql`${workspaceSubscription.aiReviewCreditsUsed} + ${by}`,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSubscription.workspaceId, workspaceId))
    .returning();
  return row;
}

/**
 * Decrement a workspace's consumed AI review credits (default -1), clamped at 0
 * so a refund/rollback can't drive the counter negative. Atomic and
 * tenant-scoped. Returns the updated row.
 */
export async function decrementAiReviewCreditsUsed(workspaceId: string, by = 1) {
  await ensureBilling(workspaceId);
  const [row] = await db
    .update(workspaceSubscription)
    .set({
      aiReviewCreditsUsed: sql`greatest(0, ${workspaceSubscription.aiReviewCreditsUsed} - ${by})`,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSubscription.workspaceId, workspaceId))
    .returning();
  return row;
}

/**
 * Increment a workspace's consumed coding-agent runs (default +1), atomically so
 * concurrent agent starts can't lose a count. Ensures the Free record exists
 * first. Returns the updated row. Tenant-scoped.
 */
export async function incrementAiCodingAgentRunsUsed(workspaceId: string, by = 1) {
  await ensureBilling(workspaceId);
  const [row] = await db
    .update(workspaceSubscription)
    .set({
      aiCodingAgentRunsUsed: sql`${workspaceSubscription.aiCodingAgentRunsUsed} + ${by}`,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSubscription.workspaceId, workspaceId))
    .returning();
  return row;
}

/**
 * Decrement a workspace's consumed coding-agent runs (default -1), clamped at 0
 * so a refund/rollback can't drive the counter negative. Atomic and
 * tenant-scoped. Returns the updated row.
 */
export async function decrementAiCodingAgentRunsUsed(workspaceId: string, by = 1) {
  await ensureBilling(workspaceId);
  const [row] = await db
    .update(workspaceSubscription)
    .set({
      aiCodingAgentRunsUsed: sql`greatest(0, ${workspaceSubscription.aiCodingAgentRunsUsed} - ${by})`,
      updatedAt: new Date(),
    })
    .where(eq(workspaceSubscription.workspaceId, workspaceId))
    .returning();
  return row;
}

/**
 * Update a workspace's plan/status and Razorpay linkage — the write the later
 * checkout + webhook flow uses when a subscription is created or changes state.
 * Passing `cycleStart` resets the usage window (a fresh cycle zeroes credits).
 * Ensures the Free record exists first. Tenant-scoped.
 */
export async function updateWorkspaceSubscription(
  workspaceId: string,
  data: {
    plan?: PlanKey;
    status?: string;
    razorpayCustomerId?: string | null;
    razorpaySubscriptionId?: string | null;
    cycleStart?: Date;
    resetUsage?: boolean;
  },
) {
  await ensureBilling(workspaceId);
  const { resetUsage, ...rest } = data;
  const [row] = await db
    .update(workspaceSubscription)
    .set({
      ...rest,
      ...(resetUsage
        ? { aiReviewCreditsUsed: 0, aiCodingAgentRunsUsed: 0 }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(workspaceSubscription.workspaceId, workspaceId))
    .returning();
  return row;
}
