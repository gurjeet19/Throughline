"use client";

import { useEffect, useRef, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  {
    icon: "PRD",
    title: "Structured PRDs",
    desc: "Generated from real context, complete with acceptance criteria and edge cases, then yours to edit.",
  },
  {
    icon: "{ }",
    title: "Live GitHub",
    desc: "Connect repos with Octokit, receive webhooks, and fetch real diffs. Never a hardcoded pull request.",
  },
  {
    icon: "QA",
    title: "AI that reviews intent",
    desc: "Judges whether code satisfies the PRD across security, performance, edge cases and quality — not just syntax.",
  },
  {
    icon: "↺",
    title: "Re-review loop",
    desc: "Fixes trigger an automatic re-review. The cycle runs until no blocking issues remain.",
  },
  {
    icon: "▮▮",
    title: "Kanban planning",
    desc: "PRDs break into tasks on a board your team reviews and approves before development begins.",
  },
  {
    icon: "\u{1F512}",
    title: "Human approval gate",
    desc: "A consolidated release view, and a decision only a person can make. Approved means shipped.",
  },
] as const;

const STAGGER_STEP = 0.07;

export function Features() {
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
      id="features"
      className="border-t border-[var(--border-hair)] bg-[var(--surface)] px-[5%] py-24"
    >
      <div
        ref={wrapRef}
        className={`reveal-stagger mx-auto max-w-[1200px]${visible ? " is-visible" : ""}`}
      >
        <div className="mb-14 grid items-end gap-6 md:grid-cols-[0.9fr_1.1fr] md:gap-12">
          <div className="reveal-item" style={{ "--stagger-delay": delay() } as React.CSSProperties}>
            <p className="eyebrow mb-3">What&apos;s inside</p>
            <h2 className="h-section">
              Built for <em>real</em> delivery.
            </h2>
          </div>
          <p
            className="reveal-item max-w-[460px] text-sm leading-7 text-[var(--text-2)]"
            style={{ "--stagger-delay": delay() } as React.CSSProperties}
          >
            Every workspace gets its own projects, repositories, requests and
            review history — with the integrations modern teams already run
            on.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card
              key={feature.title}
              className="reveal-item rounded-md border border-[var(--border-hair)] bg-[var(--surface)] py-7 shadow-none ring-0 transition-colors duration-200 hover:border-[var(--oxblood)] hover:bg-[var(--peach-pale)]"
              style={{ "--stagger-delay": delay() } as React.CSSProperties}
            >
              <CardContent className="flex flex-col gap-0">
                <div className="mb-[1.1rem] flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-[var(--oxblood-pale)] font-mono text-[0.78rem] font-medium text-[var(--oxblood)]">
                  {feature.icon}
                </div>
                <div className="mb-2 text-[0.98rem] font-semibold text-[var(--text-1)]">
                  {feature.title}
                </div>
                <div className="text-[0.83rem] leading-[1.65] text-[var(--text-2)]">
                  {feature.desc}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
