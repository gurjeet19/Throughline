"use client";

import { useEffect, useRef, useState } from "react";

const STAGES: [string, string][] = [
  ["Request", "intake"],
  ["PRD", "drafted"],
  ["Tasks", "planned"],
  ["Code", "in dev"],
  ["AI Review", "scored"],
  ["Fixes", "looped"],
  ["Approval", "human"],
  ["Shipped", "live"],
];

const X0 = 58;
const X1 = 1042;

export function PipelineBand() {
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
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="pipeline"
      className="border-t border-[#3a1f24] bg-[var(--surface-deep)] px-[5%] py-[5.5rem]"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-12 max-w-[520px]">
          <p className="eyebrow" style={{ color: "var(--peach-bright)" }}>
            The core loop
          </p>
          <h2 className="h-section mt-3" style={{ color: "var(--text-inv)" }}>
            One thread of context, <em>end to end.</em>
          </h2>
          <p
            className="mt-3.5 text-[0.9rem] leading-[1.7]"
            style={{ color: "#c9b6ae" }}
          >
            No feature skips a stage. The request that arrived on Monday
            carries its full history all the way to the release decision.
          </p>
        </div>

        <div
          ref={wrapRef}
          className={`pipe-svg-wrap${visible ? " is-visible" : ""}`}
        >
          <svg
            viewBox="0 0 1100 64"
            preserveAspectRatio="xMidYMid meet"
            width="100%"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="pipeGrad" x1="0%" x2="100%">
                <stop offset="0%" stopColor="#8B2839" />
                <stop offset="50%" stopColor="#E89A63" />
                <stop offset="100%" stopColor="#8B2839" />
              </linearGradient>
              <filter id="gf">
                <feGaussianBlur stdDeviation="2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <line x1={X0} y1="32" x2={X1} y2="32" stroke="#4A2C30" strokeWidth="1.5" />
            <line
              id="pipe-line"
              x1={X0}
              y1="32"
              x2={X1}
              y2="32"
              stroke="url(#pipeGrad)"
              strokeWidth="1.5"
              filter="url(#gf)"
            />

            <g>
              {STAGES.map((stage, i) => {
                const cx = X0 + (X1 - X0) * (i / (STAGES.length - 1));
                return (
                  <circle
                    key={stage[0]}
                    className="node-dot"
                    cx={cx}
                    cy="32"
                    r="5.5"
                    style={
                      { "--node-delay": `${0.15 + i * 0.21}s` } as React.CSSProperties
                    }
                  />
                );
              })}
            </g>

            <circle id="traveler" cy="32" r="4" fill="#E89A63" filter="url(#gf)" />
          </svg>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-8 sm:gap-2">
          {STAGES.map(([title, sub]) => (
            <div key={title} className="text-center">
              <div
                className="text-[0.74rem] font-semibold tracking-[0.01em]"
                style={{ color: "var(--text-inv)" }}
              >
                {title}
              </div>
              <div
                className="mt-1 font-mono text-[0.62rem]"
                style={{ color: "#8e7770" }}
              >
                {sub}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
