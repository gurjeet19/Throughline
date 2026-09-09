"use client";

import { useEffect, useRef, useState } from "react";

const QUOTES = [
  {
    body: "The review actually reads the PRD. It caught an acceptance-criteria miss our team would have merged on a Friday afternoon.",
    initials: "RK",
    name: "Rhea Kapoor",
    role: "Eng Lead, Lumen Labs",
  },
  {
    body: "Half the requests we used to build already existed. Now the agent tells us before we spend a sprint on it.",
    initials: "DM",
    name: "Diego Marín",
    role: "Product Owner, Northbound",
  },
  {
    body: "I sign off from one screen — PRD, tasks, the PR, the whole review history. The human gate finally feels informed.",
    initials: "AO",
    name: "Amara Okafor",
    role: "Director of Eng, Tideway",
  },
  {
    body: "Fix, push, re-review — the loop is automatic. We stopped chasing reviewers and started shipping.",
    initials: "JT",
    name: "Jonas Thorne",
    role: "Staff Engineer, Castfold",
  },
] as const;

const STAGGER_STEP = 0.07;

export function Testimonials() {
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
      id="voices"
      className="border-t border-[var(--border-hair)] bg-[var(--bg)] px-[5%] py-24"
    >
      <div
        ref={wrapRef}
        className={`reveal-stagger mx-auto max-w-[1200px]${visible ? " is-visible" : ""}`}
      >
        <div className="mb-14 grid items-end gap-6 md:grid-cols-[0.9fr_1.1fr] md:gap-12">
          <div className="reveal-item" style={{ "--stagger-delay": delay() } as React.CSSProperties}>
            <p className="eyebrow mb-3">From the teams</p>
            <h2 className="h-section">
              Less handoff, <em>more shipping.</em>
            </h2>
          </div>
          <p
            className="reveal-item max-w-[460px] text-sm leading-7 text-[var(--text-2)]"
            style={{ "--stagger-delay": delay() } as React.CSSProperties}
          >
            Product owners, engineers and reviewers working from one thread
            of context instead of five disconnected tools.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {QUOTES.map((quote) => (
            <div
              key={quote.name}
              className="reveal-item quote-card relative rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-[1.9rem] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--peach-light)] hover:shadow-[0_6px_20px_rgba(232,154,99,0.1)]"
              style={{ "--stagger-delay": delay() } as React.CSSProperties}
            >
              <p className="mt-6 mb-[1.4rem] text-[0.9rem] leading-[1.72] text-[var(--text-2)]">
                {quote.body}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-[var(--peach-light)] bg-[var(--peach-pale)] text-[0.78rem] font-semibold text-[var(--oxblood)]">
                  {quote.initials}
                </div>
                <div>
                  <div className="text-[0.82rem] font-semibold text-[var(--text-1)]">
                    {quote.name}
                  </div>
                  <div className="mt-[0.1rem] text-[0.7rem] text-[var(--text-3)]">
                    {quote.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
