# Throughline — Agent Instructions

**ShipFlow AI** — an AI-assisted product delivery platform. One workflow
carries a feature from raw request to shipped: Request → PRD → Tasks →
Code → AI Review → Fixes → Approval → Shipped.

Built for the ChaiCode Hackathon.

---

## Repository Structure

```
apps/web/                     Next.js 16 App Router (the product)
  app/
    dashboard/                authenticated app shell (left-aligned, max-w-860)
      requests/               feature-request list + submit form
        [id]/                 request detail — Overview / PRD / Plan / Development tabs
        [id]/board/           drag-and-drop Kanban task board (@dnd-kit)
      prds/                   generated PRDs
      plans/                  engineering plans (one card per planned feature)
      settings/               workspace settings (members, GitHub integration)
    api/github/               callback (install) + webhooks (PR ingestion) routes
    sign-in/ sign-up/         auth pages
  components/
    ui/                       shadcn/ui primitives (base-ui registry: sheet, dialog, …)
    app/                      product-specific components

packages/api/                 tRPC v11 — routers, context, middleware
  src/
    router.ts                 root AppRouter (register new routers here)
    routers/                  one file per domain
    trpc.ts                   publicProcedure / protectedProcedure
    context.ts                session → user + workspaceId resolution

packages/db/                  Drizzle ORM + Neon Postgres
  src/
    schema.ts                 all table definitions
    queries.ts                typed query helpers (never raw SQL in routers)
    client.ts                 Neon HTTP driver
  drizzle/                    migration SQL files

packages/ai/                  OpenAI helpers — generateStructured / generateText
  src/
    structured.ts             generateStructured(schema, prompt, model) → typed T
    text.ts                   generateText(prompt, model) → string
    triage.ts / prd.ts / tasks.ts / codegen.ts   triage / PRD / tasks / code changes
    models.ts                 default model IDs (all gpt-4o; override via env)
    index.ts                  re-exports

packages/billing/             Razorpay billing (stub)
packages/github/              Octokit App auth, webhook verify, repo reads, diff +
                              branch/commit/PR via the Git Data API

docs/                         (git-ignored except the two files below)
  DESIGN.md                   design system — required reading for UI work
  ShipFlow_AI_PRD.md          full product requirements
```

---

## Commands

```bash
pnpm dev            # start all apps + packages (Turborepo watch)
pnpm build          # full monorepo build

# from packages/db:
pnpm db:generate    # generate migration after schema changes
pnpm db:migrate     # apply migration to Neon
```

---

## Stack at a Glance

- **Runtime:** Node 20+, pnpm 11, Turborepo
- **Frontend:** Next.js 16 App Router · React 19 · TypeScript · Tailwind v4
- **UI components:** shadcn/ui (see `docs/DESIGN.md` for overrides)
- **API:** tRPC v11 — no REST, no GraphQL
- **Auth:** Better Auth + organization plugin (workspace = org)
- **DB:** Drizzle ORM → Neon serverless Postgres
- **AI:** Vercel AI SDK + `@ai-sdk/openai` — `OPENAI_API_KEY` in `apps/web/.env`
- **Async:** Inngest — durable workflows, `/api/inngest` serve route in `apps/web`
- **GitHub:** GitHub App via `@octokit/auth-app` + `@octokit/webhooks` — per-installation tokens, never personal tokens
- **Payments:** Razorpay (planned)

---

## Critical Rules

### Multi-tenancy — never skip
Every `protectedProcedure` gets `ctx.workspaceId` from the session.
All DB queries that touch user data must be filtered by `workspaceId`.
Tenant isolation is enforced in the tRPC middleware, not the client.

### Adding a tRPC route
1. Create `packages/api/src/routers/<domain>.ts`
2. Use `protectedProcedure` for authenticated operations
3. Add query helpers in `packages/db/src/queries.ts`
4. Register the router in `packages/api/src/router.ts`

### Adding a DB table
1. Define in `packages/db/src/schema.ts`
2. Add typed helpers in `packages/db/src/queries.ts`
3. Run `pnpm db:generate` then `pnpm db:migrate`

### UI work — read DESIGN.md first
- **Two accents only:** Peach `#E89A63` (personality) · Oxblood `#8B2839` (action)
- **Fonts:** DM Sans (UI) · DM Mono (code/data) · DM Serif Display italic
  (1–3 words in headlines only)
- **Cards:** `1px solid var(--border-hair)`, no shadows
- **Buttons:** solid oxblood, color shift + 1px lift on hover — no
  gradients, no shadows
- **Radius max:** 16px
- **GSAP:** marketing/hero only, always `"use client"` + `useEffect`

---

## Environment Setup

Copy `.env.example` in each package that has one:

```
apps/web/.env
  BETTER_AUTH_SECRET=<random 32-byte hex>
  BETTER_AUTH_URL=http://localhost:3000
  DATABASE_URL=postgres://...neon.tech/dbname?sslmode=require
  OPENAI_API_KEY=sk-...
  # GitHub App (optional — app boots without it; see .env.example):
  # GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY / GITHUB_APP_CLIENT_ID /
  # GITHUB_APP_CLIENT_SECRET / GITHUB_WEBHOOK_SECRET

packages/db/.env
  DATABASE_URL=postgres://...neon.tech/dbname?sslmode=require
```

For local Inngest: run `npx inngest-cli@latest dev` alongside `pnpm dev` (the
coding agent + PR-diff workflows need it). Never hardcode secrets.

---

## What Is Done

### Foundation

| Issue | Package / feature |
|---|---|
| monorepo-scaffold | Turborepo + pnpm workspace |
| database-package | Drizzle schema, Neon client, migrations |
| betterauth-package | Better Auth + org plugin |
| trpc-package | tRPC v11 router, context, middleware |
| ai-package | `generateStructured` / `generateText` via OpenAI |
| inngest-package | Inngest client, `/api/inngest` route, `workflow_run` table + tRPC query, ping function, polling UI |
| workspace-members | multi-user workspaces: invite by email + role, copyable accept link, `/accept-invitation/[id]` route (signed-in or after sign in/up), role-gated member list/role-change/remove in settings — all via Better Auth's org APIs, tenant-scoped |

### Phase 1 — Product Discovery

| Issue | Feature |
|---|---|
| submit-feature-request | `featureRequest` router + dashboard UI; multi-channel intake (`/api/ingest`) |
| ai-triage-workflow | clarification agent + duplicate detection (`process-request` Inngest fn) |
| prd-generation | structured PRD from gathered context |
| prd-review-edit | PRD editor UI + human approval |

### Phase 2 — Planning

| Issue | Feature |
|---|---|
| task-schema-and-api | `task` table (PRD/request/workspace FKs, `dependsOn`) + `taskRouter` |
| ai-task-generation | `generateTasks` AI + `generate-tasks` Inngest fn on PRD approval → `tasks-planned` |
| kanban-board | `@dnd-kit` drag-and-drop board, cross-column status persistence |
| task-editing-reorder | task create/edit/delete sheet + `task.reorder` (orderIndex) |
| plan-approval-gate | human "Approve plan" → `plan-approved`, board locked |

UI polish on top of the above: the request detail page is split into
**Overview / PRD / Plan** tabs; a dedicated **Plan** page lists every planned
feature; and the locked board opens full task details in a dialog.

### Phase 3 — Development

| Issue | Feature |
|---|---|
| github-app-auth | `packages/github` Octokit factories via `@octokit/auth-app` (app JWT + per-installation tokens); `github_installation` table; "Connect GitHub" install flow + `/api/github/callback`; live connected state (`github.status` tRPC), all tenant-scoped |
| connect-repository | pick an installation repo (live `apps.listReposAccessibleToInstallation`) → `repository` table; connect/disconnect; repo list in Settings — tenant-scoped |
| webhook-pr-tracking | `/api/github/webhooks` (signature-verified via `@octokit/webhooks`); `pull_request` table; idempotent, order-tolerant upserts keyed on (repo, number); live PR list |
| start-development | "Start development" on a `plan-approved` feature: pick repo + implementer (Developer / agent), create `throughline/<feature-id>` branch, → `in-development`; PR on that branch auto-links + advances to `in-review`; manual link/unlink fallback |
| pr-diff-fetch | `fetch-pr-diff` Inngest fn (re-fetch on new `headSha`) → `pull_request_diff` snapshot; reusable GitHub-style `DiffView` (per-file collapse, +green/−red) in a PR detail dialog |
| throughline-coding-agent | `generate-code` Inngest fn reads PRD + tasks + repo files → `agent_proposal` (held, not committed); human-gated diff review → Confirm commits to the branch + opens the PR (Git Data API), or Reject / regenerate / switch to Developer |

## Where We Are

Phases 1–3 are complete and working end-to-end: a request is intaked,
triaged/clarified, turned into a PRD, approved, decomposed into engineering
tasks, locked by human plan approval, then carried into GitHub — branch created,
implemented (by a human or the Throughline coding agent behind a human gate),
PR opened, tracked, and diffed. The implemented feature state machine is:

`requested → clarifying → prd-drafted → prd-approved → tasks-planned →
plan-approved → in-development → in-review`

## What Is Next — Phase 4 (AI Review)

Evaluate a PR's diff against the PRD, acceptance criteria, and tasks:

- AI review of the changed code (blocking / non-blocking findings)
- surface fixes, then human approval to ship

`in-review` (reached when a PR is linked to a feature) is the precondition that
unlocks this phase.

---

## TypeScript Notes

- `tsconfig.base.json` at root; all packages extend it
- `packages/api` and `packages/db` resolve to `./src/index.ts` at dev
  time (no pre-compilation needed during local dev)
- Path aliases are not used — import from workspace package names
  (`@throughline/db`, `@throughline/api`, etc.)
