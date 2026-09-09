import { TRPCError } from "@trpc/server";
import { getBillingUsage } from "@throughline/db";

/**
 * Server-side plan-limit enforcement. Entitlements + usage
 * are read from the billing model and checked in the tRPC layer; the client only
 * renders the resulting message. Every guard is workspace-scoped and points the
 * user at the Billing page to upgrade.
 *
 * Credit *consumption* (the atomic decrement on a new run) lives at each
 * feature's run chokepoint so it happens exactly once per run and never on an
 * idempotent re-entry; these guards are the up-front "are you allowed" check that
 * produces an actionable, upgrade-pointing error.
 */

/** The in-app path limit messages send users to. */
export const BILLING_PATH = "/dashboard/billing";

function upgradeMessage(reason: string): string {
  return `${reason} Upgrade your plan in Billing (${BILLING_PATH}) for more.`;
}

/** Block when the workspace has no AI review credits left this cycle. */
export async function assertAiReviewCreditsAvailable(workspaceId: string) {
  const usage = await getBillingUsage(workspaceId);
  if (usage.aiReviewCredits.remaining <= 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: upgradeMessage(
        `You've used all ${usage.aiReviewCredits.limit} AI review credits on your plan.`,
      ),
    });
  }
}

/** Block when the workspace has no coding-agent runs left this cycle. */
export async function assertCodingAgentCreditsAvailable(workspaceId: string) {
  const usage = await getBillingUsage(workspaceId);
  if (usage.aiCodingAgentCredits.remaining <= 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: upgradeMessage(
        `You've used all ${usage.aiCodingAgentCredits.limit} coding-agent runs on your plan.`,
      ),
    });
  }
}

/** Block when connecting another repository would exceed the plan's limit. */
export async function assertRepositoryLimitAvailable(workspaceId: string) {
  const usage = await getBillingUsage(workspaceId);
  if (usage.repositories.remaining <= 0) {
    const { limit } = usage.repositories;
    throw new TRPCError({
      code: "FORBIDDEN",
      message: upgradeMessage(
        `Your plan allows ${limit} connected ${limit === 1 ? "repository" : "repositories"}.`,
      ),
    });
  }
}
