import { NextResponse } from "next/server";
import {
  getBillingStatus,
  isPlanKey,
  updateWorkspaceSubscription,
} from "@throughline/db";
import { verifyWebhookSignature } from "@throughline/billing";

/**
 * Razorpay webhook receiver. Every delivery's HMAC-SHA256
 * signature is verified against `RAZORPAY_WEBHOOK_SECRET` over the *raw* body
 * before anything is parsed — unsigned, mis-signed, or malformed deliveries are
 * rejected. On a successful order/payment we read the workspace + plan from the
 * order `notes` we stamped at checkout (server-set, never client input) and
 * activate the paid plan on that workspace.
 *
 * Idempotent: activation is keyed on the Razorpay order id, so a redelivered
 * event (Razorpay retries) re-confirms the same upgrade without re-applying it.
 *
 *   POST /api/razorpay/webhook
 */

type WebhookPayload = {
  event?: string;
  payload?: {
    order?: { entity?: { id?: string; notes?: Record<string, unknown> } };
    payment?: {
      entity?: { id?: string; order_id?: string; notes?: Record<string, unknown> };
    };
  };
};

// The events that mean "money received" — either is enough to activate.
const ACTIVATING_EVENTS = new Set(["order.paid", "payment.captured"]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function POST(req: Request) {
  // Raw body is required for signature verification — re-serializing changes the
  // bytes and invalidates the HMAC.
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const event = payload.event;
  if (!event || !ACTIVATING_EVENTS.has(event)) {
    // Ack non-activating events so Razorpay doesn't retry what we ignore.
    return NextResponse.json({ ok: true, ignored: event ?? null }, { status: 202 });
  }

  const order = payload.payload?.order?.entity;
  const payment = payload.payload?.payment?.entity;
  // Notes live on the order entity; fall back to the payment entity if present.
  const notes = order?.notes ?? payment?.notes ?? {};
  const orderId = asString(order?.id) ?? asString(payment?.order_id);

  const workspaceId = asString(notes.workspaceId);
  const plan = asString(notes.plan);
  if (!workspaceId || !plan || !isPlanKey(plan) || plan === "free") {
    // e.g. a payment.captured with no order notes — nothing to act on, ack it.
    return NextResponse.json({ ok: true, skipped: true }, { status: 202 });
  }

  // Idempotency: this workspace already active on this plan for this order means
  // a redelivery — confirm without re-applying.
  const { subscription } = await getBillingStatus(workspaceId);
  if (
    subscription.plan === plan &&
    subscription.status === "active" &&
    orderId !== null &&
    subscription.razorpaySubscriptionId === orderId
  ) {
    return NextResponse.json({ ok: true, idempotent: true }, { status: 200 });
  }

  await updateWorkspaceSubscription(workspaceId, {
    plan,
    status: "active",
    razorpaySubscriptionId: orderId,
    cycleStart: new Date(),
    // A fresh paid cycle starts with a clean usage slate.
    resetUsage: true,
  });

  return NextResponse.json(
    { ok: true, activated: { workspaceId, plan } },
    { status: 200 },
  );
}
