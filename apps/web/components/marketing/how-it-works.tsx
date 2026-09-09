"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";

const STEPS = [
  {
    n: "01",
    t: "Capture & clarify",
    d: "A request arrives from any channel. The agent asks for what's missing — and flags requests for things that already exist.",
  },
  {
    n: "02",
    t: "Draft the PRD",
    d: "Problem, goals, non-goals, user stories, acceptance criteria, edge cases, success metrics — structured and editable.",
  },
  {
    n: "03",
    t: "Plan the work",
    d: "The PRD becomes engineering tasks on a Kanban board. The team reviews and approves the plan before any code is written.",
  },
  {
    n: "04",
    t: "Review against intent",
    d: "Pull requests are fetched live from GitHub and reviewed against the PRD, with issues marked blocking or non-blocking.",
  },
  {
    n: "05",
    t: "Approve & ship",
    d: "A human verifies the PRD, tasks, PR and review history, then makes the release decision. Only approved features ship.",
  },
] as const;

const SCORES = [
  { label: "Acceptance", w: 0.96 },
  { label: "Security", w: 0.82 },
  { label: "Edge cases", w: 0.74 },
  { label: "Code quality", w: 0.91 },
] as const;

const STAGGER_STEP = 0.07;

export function HowItWorks() {
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
      id="how"
      className="border-t border-[var(--border-hair)] bg-[var(--bg)] px-[5%] py-24"
    >
      <div
        ref={wrapRef}
        className={`reveal-stagger mx-auto max-w-[1200px]${visible ? " is-visible" : ""}`}
      >
        <div className="mb-14 grid items-end gap-6 md:grid-cols-[0.9fr_1.1fr] md:gap-12">
          <div className="reveal-item" style={{ "--stagger-delay": delay() } as React.CSSProperties}>
            <p className="eyebrow mb-3">How it works</p>
            <h2 className="h-section">
              Product thinking, <em>not just</em> code.
            </h2>
          </div>
          <p
            className="reveal-item max-w-[460px] text-sm leading-7 text-[var(--text-2)]"
            style={{ "--stagger-delay": delay() } as React.CSSProperties}
          >
            A request becomes a specification, a specification becomes a
            plan, and every pull request is judged against what was actually
            asked for — before a person makes the call.
          </p>
        </div>

        <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
          <div>
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="reveal-item grid grid-cols-[38px_1fr] gap-[1.1rem] border-b border-[var(--border-soft)] py-6 last:border-b-0"
                style={{ "--stagger-delay": delay() } as React.CSSProperties}
              >
                <div className="pt-0.5 font-mono text-[0.78rem] text-[var(--text-3)]">
                  {step.n}
                </div>
                <div>
                  <div className="mb-1.5 text-[0.98rem] font-semibold text-[var(--text-1)]">
                    {step.t}
                  </div>
                  <div className="text-[0.84rem] leading-[1.65] text-[var(--text-2)]">
                    {step.d}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            className="reveal-item sticky top-[90px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[var(--shadow-md)]"
            style={{ "--stagger-delay": delay() } as React.CSSProperties}
          >
            <p className="eyebrow mb-4">Release readiness · PRD-118</p>

            <div className="flex items-center justify-between border-b border-[var(--border-soft)] py-[0.7rem] text-[0.82rem] text-[var(--text-2)]">
              <span>PRD approved</span>
              <Badge className="bg-[var(--green-bg)] px-2 py-[0.15rem] text-[0.62rem] font-bold tracking-[0.05em] text-[var(--green)] uppercase">
                Passed
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] py-[0.7rem] text-[0.82rem] text-[var(--text-2)]">
              <span>Tasks complete</span>
              <Badge className="bg-[var(--green-bg)] px-2 py-[0.15rem] text-[0.62rem] font-bold tracking-[0.05em] text-[var(--green)] uppercase">
                Passed
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] py-[0.7rem] text-[0.82rem] text-[var(--text-2)]">
              <span>AI re-review</span>
              <Badge className="bg-[var(--oxblood-pale)] px-2 py-[0.15rem] text-[0.62rem] font-bold tracking-[0.05em] text-[var(--oxblood)] uppercase">
                Running
              </Badge>
            </div>
            <div className="flex items-center justify-between py-[0.7rem] text-[0.82rem] text-[var(--text-2)]">
              <span>Human approval</span>
              <Badge className="bg-[var(--border-soft)] px-2 py-[0.15rem] text-[0.62rem] font-bold tracking-[0.05em] text-[var(--text-3)] uppercase">
                Waiting
              </Badge>
            </div>

            <div className="mt-5">
              {SCORES.map((score) => (
                <div key={score.label} className="mb-[0.7rem] flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[0.72rem] text-[var(--text-2)]">
                    {score.label}
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className="score-fill"
                      style={
                        {
                          "--target-w": score.w,
                          "--stagger-delay": delay(),
                        } as React.CSSProperties
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
