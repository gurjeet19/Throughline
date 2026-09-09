"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  InfoIcon,
  RocketIcon,
  SparklesIcon,
  GitBranchIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";

type UsageMetric = { used: number; limit: number; remaining: number };

type BillingStatus = {
  subscription: { plan: string; status: string };
  plan: { key: string; name: string };
  usage: {
    aiReviewCredits: UsageMetric;
    aiCodingAgentCredits: UsageMetric;
    repositories: UsageMetric;
  };
  razorpayConfigured: boolean;
};

type PlanDefinition = {
  key: string;
  name: string;
  description: string;
  priceInPaise: number;
  currency: string;
  entitlements: {
    aiReviewCredits: number;
    aiCodingAgentCredits: number;
    repositoryLimit: number;
    features: { prioritySupport: boolean };
  };
};

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  theme?: { color?: string };
  handler?: (response: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

/** Inject Razorpay's Checkout script once; resolve when it's ready. */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function formatPrice(plan: PlanDefinition): string {
  if (plan.priceInPaise <= 0) return "Free";
  const major = plan.priceInPaise / 100;
  return `₹${major.toLocaleString("en-IN")}`;
}

export function BillingHub() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // While a checkout is settling, poll status until the webhook flips the plan.
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: statusData, isLoading } = useQuery(
    trpc.billing.status.queryOptions(),
  );
  const { data: plansData } = useQuery(trpc.billing.plans.queryOptions());

  const status = statusData as BillingStatus | undefined;
  const plans = (plansData as PlanDefinition[] | undefined) ?? [];

  // Clean up the polling timer on unmount.
  useEffect(() => {
    return () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);

  // After a successful checkout the verified webhook activates the plan
  // out-of-band; poll status until it flips (or a deadline passes) so the page
  // reflects the upgrade without a manual refresh. setState lives in async/timer
  // callbacks here, never synchronously inside an effect.
  function pollActivation(planKey: string) {
    // Computed on the first (deferred) tick, then held stable across retries —
    // kept out of the synchronous body so it never runs on the render path.
    let deadline = 0;
    const tick = async () => {
      if (deadline === 0) deadline = Date.now() + 45000;
      let fresh: BillingStatus | undefined;
      try {
        fresh = (await queryClient.fetchQuery(
          trpc.billing.status.queryOptions(),
        )) as BillingStatus;
      } catch {
        // transient — keep trying until the deadline
      }
      if (
        fresh?.subscription.plan === planKey &&
        fresh.subscription.status === "active"
      ) {
        setPendingPlan(null);
        toast.success("Upgraded — your new plan is now active.");
        return;
      }
      if (Date.now() > deadline) {
        setPendingPlan(null);
        toast.info(
          "Still finalizing. If your plan doesn't update shortly, refresh — the webhook may be processing.",
        );
        return;
      }
      pendingTimer.current = setTimeout(tick, 2500);
    };
    void tick();
  }

  const startCheckout = useMutation(
    trpc.billing.startCheckout.mutationOptions({
      onError: (err) =>
        toast.error("Couldn't start checkout", { description: err.message }),
    }),
  );

  async function handleUpgrade(plan: PlanDefinition) {
    try {
      const order = await startCheckout.mutateAsync({ plan: plan.key });
      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) {
        toast.error("Couldn't load Razorpay checkout. Check your connection.");
        return;
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Throughline",
        description: `${plan.name} plan`,
        order_id: order.orderId,
        theme: { color: "#8B2839" },
        handler: () => {
          // The verified webhook is the source of truth for activation — poll
          // status until it lands rather than trusting the client.
          setPendingPlan(plan.key);
          toast.info("Payment received — activating your plan…");
          if (pendingTimer.current) clearTimeout(pendingTimer.current);
          pollActivation(plan.key);
        },
      });
      rzp.open();
    } catch {
      // mutateAsync errors are surfaced by the mutation's onError.
    }
  }

  if (isLoading || !status) {
    return (
      <div className="grid gap-3 pt-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 rounded-[10px]"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-hair)",
            }}
          />
        ))}
      </div>
    );
  }

  const currentPlanKey = status.subscription.plan;
  const pastDue = status.subscription.status === "past_due";

  return (
    <>
      {/* Page header */}
      <div
        className="flex items-end justify-between gap-4 pb-6"
        style={{ borderBottom: "1px solid var(--border-hair)" }}
      >
        <div className="fade-up" style={{ "--d": "0s" } as React.CSSProperties}>
          <p className="eyebrow mb-2">Billing</p>
          <h1 className="h-section">
            Plan &amp; <em>usage.</em>
          </h1>
          <p
            className="mt-2 max-w-md text-sm leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            Your current plan, how much of it you&apos;ve used this cycle, and what
            you unlock by upgrading.
          </p>
        </div>
      </div>

      {/* Current plan + status */}
      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[10px] p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
      >
        <div className="flex flex-col gap-1.5">
          <span
            className="text-[0.7rem] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-3)" }}
          >
            Current plan
          </span>
          <span className="text-lg font-medium" style={{ color: "var(--text-1)" }}>
            {status.plan.name}
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
          style={{
            background: pastDue ? "var(--red-bg)" : "var(--green-bg)",
            color: pastDue ? "var(--red-err)" : "var(--green)",
            fontSize: "0.62rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: pastDue ? "var(--red-err)" : "var(--green)" }}
          />
          {pastDue ? "Past due" : "Active"}
        </span>
      </div>

      {/* Usage against entitlements */}
      <section className="mt-5 flex flex-col gap-3">
        <p className="eyebrow">Usage this cycle</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <UsageCard
            icon={<SparklesIcon className="size-3.5" />}
            label="AI review credits"
            metric={status.usage.aiReviewCredits}
          />
          <UsageCard
            icon={<RocketIcon className="size-3.5" />}
            label="Coding-agent runs"
            metric={status.usage.aiCodingAgentCredits}
          />
          <UsageCard
            icon={<GitBranchIcon className="size-3.5" />}
            label="Repositories"
            metric={status.usage.repositories}
          />
        </div>
      </section>

      {/* Plan comparison */}
      <section className="mt-8 flex flex-col gap-3">
        <p className="eyebrow">Plans</p>
        {!status.razorpayConfigured && (
          <div
            className="flex items-start gap-2.5 rounded-[10px] p-4"
            style={{ background: "var(--muted)", border: "1px solid var(--border-hair)" }}
          >
            <InfoIcon
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--text-3)" }}
            />
            <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
              Billing isn&apos;t configured for this deployment, so upgrades are
              disabled and every workspace stays on Free. Set the Razorpay
              environment variables to enable checkout.
            </p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              isCurrent={plan.key === currentPlanKey}
              razorpayConfigured={status.razorpayConfigured}
              pending={pendingPlan === plan.key}
              disabled={startCheckout.isPending || pendingPlan !== null}
              onUpgrade={() => handleUpgrade(plan)}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function UsageCard({
  icon,
  label,
  metric,
}: {
  icon: React.ReactNode;
  label: string;
  metric: UsageMetric;
}) {
  const pct =
    metric.limit > 0 ? Math.min(100, Math.round((metric.used / metric.limit) * 100)) : 0;
  const exhausted = metric.remaining <= 0;
  const fill = exhausted ? "var(--red-err)" : "var(--oxblood)";

  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <span
        className="inline-flex items-center gap-2 text-[0.8rem] font-medium"
        style={{ color: "var(--text-1)" }}
      >
        <span style={{ color: "var(--text-3)" }}>{icon}</span>
        {label}
      </span>

      <div className="flex items-baseline gap-1.5">
        <span
          className="text-xl font-medium tabular-nums"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)" }}
        >
          {metric.used}
        </span>
        <span
          className="text-[0.78rem] tabular-nums"
          style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
        >
          / {metric.limit}
        </span>
      </div>

      {/* Hairline track + fill — DESIGN.md: border-led, oxblood action fill. */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--border-soft)" }}
        role="progressbar"
        aria-valuenow={metric.used}
        aria-valuemin={0}
        aria-valuemax={metric.limit}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>

      <span className="text-[0.72rem]" style={{ color: "var(--text-3)" }}>
        {exhausted ? "Limit reached — upgrade for more" : `${metric.remaining} remaining`}
      </span>
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  razorpayConfigured,
  pending,
  disabled,
  onUpgrade,
}: {
  plan: PlanDefinition;
  isCurrent: boolean;
  razorpayConfigured: boolean;
  pending: boolean;
  disabled: boolean;
  onUpgrade: () => void;
}) {
  const isPaid = plan.priceInPaise > 0;
  const e = plan.entitlements;
  const features = [
    `${e.aiReviewCredits} AI review credits / cycle`,
    `${e.aiCodingAgentCredits} coding-agent runs / cycle`,
    `${e.repositoryLimit} connected ${e.repositoryLimit === 1 ? "repository" : "repositories"}`,
    e.features.prioritySupport ? "Priority support" : "Community support",
  ];

  return (
    <div
      className="flex flex-col gap-4 rounded-[12px] p-5"
      style={{
        background: isCurrent ? "var(--peach-pale)" : "var(--surface)",
        border: `1px solid ${isCurrent ? "var(--peach-light)" : "var(--border-hair)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-base font-medium" style={{ color: "var(--text-1)" }}>
            {plan.name}
          </span>
          <span className="text-[0.8rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
            {plan.description}
          </span>
        </div>
        {isCurrent && <StatusBadge status="shipped" className="shrink-0" />}
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className="text-2xl font-medium tabular-nums"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)", letterSpacing: "-0.02em" }}
        >
          {formatPrice(plan)}
        </span>
        {isPaid && (
          <span className="text-[0.78rem]" style={{ color: "var(--text-3)" }}>
            / month
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-[0.82rem]"
            style={{ color: "var(--text-2)" }}
          >
            <CheckIcon
              className="mt-0.5 size-3.5 shrink-0"
              style={{ color: "var(--oxblood)" }}
            />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-1">
        {isCurrent ? (
          <span
            className="inline-flex items-center gap-1.5 text-[0.8rem] font-medium"
            style={{ color: "var(--oxblood)" }}
          >
            <ShieldCheckIcon className="size-3.5" />
            Your current plan
          </span>
        ) : isPaid ? (
          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={disabled || !razorpayConfigured}
            onClick={onUpgrade}
          >
            <RocketIcon className="size-3.5" />
            {pending
              ? "Activating…"
              : razorpayConfigured
                ? `Upgrade to ${plan.name}`
                : "Upgrade unavailable"}
          </Button>
        ) : (
          <span className="text-[0.78rem]" style={{ color: "var(--text-3)" }}>
            Included for every workspace.
          </span>
        )}
      </div>
    </div>
  );
}
