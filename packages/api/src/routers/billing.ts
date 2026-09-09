import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  PLANS,
  PLAN_ORDER,
  getBillingStatus,
  getBillingUsage,
  getWorkspaceMemberRole,
  isPlanKey,
} from "@throughline/db";
import {
  createPlanOrder,
  isRazorpayConfigured,
} from "@throughline/billing";
import { protectedProcedure, router } from "../trpc";

/** Guard a mutation behind workspace owner/admin. Throws FORBIDDEN otherwise. */
async function requireAdmin(workspaceId: string, userId: string) {
  const role = await getWorkspaceMemberRole(workspaceId, userId);
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an owner or admin can manage billing.",
    });
  }
}

/**
 * Billing. The read surface for the Billing page plus the checkout entrypoint.
 * Activation is never done here: `startCheckout` only opens
 * a Razorpay order, and the verified `/api/razorpay/webhook` is what actually
 * upgrades the workspace. Workspace-scoped throughout.
 */
export const billingRouter = router({
  /** The static plan catalog (Free + paid tiers), cheapest first. */
  plans: protectedProcedure.query(() => PLAN_ORDER.map((key) => PLANS[key])),

  /**
   * The active workspace's current plan, subscription status, entitlements, and
   * live usage — plus whether Razorpay is configured (so the UI can show or hide
   * upgrade controls). Ensures a Free record exists on first read.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const [{ subscription, plan, entitlements }, usage] = await Promise.all([
      getBillingStatus(ctx.workspaceId),
      getBillingUsage(ctx.workspaceId),
    ]);
    return {
      subscription,
      plan,
      entitlements,
      usage,
      razorpayConfigured: isRazorpayConfigured(),
    };
  }),

  /**
   * Start a Razorpay checkout for a paid plan. Admin-only. Returns the order id,
   * amount, currency, and public key the browser needs to open Razorpay
   * Checkout. The plan is *not* applied here — the verified webhook does that
   * once payment succeeds, so a closed/abandoned checkout changes nothing.
   */
  startCheckout: protectedProcedure
    .input(z.object({ plan: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.workspaceId, ctx.user.id);

      if (!isRazorpayConfigured()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Billing is not configured for this deployment.",
        });
      }
      if (!isPlanKey(input.plan) || input.plan === "free") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose a paid plan to upgrade to.",
        });
      }

      return createPlanOrder({ workspaceId: ctx.workspaceId, plan: input.plan });
    }),
});
