/**
 * The plan / limits model.
 *
 * Plans are static product configuration, not per-tenant data, so they live as a
 * typed catalog here rather than in a database table — the `workspace_subscription`
 * row only stores which plan a workspace is on plus its usage counters, and reads
 * its entitlements back from this catalog. Keeping the catalog in `@throughline/db`
 * (the lowest layer) lets the workspace-scoped query helpers compute "remaining"
 * against a plan's limits without a cross-package dependency; the billing package
 * re-exports it as the public surface, and the Razorpay integration maps these
 * keys/prices onto Razorpay orders.
 */

/** The available plan tiers. `free` is the default every workspace starts on. */
export type PlanKey = "free" | "pro";

/**
 * What a plan grants. Limits are finite integers (no "unlimited" sentinel —
 * pick a high number if a tier should feel uncapped) so the usage math stays
 * a simple comparison everywhere.
 */
export type PlanEntitlements = {
  /** AI review runs included per billing cycle. */
  aiReviewCredits: number;
  /** Throughline AI coding-agent runs included per billing cycle. */
  aiCodingAgentCredits: number;
  /** Maximum number of connected repositories. */
  repositoryLimit: number;
  /** Premium workflow flags gated to paid tiers. */
  features: {
    /** Priority human support. */
    prioritySupport: boolean;
  };
};

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  description: string;
  /** Monthly price in the smallest currency unit (paise), Razorpay-ready. 0 = free. */
  priceInPaise: number;
  currency: "INR";
  entitlements: PlanEntitlements;
};

/** Every workspace starts here, with no billing configured. */
export const DEFAULT_PLAN: PlanKey = "free";

export const PLANS: Record<PlanKey, PlanDefinition> = {
  free: {
    key: "free",
    name: "Free",
    description: "Evaluate the full request-to-ship workflow on one repository.",
    priceInPaise: 0,
    currency: "INR",
    entitlements: {
      // Sized for a genuine end-to-end trial: one AI review ≈ one feature flow
      // (a fix-loop re-review costs one more), and the AI coding agent is
      // available too — both capped at five runs so the product can be explored
      // fully ~4–5 times on a single account before the paywall, without a trial
      // running up a large AI bill.
      aiReviewCredits: 5,
      aiCodingAgentCredits: 5,
      repositoryLimit: 1,
      features: {
        prioritySupport: false,
      },
    },
  },
  pro: {
    key: "pro",
    name: "Pro",
    description:
      "For teams shipping continuously across many repositories, with generous AI review and coding-agent capacity.",
    priceInPaise: 99900, // ₹999 / month
    currency: "INR",
    entitlements: {
      aiReviewCredits: 200,
      aiCodingAgentCredits: 100,
      repositoryLimit: 20,
      features: {
        prioritySupport: true,
      },
    },
  },
};

/** Ordered tiers for display (cheapest first). */
export const PLAN_ORDER: PlanKey[] = ["free", "pro"];

/** Type guard: is this string one of the known plan keys? */
export function isPlanKey(value: string): value is PlanKey {
  return value === "free" || value === "pro";
}

/**
 * Resolve a stored plan key to its definition, falling back to Free for any
 * unrecognized value so a stale/bad row can never strip a workspace of a usable
 * plan.
 */
export function getPlan(key: string): PlanDefinition {
  return isPlanKey(key) ? PLANS[key] : PLANS[DEFAULT_PLAN];
}
