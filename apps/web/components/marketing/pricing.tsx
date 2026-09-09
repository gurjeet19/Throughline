"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// Presentational mirror of the billing plan catalog (packages/db/src/plans.ts).
// Keep the figures here in step with that catalog when entitlements change.
type Plan = {
  name: string;
  price: string;
  cadence?: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "₹0",
    tagline: "Evaluate the full request-to-ship workflow on one repository.",
    features: [
      "5 AI review credits / cycle",
      "5 coding-agent runs / cycle",
      "1 connected repository",
      "Community support",
    ],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "₹999",
    cadence: "/ month",
    tagline:
      "For teams shipping continuously across many repositories, with room to run.",
    features: [
      "200 AI review credits / cycle",
      "100 coding-agent runs / cycle",
      "20 connected repositories",
      "Priority support",
    ],
    cta: "Get Pro",
    highlighted: true,
  },
];

const STAGGER_STEP = 0.07;

export function Pricing() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  let item = 0;
  const delay = () => `${item++ * STAGGER_STEP}s`;

  return (
    <section
      id="pricing"
      className="border-t border-[var(--border-hair)] bg-[var(--bg)] px-[5%] py-24"
    >
      <div
        ref={wrapRef}
        className={`reveal-stagger mx-auto max-w-[1200px]${visible ? " is-visible" : ""}`}
      >
        <div className="mb-14 mx-auto max-w-[560px] text-center">
          <p
            className="eyebrow reveal-item mb-3"
            style={{ "--stagger-delay": delay() } as React.CSSProperties}
          >
            Pricing
          </p>
          <h2
            className="h-section reveal-item"
            style={{ "--stagger-delay": delay() } as React.CSSProperties}
          >
            Start free, <em>upgrade</em> when you scale.
          </h2>
          <p
            className="reveal-item mx-auto mt-3.5 max-w-[460px] text-sm leading-7 text-[var(--text-2)]"
            style={{ "--stagger-delay": delay() } as React.CSSProperties}
          >
            Run the entire pipeline a handful of times on the Free plan. When your
            team ships every day, Pro lifts every limit.
          </p>
        </div>

        <div className="mx-auto grid gap-4 sm:grid-cols-2 lg:max-w-[820px]">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="reveal-item flex flex-col rounded-[12px] p-7 transition-colors duration-200"
              style={
                {
                  "--stagger-delay": delay(),
                  background: plan.highlighted
                    ? "var(--peach-pale)"
                    : "var(--surface)",
                  border: `1px solid ${
                    plan.highlighted ? "var(--peach-light)" : "var(--border-hair)"
                  }`,
                } as React.CSSProperties
              }
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-[1.05rem] font-semibold text-[var(--text-1)]">
                  {plan.name}
                </span>
                {plan.highlighted && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.06em]"
                    style={{
                      background: "var(--oxblood-pale)",
                      color: "var(--oxblood)",
                    }}
                  >
                    Recommended
                  </span>
                )}
              </div>

              <div className="mb-4 flex items-baseline gap-1.5">
                <span
                  className="text-[2.2rem] font-medium tracking-[-0.02em] text-[var(--text-1)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {plan.price}
                </span>
                {plan.cadence && (
                  <span className="text-[0.82rem] text-[var(--text-3)]">
                    {plan.cadence}
                  </span>
                )}
              </div>

              <p className="mb-6 text-[0.86rem] leading-[1.6] text-[var(--text-2)]">
                {plan.tagline}
              </p>

              <ul className="mb-7 flex flex-col gap-2.5">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-[0.86rem] text-[var(--text-2)]"
                  >
                    <CheckIcon
                      className="mt-0.5 size-4 shrink-0"
                      style={{ color: "var(--oxblood)" }}
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                variant={plan.highlighted ? "default" : "outline"}
                className="mt-auto w-full"
                render={<Link href="/sign-up">{plan.cta}</Link>}
              />
            </div>
          ))}
        </div>

        <p
          className="reveal-item mt-6 text-center text-[0.78rem] text-[var(--text-3)]"
          style={{ "--stagger-delay": delay() } as React.CSSProperties}
        >
          Prices in INR, billed monthly via Razorpay. Limits reset each billing
          cycle. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
