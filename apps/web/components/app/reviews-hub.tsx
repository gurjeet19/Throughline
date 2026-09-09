"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  ShieldCheckIcon,
  AlertOctagonIcon,
  WrenchIcon,
  ScanSearchIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { StatusBadge } from "./status-badge";

type ReviewSummary = {
  status: string;
  blockingCount: number;
  nonBlockingCount: number;
  createdAt: Date | string;
  postedAt: Date | string | null;
};

type QueueRow = {
  featureRequestId: string;
  rawContent: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
  review: ReviewSummary | null;
};

function titleOf(raw: string): string {
  const sep = raw.indexOf("\n\n");
  const title = (sep === -1 ? raw : raw.slice(0, sep)).trim();
  return title || "Untitled request";
}

/** Cockpit ordering: the human decision comes first, then the fix loop. */
const SECTIONS: {
  status: string;
  eyebrow: string;
  blurb: string;
  icon: React.ElementType;
}[] = [
  {
    status: "awaiting-approval",
    eyebrow: "Ready for approval",
    blurb: "No blocking issues remain — a human makes the final call to ship.",
    icon: ShieldCheckIcon,
  },
  {
    status: "fix-needed",
    eyebrow: "Needs fixes",
    blurb: "Blocking issues to resolve. Pushing a fix re-runs the review.",
    icon: WrenchIcon,
  },
  {
    status: "in-review",
    eyebrow: "In review",
    blurb: "The AI QA review is evaluating the latest code.",
    icon: ScanSearchIcon,
  },
];

export function ReviewsHub() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery({
    ...trpc.review.queue.queryOptions(),
    // Reviews complete asynchronously — poll while anything is still being
    // reviewed so verdicts and section moves surface without a manual refresh.
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as QueueRow[];
      const working = rows.some(
        (r) =>
          r.status === "in-review" ||
          r.review?.status === "pending" ||
          r.review?.status === "running",
      );
      return working ? 4000 : false;
    },
  });

  const rows = (data ?? []) as QueueRow[];
  const total = rows.length;
  const ready = rows.filter((r) => r.status === "awaiting-approval").length;
  const fixing = rows.filter((r) => r.status === "fix-needed").length;

  return (
    <>
      {/* Page header */}
      <div
        className="flex items-end justify-between gap-4 pb-6"
        style={{ borderBottom: "1px solid var(--border-hair)" }}
      >
        <div className="fade-up" style={{ "--d": "0s" } as React.CSSProperties}>
          <p className="eyebrow mb-2">Reviews</p>
          <h1 className="h-section">
            From review to <em>release.</em>
          </h1>
          <p
            className="mt-2 max-w-md text-sm leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            Every feature in the review loop, with its AI verdict. Approve the
            ready ones, send the rest back for fixes.
          </p>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-3 gap-3 py-5">
          <Stat value={total} label="In loop" />
          <Stat value={ready} label="Ready" accent="var(--amber)" />
          <Stat value={fixing} label="Needs fixes" accent="var(--red-err)" />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-3 pt-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 rounded-[10px]"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-hair)",
              }}
            />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyQueue />
      ) : (
        <div className="flex flex-col gap-8 pt-5">
          {SECTIONS.map((section) => {
            const items = rows.filter((r) => r.status === section.status);
            if (items.length === 0) return null;
            return (
              <Section key={section.status} section={section} count={items.length}>
                <div className="grid gap-3">
                  {items.map((row) => (
                    <ReviewCard key={row.featureRequestId} row={row} />
                  ))}
                </div>
              </Section>
            );
          })}
        </div>
      )}
    </>
  );
}

function Section({
  section,
  count,
  children,
}: {
  section: { eyebrow: string; blurb: string; icon: React.ElementType };
  count: number;
  children: React.ReactNode;
}) {
  const Icon = section.icon;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0" style={{ color: "var(--text-3)" }} />
        <p className="eyebrow">{section.eyebrow}</p>
        <span
          className="text-[0.7rem] tabular-nums"
          style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
        >
          {count}
        </span>
      </div>
      <p className="text-[0.8rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
        {section.blurb}
      </p>
      {children}
    </section>
  );
}

function verdictOf(review: ReviewSummary | null): {
  label: string;
  color: string;
} {
  if (!review || review.status !== "completed") {
    return { label: "Reviewing…", color: "var(--text-3)" };
  }
  if (review.blockingCount > 0) {
    return {
      label: `${review.blockingCount} blocking`,
      color: "var(--red-err)",
    };
  }
  return { label: "No blocking issues", color: "var(--green)" };
}

function ReviewCard({ row }: { row: QueueRow }) {
  const verdict = verdictOf(row.review);
  const blocking = row.review?.status === "completed" && row.review.blockingCount > 0;

  return (
    <Link
      href={`/dashboard/requests/${row.featureRequestId}`}
      className="group flex flex-col gap-3 rounded-[10px] p-5 transition-all duration-200"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--peach-light)";
        el.style.transform = "translateY(-1px)";
        el.style.boxShadow = "var(--shadow-sm)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--border-hair)";
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={row.status} />
        <span
          className="inline-flex items-center gap-1.5 text-[0.72rem] font-medium"
          style={{ color: verdict.color }}
        >
          {blocking && <AlertOctagonIcon className="size-3.5" />}
          {verdict.label}
        </span>
      </div>

      <h3
        className="text-[0.9rem] font-medium leading-snug"
        style={{ color: "var(--text-1)" }}
      >
        {titleOf(row.rawContent)}
      </h3>

      <div className="flex items-center justify-between">
        <span
          className="text-[0.72rem] tabular-nums"
          style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
        >
          {row.review?.status === "completed"
            ? `${row.review.nonBlockingCount} non-blocking`
            : ""}
        </span>
        <span
          className="inline-flex items-center gap-1 text-[0.74rem] font-medium transition-colors group-hover:underline"
          style={{ color: "var(--oxblood)" }}
        >
          Open review
          <ArrowRightIcon className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function Stat({
  value,
  label,
  accent,
}: {
  value: number;
  label: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[10px] p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <span
        className="text-2xl font-medium tabular-nums"
        style={{
          fontFamily: "var(--font-mono)",
          color: accent ?? "var(--text-1)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      <span
        className="text-[0.72rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
    </div>
  );
}

function EmptyQueue() {
  return (
    <div
      className="mt-5 flex flex-col items-start gap-3 rounded-[10px] px-6 py-12"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <ShieldCheckIcon className="size-6" style={{ color: "var(--text-3)" }} />
      <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
        Nothing in review
      </p>
      <p
        className="max-w-sm text-[0.82rem] leading-relaxed"
        style={{ color: "var(--text-2)" }}
      >
        When a pull request is linked to a feature, ShipFlow runs an AI QA review
        and the feature shows up here — ready to approve or send back for fixes.
      </p>
      <Link
        href="/dashboard/plans"
        className="mt-1 text-[0.82rem] font-medium transition-colors hover:underline"
        style={{ color: "var(--oxblood)" }}
      >
        Go to Plan →
      </Link>
    </div>
  );
}
