import { randomUUID } from "node:crypto";
import { boolean, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export type ClarificationEntry = {
  question: string;
  answer: string | null;
  askedAt: string;
};

/**
 * The tenant boundary. Shaped to match Better Auth's organization plugin
 * fields (id/name/slug/logo/createdAt/updatedAt) so `betterauth-package` can
 * point the organization model at this table instead of creating a second one.
 */
export const workspace = pgTable("workspace", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  // Bearer token for the public inbound-intake endpoint (/api/ingest), so an
  // email forwarder, support-ticket system, or call-notes tool can drop a
  // request into this workspace without an interactive session.
  ingestToken: text("ingest_token").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

/**
 * A first-class Project: the tenant resource between a workspace and its work.
 * A workspace owns projects; a project groups feature requests (and, through
 * them, their PRDs, tasks, and review history) plus the repositories they're
 * built in. Every workspace has exactly one `isDefault` project, created lazily
 * (see `ensureDefaultProject`) and backfilled for existing workspaces, so the
 * pre-project flow keeps working and no feature request is ever orphaned. Unique
 * on (workspaceId, slug); tenant boundary: only ever read/written by its own
 * workspace.
 */
export const project = pgTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    // Exactly one per workspace; the home every existing/new request falls back
    // to when no project is chosen.
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [unique("project_workspace_slug_unique").on(t.workspaceId, t.slug)],
);

export const featureRequest = pgTable("feature_request", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  // The owning project. Nullable at the column level so the additive migration
  // and any edge insert never break; the app always sets it (the default project
  // when none is chosen), and the backfill attaches every pre-existing request.
  // `set null` over cascade so deleting a project never destroys its requests.
  projectId: text("project_id").references(() => project.id, {
    onDelete: "set null",
  }),
  channel: text("channel").notNull(),
  rawContent: text("raw_content").notNull(),
  status: text("status").notNull().default("requested"),
  clarificationHistory: jsonb("clarification_history")
    .$type<ClarificationEntry[]>()
    .notNull()
    .default([]),
  // Free-text explanation from triage: why a request was marked as already
  // existing ("educate"), or why it was flagged for human attention.
  triageNote: text("triage_note"),
  // Plan-approval gate: who approved the engineering plan (task breakdown) and
  // when. Set only by the explicit human "Approve plan" action — never by AI/auto.
  planApprovedBy: text("plan_approved_by"),
  planApprovedAt: timestamp("plan_approved_at"),
  // "Start development" linkage (set by the explicit user action). The
  // connected repo the feature is built in, its working branch
  // (`throughline/<feature-id>` — the link key for incoming PRs), and who
  // implements it: 'developer' (human / external agent) or 'agent' (Throughline's
  // own coding agent). Repo set null if the repo is later disconnected.
  repositoryId: text("repository_id").references(() => repository.id, {
    onDelete: "set null",
  }),
  developmentBranch: text("development_branch"),
  implementer: text("implementer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

/**
 * A GitHub App installation linked to a workspace. One
 * installation per workspace (`workspaceId` unique) — the workspace admin
 * installs the App on their org/account, and GitHub's post-install callback
 * persists the `installationId` here. Throughline mints per-installation tokens
 * from this id; account login/type are cached for display. Tenant boundary: a
 * workspace only ever reads/uses its own row.
 */
export const githubInstallation = pgTable("github_installation", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .unique()
    .references(() => workspace.id, { onDelete: "cascade" }),
  // GitHub's numeric installation id, stored as text for id-style consistency.
  installationId: text("installation_id").notNull(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull().default("Organization"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

/**
 * A repository a workspace has connected to Throughline. The admin
 * picks one of the installation's accessible repos and we persist its identity
 * here so downstream features (branches, PRs, review) can act on real code. The GitHub
 * `repoId`/`nodeId` are the stable keys (a repo can be renamed); `owner`/`name`
 * and `defaultBranch` come live from the API, never hardcoded. `installationId`
 * is denormalized onto the row so a token can be minted without re-looking up
 * the installation. Tenant boundary: filtered by `workspaceId`, and unique on
 * (workspaceId, repoId) so the same repo can't be connected twice.
 */
export const repository = pgTable(
  "repository",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    // GitHub's numeric installation id (text for id-style consistency), copied
    // from the workspace's github_installation at connect time.
    installationId: text("installation_id").notNull(),
    // GitHub's numeric repo id and GraphQL node id — rename-stable identity.
    repoId: text("repo_id").notNull(),
    nodeId: text("node_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [unique("repository_workspace_repo_unique").on(t.workspaceId, t.repoId)],
);

/**
 * A pull request on a connected repository, ingested live from GitHub webhooks.
 * Never hardcoded — every field comes from a verified `pull_request`
 * delivery. Scoped to the owning workspace + repository (resolved from the
 * installation + repo id on the payload, never client input). Unique on
 * (repositoryId, number) so redelivered/duplicate events upsert one row.
 *
 * `githubUpdatedAt` is the PR's own `updated_at` from GitHub; the upsert only
 * advances a row when an incoming event is at least as new, so out-of-order or
 * late redeliveries can't roll the row back to a stale state/sha.
 */
export const pullRequest = pgTable(
  "pull_request",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repository.id, { onDelete: "cascade" }),
    // Feature ↔ PR link. Set when a PR's head branch matches a feature's
    // `throughline/<feature-id>` (auto-linked on ingest) or by a manual link
    // action. Null = an ingested PR not yet tied to any feature.
    featureRequestId: text("feature_request_id").references(
      () => featureRequest.id,
      { onDelete: "set null" },
    ),
    number: integer("number").notNull(),
    title: text("title").notNull().default(""),
    // GitHub PR state: open | closed (merged is a closed PR with mergedAt set).
    state: text("state").notNull().default("open"),
    merged: boolean("merged").notNull().default(false),
    // head.ref — the source branch; the link key to a Throughline feature later.
    branch: text("branch").notNull(),
    headSha: text("head_sha").notNull(),
    htmlUrl: text("html_url").notNull(),
    authorLogin: text("author_login"),
    githubCreatedAt: timestamp("github_created_at"),
    githubUpdatedAt: timestamp("github_updated_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [unique("pull_request_repo_number_unique").on(t.repositoryId, t.number)],
);

export type DiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  previousFilename?: string;
};

/**
 * A snapshot of a pull request's changed files + unified diff, fetched live from
 * GitHub. One snapshot per PR (`pullRequestId` unique), replaced when the PR's
 * `headSha` advances — `headSha` records which commit the snapshot reflects, so
 * a stale snapshot is detectable. The diff text is capped (`truncated` flags an
 * oversized diff that was cut) to keep the row bounded. Workspace-scoped.
 */
export const pullRequestDiff = pgTable("pull_request_diff", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  pullRequestId: text("pull_request_id")
    .notNull()
    .unique()
    .references(() => pullRequest.id, { onDelete: "cascade" }),
  headSha: text("head_sha").notNull(),
  files: jsonb("files").$type<DiffFile[]>().notNull().default([]),
  additions: integer("additions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
  diff: text("diff").notNull().default(""),
  truncated: boolean("truncated").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

/**
 * One issue the AI QA review raised, anchored to a review dimension. `severity`
 * gates the workflow (blocking findings hold a feature back);
 * `explanation` says why it matters, `recommendation` is the actionable fix.
 * `file`/`line` locate it in the diff when the model could pin it down.
 */
export type ReviewFinding = {
  dimension:
    | "requirements"
    | "acceptance-criteria"
    | "tasks"
    | "security"
    | "performance"
    | "edge-cases"
    | "code-quality";
  severity: "blocking" | "non-blocking";
  title: string;
  explanation: string;
  recommendation: string;
  file: string | null;
  line: number | null;
};

/**
 * An AI QA review of a pull request against its feature's PRD, acceptance
 * criteria, and tasks. One row per review run — keyed loosely to a PR
 * + the exact commit reviewed (`headSha`) so a re-review on new commits appends
 * a fresh run rather than overwriting history. `featureRequestId` is
 * denormalized off the PR so the feature's Review tab reads its latest run
 * without a join. Findings (with blocking/non-blocking severity) and the
 * counts/summary are produced live from the real diff — never hardcoded.
 * `truncated` records that the model worked from a reduced view of an oversized
 * diff. Workspace-scoped.
 */
export const pullRequestReview = pgTable("pull_request_review", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  pullRequestId: text("pull_request_id")
    .notNull()
    .references(() => pullRequest.id, { onDelete: "cascade" }),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequest.id, { onDelete: "cascade" }),
  headSha: text("head_sha").notNull(),
  // pending | running | completed | failed
  status: text("status").notNull().default("pending"),
  model: text("model"),
  summary: text("summary").notNull().default(""),
  blockingCount: integer("blocking_count").notNull().default(0),
  nonBlockingCount: integer("non_blocking_count").notNull().default(0),
  findings: jsonb("findings").$type<ReviewFinding[]>().notNull().default([]),
  truncated: boolean("truncated").notNull().default(false),
  error: text("error"),
  // Posting the review back to the GitHub PR. `postedAt` set
  // once the review (summary + inline comments) is posted — the per-run
  // idempotency key so a redelivery/repeat can't double-post; `postedUrl` links
  // to it; `postError` records the last failed attempt so the UI can offer a
  // retry without corrupting the review itself.
  postedAt: timestamp("posted_at"),
  postedUrl: text("posted_url"),
  postError: text("post_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type ProposalChange = {
  path: string;
  action: "create" | "modify" | "delete";
  oldContent: string;
  newContent: string;
  rationale: string;
};

/**
 * A Throughline coding-agent proposal: AI-generated file changes for a feature,
 * held server-side for human review and NOT committed until confirmed. Status
 * walks generating → ready → committed | rejected (or failed). On confirm the
 * changes are committed to the feature branch and `prNumber`/`prUrl` record the
 * opened PR. `oldContent` is captured at generation time so the review diff is
 * stable. Workspace-scoped.
 */
export const agentProposal = pgTable("agent_proposal", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequest.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("generating"),
  currentStep: text("current_step"),
  summary: text("summary").notNull().default(""),
  changes: jsonb("changes").$type<ProposalChange[]>().notNull().default([]),
  error: text("error"),
  prNumber: integer("pr_number"),
  prUrl: text("pr_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

/**
 * One human release decision on a feature.
 * Each row is an immutable audit entry: a reviewer either approved the release
 * (the feature ships) or rejected it ("request changes", sending it back into
 * the fix loop) with a reason. A feature accumulates several rows across the
 * approve / reject / fix / re-review cycle — the ordered trail
 * (rejected → fixed → re-reviewed → approved) shown on the Approval & Release
 * cockpit. The status transition itself lives on `feature_request`; this table
 * is the durable record of who decided what, when, and why. Workspace-scoped.
 */
export const releaseDecision = pgTable("release_decision", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequest.id, { onDelete: "cascade" }),
  // approved (→ shipped) | rejected (→ changes-requested)
  decision: text("decision").notNull(),
  // The user id of the human reviewer who made the call.
  reviewedBy: text("reviewed_by").notNull(),
  // Required on rejection ("request changes"); optional on approval.
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * AI release-readiness assessment. A persisted, AI-generated verdict
 * on whether a feature is ready to ship, grounded in its PRD, AI review history,
 * and outstanding (non-blocking) findings. One row per assessment run; the
 * latest is the cockpit's headline summary. `headSha` is the commit of the
 * review the verdict was grounded in — the idempotency key (per feature +
 * reviewed commit) so a re-entry on the same commit reuses the assessment.
 */
export const releaseReadiness = pgTable("release_readiness", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequest.id, { onDelete: "cascade" }),
  // The head commit of the review this assessment was grounded in.
  headSha: text("head_sha").notNull(),
  // pending | running | completed | failed
  status: text("status").notNull().default("pending"),
  model: text("model"),
  // The ready / not-ready signal once completed.
  ready: boolean("ready").notNull().default(false),
  // Why the feature is / isn't ready — the actionable rationale, not a score.
  rationale: text("rationale").notNull().default(""),
  // The key risks / outstanding concerns the reviewer should weigh.
  risks: jsonb("risks").$type<string[]>().notNull().default([]),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

/**
 * A workspace's billing/subscription record. One row per
 * workspace (`workspaceId` unique): which plan it's on, the subscription status,
 * and the live usage counters measured against the plan's entitlements. Every
 * workspace gets a Free row automatically (lazily ensured on read and on
 * workspace creation), so the product keeps working with no billing configured.
 *
 * Only the counters that genuinely accumulate live here. `aiReviewCreditsUsed`
 * is a true counter — review runs add to it and it resets each billing cycle
 * (`cycleStart` marks the current window). The connected-repository count is NOT
 * stored: it's derived live from the `repository` table at read time so it can't
 * drift from reality. The Razorpay id columns are nullable now and populated by
 * the checkout flow — additive, so no second migration. Tenant-scoped:
 * a workspace only ever reads/writes its own row.
 */
export const workspaceSubscription = pgTable("workspace_subscription", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .unique()
    .references(() => workspace.id, { onDelete: "cascade" }),
  // The plan key from the static catalog (see plans.ts): free | pro.
  plan: text("plan").notNull().default("free"),
  // Subscription lifecycle: active | past_due | canceled.
  status: text("status").notNull().default("active"),
  // AI review runs consumed in the current billing cycle (reset at cycleStart).
  aiReviewCreditsUsed: integer("ai_review_credits_used").notNull().default(0),
  // Throughline coding-agent runs consumed in the current cycle (reset at
  // cycleStart) — metered the same way as reviews so the agent is usable on
  // Free up to its cap, not gated off entirely.
  aiCodingAgentRunsUsed: integer("ai_coding_agent_runs_used").notNull().default(0),
  // Start of the current billing cycle — the anchor for resetting usage.
  cycleStart: timestamp("cycle_start").notNull().defaultNow(),
  // Razorpay linkage, set by the checkout/webhook flow.
  razorpayCustomerId: text("razorpay_customer_id"),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const workflowRun = pgTable("workflow_run", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(),
  functionName: text("function_name").notNull(),
  status: text("status").notNull().default("pending"),
  currentStep: text("current_step"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const prd = pgTable("prd", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequest.id, { onDelete: "cascade" }),
  problemStatement: text("problem_statement").notNull().default(""),
  goals: jsonb("goals").$type<string[]>().notNull().default([]),
  nonGoals: jsonb("non_goals").$type<string[]>().notNull().default([]),
  userStories: jsonb("user_stories").$type<string[]>().notNull().default([]),
  acceptanceCriteria: jsonb("acceptance_criteria")
    .$type<string[]>()
    .notNull()
    .default([]),
  edgeCases: jsonb("edge_cases").$type<string[]>().notNull().default([]),
  successMetrics: jsonb("success_metrics")
    .$type<string[]>()
    .notNull()
    .default([]),
  status: text("status").notNull().default("drafted"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

/**
 * One engineering work item decomposed from a PRD — the unit that lives on the
 * Kanban board. `featureRequestId` is denormalized (reachable via the
 * PRD) so the board can group/scope without an extra join.
 *
 * `requirementRefs` links the task back to the PRD acceptance criteria / user
 * stories it satisfies (traceability for review). `dependsOn` holds the
 * ids of sibling tasks that should land first — advisory task-on-task
 * sequencing surfaced as a "Blocked by" badge, never an enforced gate.
 */
export const task = pgTable("task", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspace.id, { onDelete: "cascade" }),
  prdId: text("prd_id")
    .notNull()
    .references(() => prd.id, { onDelete: "cascade" }),
  featureRequestId: text("feature_request_id")
    .notNull()
    .references(() => featureRequest.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Board column: todo | in-progress | done
  status: text("status").notNull().default("todo"),
  // Position within the task's status column (ascending).
  orderIndex: integer("order_index").notNull().default(0),
  // Stable 1-based number within the plan, assigned at generation. Unlike
  // orderIndex (which is per-column and shifts on the board), this never
  // changes, so a task can be identified by "#seq" and referenced as a
  // dependency ("blocked by #2, #3").
  seq: integer("seq").notNull().default(0),
  // Origin of the task: 'feature' (decomposed from the PRD plan) or 'fix'
  // (generated from a review's blocking findings — the fix loop). Fix
  // tasks share the feature's PRD and land on the same Kanban board (in todo),
  // but are grouped on the Fixes Plan tab and traced back to the review that
  // produced them via `reviewId`.
  kind: text("kind").notNull().default("feature"),
  reviewId: text("review_id").references(() => pullRequestReview.id, {
    onDelete: "set null",
  }),
  requirementRefs: jsonb("requirement_refs")
    .$type<string[]>()
    .notNull()
    .default([]),
  dependsOn: jsonb("depends_on").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});
