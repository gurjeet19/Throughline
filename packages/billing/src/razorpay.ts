import crypto from "node:crypto";
import Razorpay from "razorpay";
import { getPlan, type PlanKey } from "@throughline/db";

/**
 * The Razorpay client. Throughline creates an order for
 * a paid plan's price and activates the plan from a *verified* webhook —
 * never trusting the browser. All secrets come from the server environment;
 * nothing here runs on the client.
 *
 * Like the GitHub App, Razorpay is optional: when the env isn't set the helpers
 * report "not configured" and the app keeps every workspace on Free instead of
 * crashing.
 */

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

/** Reads + validates the Razorpay env. Returns null when not configured. */
export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!keyId || !keySecret || !webhookSecret) return null;
  return { keyId, keySecret, webhookSecret };
}

export function isRazorpayConfigured(): boolean {
  return getRazorpayConfig() !== null;
}

function requireConfig(): RazorpayConfig {
  const config = getRazorpayConfig();
  if (!config) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, " +
        "and RAZORPAY_WEBHOOK_SECRET.",
    );
  }
  return config;
}

/** The public key id the browser checkout needs. Null when unconfigured. */
export function getRazorpayKeyId(): string | null {
  return getRazorpayConfig()?.keyId ?? null;
}

let client: Razorpay | null = null;
function getClient(): Razorpay {
  const config = requireConfig();
  if (!client) {
    client = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
  }
  return client;
}

export type PlanOrder = {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  plan: PlanKey;
};

/**
 * Create a Razorpay order for a paid plan's price. The workspace + plan are
 * stamped into the order `notes` so the webhook can resolve which workspace to
 * upgrade — set server-side, never from client input. Throws for the Free plan
 * (nothing to charge) or when Razorpay isn't configured.
 */
export async function createPlanOrder(args: {
  workspaceId: string;
  plan: PlanKey;
  receipt?: string;
}): Promise<PlanOrder> {
  const config = requireConfig();
  const plan = getPlan(args.plan);
  if (plan.priceInPaise <= 0) {
    throw new Error(`Plan "${args.plan}" is not a paid plan.`);
  }

  const order = await getClient().orders.create({
    amount: plan.priceInPaise,
    currency: plan.currency,
    // Receipts are capped at 40 chars by Razorpay — keep it short + unique.
    receipt: args.receipt ?? `ws_${args.workspaceId.slice(0, 8)}_${Date.now()}`,
    notes: { workspaceId: args.workspaceId, plan: plan.key },
  });

  return {
    orderId: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    keyId: config.keyId,
    plan: plan.key,
  };
}

/** Constant-time hex string compare (returns false on length mismatch). */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify a Razorpay *webhook* delivery: HMAC-SHA256 of the raw request body
 * keyed by the webhook secret, compared constant-time against the
 * `X-Razorpay-Signature` header. Returns false when unconfigured or unsigned —
 * never throws, so the route can simply reject.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const config = getRazorpayConfig();
  if (!config || !signature) return false;
  const expected = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(rawBody)
    .digest("hex");
  return safeEqualHex(expected, signature);
}

/**
 * Verify a Checkout *payment* signature (the client success callback):
 * HMAC-SHA256 of `${orderId}|${paymentId}` keyed by the key secret. The webhook
 * remains the source of truth for activation; this lets the client confirm
 * success optimistically.
 */
export function verifyPaymentSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const config = getRazorpayConfig();
  if (!config) return false;
  const expected = crypto
    .createHmac("sha256", config.keySecret)
    .update(`${args.orderId}|${args.paymentId}`)
    .digest("hex");
  return safeEqualHex(expected, args.signature);
}
