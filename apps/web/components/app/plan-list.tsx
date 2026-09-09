"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  KanbanIcon,
  CheckCircle2Icon,
  LockIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { StatusBadge } from "./status-badge";

type PlanRow = {
  featureRequestId: string;
  prdId: string | null;
  requestRawContent: string;
  status: string;
  planApprovedAt: Date | string | null;
  createdAt: Date | string;
  taskCount: number;
  doneCount: number;
};

function titleOf(raw: string): string {
  const sep = raw.indexOf("\n\n");
  const title = (sep === -1 ? raw : raw.slice(0, sep)).trim();
  return title || "Untitled request";
}

export function PlanList() {
  const trpc = useTRPC();
  const { data: plans, isLoading } = useQuery(
    trpc.task.listPlans.queryOptions(),
  );

  const total = plans?.length ?? 0;
  const approved =
    plans?.filter((p) => p.status === "plan-approved").length ?? 0;

  return (
    <>
      {/* Page header */}
      <div
        className="flex items-end justify-between gap-4 pb-6"
        style={{ borderBottom: "1px solid var(--border-hair)" }}
      >
        <div className="fade-up" style={{ "--d": "0s" } as React.CSSProperties}>
          <p className="eyebrow mb-2">Plan</p>
          <h1 className="h-section">
            Specs broken into <em>tasks.</em>
          </h1>
          <p
            className="mt-2 max-w-sm text-sm leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            Every approved PRD that has an engineering plan. Open a board to
            manage the work, or approve a plan to lock it for development.
          </p>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-2 gap-3 py-5">
          <Stat value={total} label="Plans" />
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
        <EmptyPlans />
      ) : (
        <div className="grid gap-3 pt-5">
          {plans!.map((plan, i) => (
            <PlanCard
              key={plan.featureRequestId}
              plan={plan as PlanRow}
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
        className="text-[0.72rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
    </div>
  );
}

function PlanCard({
  plan,
  style,
}: {
  plan: PlanRow;
  style?: React.CSSProperties;
}) {
  const locked = plan.status === "plan-approved";

  return (
    <Link
      href={`/dashboard/requests/${plan.featureRequestId}/board`}
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
        <StatusBadge status={plan.status} />
        {locked && (
          <span
            className="inline-flex items-center gap-1 text-[0.7rem]"
            style={{ color: "var(--green)" }}
          >
            <LockIcon className="size-3" />
            Locked
          </span>
        )}
      </div>

      <div className="flex items-start gap-2.5">
        <KanbanIcon
          className="mt-0.5 size-4 shrink-0"
          style={{ color: "var(--text-3)" }}
        />
        <h3
          className="text-[0.9rem] font-medium leading-snug"
          style={{ color: "var(--text-1)" }}
        >
          {titleOf(plan.requestRawContent)}
        </h3>
      </div>

      {/* Task tally */}
      <div className="flex items-center gap-3 pl-[26px]">
        <span
          className="text-[0.74rem] tabular-nums"
          style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)" }}
        >
          {plan.taskCount} task{plan.taskCount === 1 ? "" : "s"}
        </span>
        {plan.taskCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[0.74rem] tabular-nums"
            style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}
          >
            <CheckCircle2Icon className="size-3" />
            {plan.doneCount} done
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span
          className="text-[0.74rem] font-medium transition-colors group-hover:underline"
          style={{ color: "var(--oxblood)" }}
        >
          Open board
        </span>
        <ArrowRightIcon
          className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
          style={{ color: "var(--text-3)" }}
        />
      </div>
    </Link>
  );
}

function EmptyPlans() {
  return (
    <div
      className="mt-5 flex flex-col items-start gap-3 rounded-[10px] px-6 py-12"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <KanbanIcon className="size-6" style={{ color: "var(--text-3)" }} />
      <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
        No plans yet
      </p>
      <p
        className="max-w-sm text-[0.82rem] leading-relaxed"
        style={{ color: "var(--text-2)" }}
      >
        Approve a PRD and ShipFlow breaks it into engineering tasks — the plan
        and its board show up here.
      </p>
      <Link
        href="/dashboard/prds"
        className="mt-1 text-[0.82rem] font-medium transition-colors hover:underline"
        style={{ color: "var(--oxblood)" }}
      >
        Go to PRDs →
      </Link>
    </div>
  );
}
