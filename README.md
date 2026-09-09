# Throughline (ShipFlow AI)

An AI-assisted product delivery platform that carries a feature through one
connected, human-in-the-loop workflow:

**Request → Product Thinking → PRD → Tasks → Code → AI Review → Fixes →
Re-Review → Human Approval → Shipped**

Built for the ChaiCode Hackathon.

---

## Project Overview

AI can write code fast, but great software ships through *process*. Throughline
manages the full software-delivery lifecycle for a product/engineering team:

- **Product Discovery** — a request arrives through any channel (manual form,
  email, support ticket, customer call, or the public ingest API). An AI agent
  gathers missing context with follow-up questions, detects duplicates (and
  educates when the capability already exists), then drafts a structured PRD
  (problem, goals, non-goals, user stories, acceptance criteria, edge cases,
  success metrics) for human review/approval.
- **Planning** — the approved PRD is decomposed into engineering tasks on a
  drag-and-drop Kanban board, gated by an explicit human plan approval.
- **Development** — the feature is linked to a GitHub repository on a working
  branch. A human developer *or* the Throughline coding agent implements it and
  opens a pull request.
- **AI Review Loop** — a QA agent reviews the PR diff against requirements,
  acceptance criteria, tasks, security, performance, edge cases, and code
  quality, classifying each finding **blocking** or **non-blocking**. Blocking
  findings send the feature to `fix-needed`, become a remediation plan, get
  fixed, and the PR is re-reviewed — looping until it converges (with a
  circuit breaker so the loop always hands back to a human if it can't).
- **Human Approval & Release** — a person verifies the PRD, tasks, PR, AI review
  history, and outstanding issues, then approves or requests changes. Only an
  approved feature can move to **Shipped**.

The platform is a multi-tenant SaaS: each workspace has its own users,
projects, repositories, feature requests, PRDs, tasks, review history, and
billing status. Everything is grounded in live data — no hardcoded PRs or
reviews.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript |
| Monorepo | Turborepo + pnpm workspaces |
| UI | Tailwind CSS v4 · shadcn/ui |
| API | tRPC v11 (no REST/GraphQL) |
| Auth | Better Auth (+ organization plugin = workspaces) |
| Database | PostgreSQL (Neon) via Drizzle ORM |
| AI | Vercel AI SDK + `@ai-sdk/openai` |
| Async workflows | Inngest (durable, step-based) |
| GitHub | Octokit GitHub App (`@octokit/auth-app` + `@octokit/webhooks`) |
| Payments | Razorpay |
| Email | Resend (workspace invitations) |
| Deployment | Vercel |

---

## Architecture

A Turborepo monorepo: one Next.js app plus typed workspace packages.

```
apps/web/                     Next.js App Router — the product
  app/dashboard/              authenticated app (requests, prds, plans, projects,
                              reviews, releases, billing, settings)
  app/api/                    inngest serve, github callback + webhooks,
                              razorpay webhook, public ingest endpoint
  components/                 ui/ (shadcn primitives) + app/ (product components)
  inngest/                    Inngest client + workflow functions

packages/api/                 tRPC v11 — routers, context, middleware, auth,
                              Inngest event triggers, Razorpay/GitHub job kickoffs
packages/db/                  Drizzle schema, typed query helpers, Neon client,
                              migrations, plan/entitlement catalog
packages/ai/                  AI SDK helpers — triage, prd, tasks, codegen,
                              review, fix-tasks, release-readiness
packages/github/              Octokit App auth, webhook verify, repo/diff/PR ops
packages/billing/             Razorpay client + webhook signature verification
```

**Request flow:** the browser calls tRPC procedures (`packages/api`), which run
typed, tenant-scoped queries (`packages/db`) and enqueue durable background work
via Inngest. AI and GitHub side effects happen inside Inngest functions, never
inline in a request. State transitions are driven by a feature state machine:

```
requested → clarifying → prd-drafted → prd-approved → tasks-planned →
plan-approved → in-development → in-review → (fix-needed ⇄ awaiting-approval) →
shipped     (changes-requested on human reject)
```

**Multi-tenancy:** every `protectedProcedure` resolves `ctx.workspaceId` from the
session; all user-data queries are filtered by `workspaceId` in the tRPC
middleware, never trusting the client.

---

## Setup Instructions

**Prerequisites:** Node 20+, pnpm 11, a Neon Postgres database, an OpenAI API
key. (GitHub App, Razorpay, Google OAuth, and Resend are optional — the app
boots without them and shows the relevant features as "not configured".)

```bash
# 1. Install
pnpm install

# 2. Configure env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
#    fill in DATABASE_URL, BETTER_AUTH_SECRET, OPENAI_API_KEY (see below)

# 3. Apply database migrations
cd packages/db
pnpm db:migrate           # or: pnpm db:generate after schema changes
cd ../..

# 4. Run the app
pnpm dev                  # Turborepo: all apps + packages in watch mode

# 5. (separate terminal) Run Inngest locally so workflows fire
npx inngest-cli@latest dev
```

Open <http://localhost:3000>.

Useful commands: `pnpm build` (full monorepo build), `pnpm lint`, and from
`packages/db`: `pnpm db:generate` / `pnpm db:migrate`.

---

## Environment Variables

Set these in `apps/web/.env` for local dev (and in Vercel for deployment).
`DATABASE_URL` is also needed in `packages/db/.env` for migrations.

### Required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (`?sslmode=require`) |
| `BETTER_AUTH_SECRET` | Auth signing secret (32-byte hex) |
| `BETTER_AUTH_URL` | App base URL (`http://localhost:3000` locally; production URL on Vercel) |
| `OPENAI_API_KEY` | Powers all AI features |
| `INNGEST_EVENT_KEY` | Inngest (production) |
| `INNGEST_SIGNING_KEY` | Inngest (production) |

### GitHub integration

| Variable | Purpose |
|---|---|
| `GITHUB_APP_ID` | GitHub App id |
| `GITHUB_APP_PRIVATE_KEY` | App `.pem`, one line with literal `\n` between lines |
| `GITHUB_APP_CLIENT_ID` | OAuth client id |
| `GITHUB_APP_CLIENT_SECRET` | OAuth client secret |
| `GITHUB_WEBHOOK_SECRET` | Verifies incoming webhook signatures |

### Billing (Razorpay)

| Variable | Purpose |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay key id |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies Razorpay webhook signatures |

### Optional

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `RESEND_API_KEY` | Send invitation emails (link is shown in-app without it) |
| `INVITE_FROM_EMAIL` | From-address for invitations |
| `AI_MODEL_TRIAGE` / `AI_MODEL_PRD` / `AI_MODEL_TASKS` / `AI_MODEL_CODEGEN` / `AI_MODEL_REVIEW` / `AI_MODEL_RELEASE_READINESS` | Override default model IDs (default `gpt-4o`) |
| `INNGEST_DEV` | Local-only flag (`1`). Do **not** set in production. |

---

## Database Schema Notes

Drizzle ORM → Neon Postgres. Schema in `packages/db/src/schema.ts`; typed query
helpers in `queries.ts` (no raw SQL in routers); migrations in
`packages/db/drizzle/`.

Core tables (all tenant-scoped by `workspace_id`):

| Table | Role |
|---|---|
| `workspace` | The tenant boundary (maps to Better Auth organization) |
| `project` | Groups feature requests within a workspace; every workspace has one default project |
| `repository` | A connected GitHub repo (rename-stable via repo/node id) |
| `feature_request` | A request through the pipeline; carries `project_id`, status, channel, clarification history, repo/branch/implementer |
| `prd` | Generated PRD for a request (problem/goals/non-goals/stories/AC/edge cases/metrics) |
| `task` | Engineering or fix task (`kind`), Kanban status, order, dependencies, requirement refs |
| `github_installation` | One GitHub App installation per workspace |
| `pull_request` | PRs ingested from webhooks (unique on repo + number) |
| `pull_request_diff` | Cached changed-files + unified diff snapshot per head commit |
| `pull_request_review` | One AI review run: findings, blocking/non-blocking counts, summary |
| `agent_proposal` | Coding-agent file changes held for human review before commit |
| `release_readiness` | AI ship/no-ship assessment per reviewed commit |
| `release_decision` | Immutable human approve/reject audit entries |
| `workspace_subscription` | Plan, status, and usage counters (AI review/agent credits) |
| `workflow_run` | Progress rows for Inngest functions (per entity), for live UI |

Conventions: ids are UUID text; `created_at`/`updated_at` timestamps;
multi-tenant isolation enforced in the tRPC middleware; plan limits live as a
typed catalog in `packages/db/src/plans.ts`. Auth tables (`user`, `session`,
`account`, `verification`, `member`, `invitation`) live in `auth-schema.ts`.

Backfill example: introducing `project` added a default project per workspace
and attached every existing feature request via a custom migration, so no row is
orphaned.

---

## GitHub Integration Setup

Throughline uses a **GitHub App** (per-installation tokens via Octokit — never
personal tokens). Hardcoded PR data is not used; every PR/diff/review comes from
the live API or verified webhooks.

1. Register an app at **github.com/settings/apps/new**.
2. **Setup URL:** `${BETTER_AUTH_URL}/api/github/callback`
   **Webhook URL:** `${BETTER_AUTH_URL}/api/github/webhooks`
   **Webhook secret:** set it and copy into `GITHUB_WEBHOOK_SECRET`.
3. Permissions: repository **Contents** (read/write — branches & commits),
   **Pull requests** (read/write), **Metadata** (read).
   Subscribe to the **Pull request** event.
4. Download the private key (`.pem`) and set the env vars (`GITHUB_APP_ID`,
   `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`).
5. In the app: **Settings → GitHub → Connect** installs the App, then pick a
   repository to connect to the workspace.

What it does: connect repositories, receive signature-verified webhooks, track
pull requests, fetch changed files + diffs, run AI reviews, post review comments
back to the PR, and track review status. A PR opened on a feature's
`throughline/<feature-id>` branch auto-links to the feature and advances it to
`in-review`; new commits (`synchronize`) trigger an automatic re-review.

---

## Inngest Workflow Explanation

Durable, step-based background work lives in `apps/web/inngest/functions/` and is
served at `app/api/inngest`. tRPC mutations enqueue events; each function is
idempotent (keyed on the entity/commit) and reports progress through
`workflow_run` rows that the UI polls. Locally, run `npx inngest-cli@latest dev`.

| Function | Trigger | What it does |
|---|---|---|
| `process-request` | Request submitted / clarifications answered | Triage: ask clarifying questions, detect duplicates, then draft the PRD |
| `generate-tasks` | PRD approved | Decompose the PRD into engineering tasks on the board |
| `generate-code` | Coding agent run requested | Read PRD + tasks + repo and produce a held proposal (committed only on human confirm) |
| `fetch-pr-diff` | New PR / new commit | Snapshot changed files + unified diff for the head commit |
| `review-pull-request` | PR opened / synchronized | AI QA review across all 7 dimensions; gate the feature; ground re-reviews in prior findings; circuit breaker on the fix loop |
| `generate-fix-tasks` | Review with blocking findings | Turn blocking findings into a remediation plan (fix tasks) |
| `release-readiness` | Feature reaches awaiting-approval | AI ship/no-ship assessment grounded in PRD + review history |

The fix loop — review → `fix-needed` → fix → push → re-review — runs
automatically off GitHub webhooks, converges via prior-findings grounding, and a
round-cap circuit breaker hands control back to a human if it can't converge.

---

## AI Features Implemented

All AI runs through `packages/ai` (Vercel AI SDK + OpenAI, structured outputs
via Zod schemas). Models are configurable per task via `AI_MODEL_*` env vars.

- **Triage & clarification** (`triage.ts`) — decide whether a request needs
  building, ask follow-up questions for missing context, and detect duplicates /
  already-shipped capabilities.
- **PRD generation** (`prd.ts`) — a structured PRD: problem statement, goals,
  non-goals, user stories, acceptance criteria, edge cases, success metrics.
- **Task generation** (`tasks.ts`) — break the PRD into ordered engineering
  tasks with requirement references.
- **Coding agent** (`codegen.ts`) — propose real file changes from the PRD,
  tasks, and repository contents; in fix mode, repair the review's blocking
  findings. Held for human confirmation before anything reaches GitHub.
- **AI code review** (`review.ts`) — a QA/engineering reviewer (not a syntax
  checker) judging the PR diff across requirements, acceptance criteria, tasks,
  security, performance, edge cases, and code quality; each finding classified
  blocking / non-blocking with explanation and recommendation. Re-reviews are
  grounded in the previous round's findings to converge.
- **Fix planning** (`fix-tasks.ts`) — convert blocking findings into actionable
  fix tasks on the board.
- **Release-readiness** (`release-readiness.ts`) — an AI ship/no-ship assessment
  that headlines the approval cockpit, weighing the PRD, review history, and
  outstanding issues. Humans remain the final decision-makers.
