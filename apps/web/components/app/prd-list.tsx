"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, FileTextIcon, CheckCircle2Icon } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";

type PrdRow = {
  id: string;
  featureRequestId: string;
  status: string;
  problemStatement: string;
  approvedAt: Date | string | null;
  createdAt: Date | string;
  requestRawContent: string;
};

function titleOf(raw: string): string {
  const sep = raw.indexOf("\n\n");
  const title = (sep === -1 ? raw : raw.slice(0, sep)).trim();
  return title || "Untitled request";
}

function excerptOf(text: string): string {
  const t = text.trim();
  return t.length > 160 ? t.slice(0, 160).trimEnd() + "…" : t;
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function PrdList() {
  const trpc = useTRPC();
  const { data: prds, isLoading } = useQuery(trpc.prd.list.queryOptions());

  const total = prds?.length ?? 0;
  const approved = prds?.filter((p) => p.status === "approved").length ?? 0;

  return (
    <>
      {/* Page header */}
      <div
        className="flex items-end justify-between gap-4 pb-6"
        style={{ borderBottom: "1px solid var(--border-hair)" }}
      >
        <div className="fade-up" style={{ "--d": "0s" } as React.CSSProperties}>
          <p className="eyebrow mb-2">PRDs</p>
          <h1 className="h-section">
            Specs ready to <em>build.</em>
          </h1>
          <p
            className="mt-2 text-sm leading-relaxed max-w-sm"
            style={{ color: "var(--text-2)" }}
          >
            Every generated PRD. Review and approve one to unlock task planning.
          </p>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-2 gap-3 py-5">
          <Stat value={total} label="Total PRDs" />
          <Stat value={approved} label="Approved" />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-3 pt-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 rounded-[10px]"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-hair)",
                animationDelay: `${i * 0.06}s`,
              }}
            />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyPrds />
      ) : (
        <div className="grid gap-3 pt-5">
          {prds!.map((prd, i) => (
            <PrdCard
              key={prd.id}
              prd={prd}
              style={{ "--card-delay": `${i * 0.05}s` } as React.CSSProperties}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[10px] p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <span
        className="text-2xl font-medium tabular-nums"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--text-1)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      <span
        className="text-[0.72rem] uppercase tracking-wider font-semibold"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
    </div>
  );
}

function PrdCard({
  prd,
  style,
}: {
  prd: PrdRow;
  style?: React.CSSProperties;
}) {
  const isApproved = prd.status === "approved";

  return (
    <Link
      href={`/dashboard/requests/${prd.featureRequestId}`}
      className="card-stagger group flex flex-col gap-3 rounded-[10px] p-5 transition-all duration-200"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-hair)",
        ...style,
      }}
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
        <PrdStatusPill approved={isApproved} />
        <span
          className="text-[0.7rem] tabular-nums"
          style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
        >
          {formatDate(prd.createdAt)}
        </span>
      </div>

      <div className="flex items-start gap-2.5">
        <FileTextIcon
          className="mt-0.5 size-4 shrink-0"
          style={{ color: "var(--text-3)" }}
        />
        <div>
          <h3
            className="text-[0.9rem] font-medium leading-snug"
            style={{ color: "var(--text-1)" }}
          >
            {titleOf(prd.requestRawContent)}
          </h3>
          {prd.problemStatement && (
            <p
              className="mt-1 text-[0.8rem] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              {excerptOf(prd.problemStatement)}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end">
        <ArrowRightIcon
          className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
          style={{ color: "var(--text-3)" }}
        />
      </div>
    </Link>
  );
}

function PrdStatusPill({ approved }: { approved: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
      style={{
        background: approved ? "var(--green-bg)" : "var(--amber-bg)",
        color: approved ? "var(--green)" : "var(--amber)",
        fontSize: "0.62rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {approved ? (
        <CheckCircle2Icon className="size-3" />
      ) : (
        <span
          className="size-1.5 rounded-full shrink-0"
          style={{ background: "var(--amber)" }}
        />
      )}
      {approved ? "Approved" : "Drafted"}
    </span>
  );
}

function EmptyPrds() {
  return (
    <div
      className="mt-5 flex flex-col items-center gap-3 rounded-[10px] px-6 py-16 text-center"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <FileTextIcon className="size-6" style={{ color: "var(--text-3)" }} />
      <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
        No PRDs yet
      </p>
      <p
        className="max-w-xs text-[0.82rem] leading-relaxed"
        style={{ color: "var(--text-2)" }}
      >
        Submit a feature request — once it's clarified and confirmed new, the AI
        drafts a PRD and it shows up here.
      </p>
      <Link
        href="/dashboard/requests"
        className="mt-1 text-[0.82rem] font-medium transition-colors hover:underline"
        style={{ color: "var(--oxblood)" }}
      >
        Go to requests →
      </Link>
    </div>
  );
}
