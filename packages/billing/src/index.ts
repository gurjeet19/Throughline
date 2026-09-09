/**
 * `@throughline/billing` — the billing surface for Throughline.
 *
 * The plan / limits model (tiers + entitlements) is the source of truth in
 * `@throughline/db` so the workspace-scoped query helpers can compute usage
 * against it without a cross-package dependency. This package re-exports that
 * catalog as the public billing API and adds the Razorpay client (orders and
 * webhook verification).
 */
export {
  PLANS,
  PLAN_ORDER,
  DEFAULT_PLAN,
  getPlan,
  isPlanKey,
  type PlanKey,
  type PlanDefinition,
  type PlanEntitlements,
} from "@throughline/db";

export {
  getRazorpayConfig,
  isRazorpayConfigured,
  getRazorpayKeyId,
  createPlanOrder,
  verifyWebhookSignature,
  verifyPaymentSignature,
  type RazorpayConfig,
  type PlanOrder,
} from "./razorpay";
