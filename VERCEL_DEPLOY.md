# Deploying Throughline to Vercel

## Prerequisites

This is a **full-stack Next.js monorepo**. The app requires real backend services
to function at runtime, but it will **build and deploy on Vercel without any env
vars set** — blank/missing vars are only a problem at runtime, not build time.

---

## Required Environment Variables (Runtime)

Go to your Vercel project → **Settings → Environment Variables** and add:

### 🔴 Required (app won't work without these)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (e.g. from Vercel Marketplace → Neon) |
| `BETTER_AUTH_SECRET` | Random 32-byte hex secret — run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BETTER_AUTH_URL` | Your Vercel deployment URL, e.g. `https://your-app.vercel.app` |

### 🟡 Optional (features degrade gracefully without these)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Needed for AI features (PRD generation, triage, code review) |
| `INNGEST_EVENT_KEY` | Inngest event key — get from app.inngest.com |
| `INNGEST_SIGNING_KEY` | Inngest signing key — get from app.inngest.com |
| `GOOGLE_CLIENT_ID` | Google OAuth — app still works with email/password without this |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `GITHUB_APP_ID` | GitHub App integration — shows "not configured" without this |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (single line with `\n` escaped) |
| `GITHUB_APP_CLIENT_ID` | GitHub App client ID |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App client secret |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret |
| `RAZORPAY_KEY_ID` | Razorpay billing — every workspace stays Free without this |
| `RAZORPAY_KEY_SECRET` | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook secret |
| `RESEND_API_KEY` | Email invitations — invite links still work in UI without this |
| `INVITE_FROM_EMAIL` | From address for invite emails |

---

## Quickest Deploy (Vercel + Neon)

1. Push this repo to GitHub.
2. Import the repo in [vercel.com/new](https://vercel.com/new).
3. Vercel auto-detects the Next.js app — keep all defaults.
4. Add `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` in
   **Settings → Environment Variables**.
5. Run your database migrations once locally:
   ```bash
   cd packages/db
   cp .env.example .env   # fill in DATABASE_URL
   pnpm db:migrate
   ```
6. Deploy — the build will succeed even without env vars.

---

## Local Development

```bash
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
# Fill in at minimum: DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
pnpm install
pnpm dev
```
