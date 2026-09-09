"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { useActiveProject } from "@/lib/active-project";
import { Button } from "@/components/ui/button";
import { RequestCard } from "./request-card";
import { RequestFormSheet } from "./request-form-sheet";
import { EmptyState } from "./empty-state";

function StatCard({
  value,
  label,
  delay,
}: {
  value: number;
  label: string;
  delay: string;
}) {
  return (
    <div
      className="stat-stagger flex flex-col gap-1.5 rounded-[10px] p-4"
      style={
        {
          background: "var(--surface)",
          border: "1px solid var(--border-hair)",
          "--stat-delay": delay,
        } as React.CSSProperties
      }
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

function SkeletonCard({ delay }: { delay: string }) {
  return (
    <div
      className="rounded-[10px] p-5"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-hair)",
        animationDelay: delay,
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="h-4 w-20 rounded-full"
          style={{ background: "var(--muted)" }}
        />
        <div
          className="h-3 w-24 rounded"
          style={{ background: "var(--muted)" }}
        />
      </div>
      <div
        className="h-4 w-3/4 rounded mb-2"
        style={{ background: "var(--muted)" }}
      />
      <div
        className="h-3 w-full rounded mb-1"
        style={{ background: "var(--border-hair)" }}
      />
      <div
        className="h-3 w-2/3 rounded"
        style={{ background: "var(--border-hair)" }}
      />
    </div>
  );
}

/** Statuses meaning a PRD has been drafted for the request (drafted onward). */
const PRD_REACHED_STATUSES = new Set([
  "prd-drafted",
  "prd-approved",
  "tasks-planned",
  "plan-approved",
]);

export function RequestList() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const trpc = useTRPC();
  const { activeProjectId } = useActiveProject();

  const { data: requests, isLoading } = useQuery(
    trpc.featureRequest.list.queryOptions(
      activeProjectId ? { projectId: activeProjectId } : undefined,
    ),
  );

  const total = requests?.length ?? 0;
  const clarifying =
    requests?.filter((r) => r.status === "clarifying").length ?? 0;
  // "PRD Drafted" is cumulative: once a request has a PRD it stays counted as
  // it advances (prd-approved → tasks-planned → plan-approved), rather than
  // dropping to zero the moment the PRD is approved.
  const drafted =
    requests?.filter((r) => PRD_REACHED_STATUSES.has(r.status)).length ?? 0;

  return (
    <>
      {/* Page header */}
      <div
        className="flex items-end justify-between gap-4 pb-6"
        style={{ borderBottom: "1px solid var(--border-hair)" }}
      >
        <div className="fade-up" style={{ "--d": "0s" } as React.CSSProperties}>
          <p className="eyebrow mb-2">Feature Requests</p>
          <h1 className="h-section">
            What customers want{" "}
            <em>next.</em>
          </h1>
          <p
            className="mt-2 text-sm leading-relaxed max-w-sm"
            style={{ color: "var(--text-2)" }}
          >
            Every request captured, triaged by AI, and turned into a shipped
            feature.
          </p>
        </div>

        <div
          className="fade-up shrink-0"
          style={{ "--d": "0.08s" } as React.CSSProperties}
        >
          <Button onClick={() => setSheetOpen(true)} size="sm" className="gap-1.5">
            <PlusIcon className="size-3.5" />
            New request
          </Button>
        </div>
      </div>

      {/* Stats row */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-3 gap-3 py-5">
          <StatCard value={total} label="Total" delay="0.05s" />
          <StatCard value={clarifying} label="Clarifying" delay="0.1s" />
          <StatCard value={drafted} label="PRD Drafted" delay="0.15s" />
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-3 pt-5">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} delay={`${i * 0.06}s`} />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyState onNew={() => setSheetOpen(true)} />
      ) : (
        <div className="grid gap-3 pt-5">
          {[...requests!]
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .map((req, i) => (
              <RequestCard
                key={req.id}
                request={req}
                style={
                  {
                    "--card-delay": `${i * 0.05}s`,
                  } as React.CSSProperties
                }
                className="card-stagger"
              />
            ))}
        </div>
      )}

      <RequestFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
