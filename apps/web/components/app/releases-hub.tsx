"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  RocketIcon,
  UserIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { StatusBadge } from "./status-badge";

type ReleasePR = {
  id: string;
  number: number;
  title: string;
  htmlUrl: string;
  merged: boolean;
  state: string;
};

type ReleaseRow = {
  featureRequestId: string;
  rawContent: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string | null;
  approvedBy: { name: string | null; email: string | null; at: Date | string } | null;
  pullRequests: ReleasePR[];
};

function titleOf(raw: string): string {
  const sep = raw.indexOf("\n\n");
  const title = (sep === -1 ? raw : raw.slice(0, sep)).trim();
  return title || "Untitled request";
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ReleasesHub() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.release.list.queryOptions());

  const rows = (data ?? []) as ReleaseRow[];
  const total = rows.length;

  return (
    <>
      {/* Page header */}
      <div
        className="flex items-end justify-between gap-4 pb-6"
        style={{ borderBottom: "1px solid var(--border-hair)" }}
      >
        <div className="fade-up" style={{ "--d": "0s" } as React.CSSProperties}>
          <p className="eyebrow mb-2">Releases</p>
          <h1 className="h-section">
            Everything you've <em>shipped.</em>
          </h1>
          <p
            className="mt-2 max-w-md text-sm leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            The record of every released feature — who approved it, when, and the
            pull request that carried it. Closing the loop on the throughline.
          </p>
        </div>
      </div>

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
              }}
            />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyReleases />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 py-5 sm:grid-cols-2">
            <Stat value={total} label="Shipped" accent="var(--green)" />
            <Stat
              value={rows.filter((r) => r.pullRequests.some((p) => p.merged)).length}
              label="With merged PR"
            />
          </div>
          <div className="grid gap-3">
            {rows.map((row) => (
              <ReleaseCard key={row.featureRequestId} row={row} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ReleaseCard({ row }: { row: ReleaseRow }) {
  const approver = row.approvedBy;
  const approverName = approver?.name || approver?.email || "Unknown";
  const pr = row.pullRequests[0] ?? null;

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
        {approver && (
          <span
            className="text-[0.72rem] tabular-nums"
            style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
          >
            {formatDate(approver.at)}
          </span>
        )}
      </div>

      <h3
        className="text-[0.9rem] font-medium leading-snug"
        style={{ color: "var(--text-1)" }}
      >
        {titleOf(row.rawContent)}
      </h3>

      {/* Release record: approver + linked PR */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className="inline-flex items-center gap-1.5 text-[0.76rem]"
          style={{ color: "var(--text-2)" }}
        >
          <UserIcon className="size-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
          Approved by{" "}
          <span style={{ color: "var(--text-1)", fontWeight: 500 }}>
            {approverName}
          </span>
        </span>

        {pr && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              window.open(pr.htmlUrl, "_blank", "noopener,noreferrer");
            }}
            className="inline-flex items-center gap-1.5 text-[0.76rem] hover:underline"
            style={{ color: "var(--text-2)" }}
          >
            <GitPullRequestIcon
              className="size-3.5 shrink-0"
              style={{ color: "var(--text-3)" }}
            />
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
              #{pr.number}
            </span>
            <span className="max-w-[14rem] truncate">{pr.title || "Pull request"}</span>
            <ExternalLinkIcon
              className="size-3 shrink-0"
              style={{ color: "var(--text-3)" }}
            />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[0.72rem]" style={{ color: "var(--text-3)" }}>
          {row.pullRequests.length > 1
            ? `${row.pullRequests.length} linked pull requests`
            : ""}
        </span>
        <span
          className="inline-flex items-center gap-1 text-[0.74rem] font-medium transition-colors group-hover:underline"
          style={{ color: "var(--oxblood)" }}
        >
          View feature
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

function EmptyReleases() {
  return (
    <div
      className="mt-5 flex flex-col items-start gap-3 rounded-[10px] px-6 py-12"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <RocketIcon className="size-6" style={{ color: "var(--text-3)" }} />
      <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
        Nothing shipped yet
      </p>
      <p
        className="max-w-sm text-[0.82rem] leading-relaxed"
        style={{ color: "var(--text-2)" }}
      >
        When a reviewer approves a feature in the cockpit, it ships and lands here
        as a release — with the approver, the date, and the pull request on
        record.
      </p>
      <Link
        href="/dashboard/reviews"
        className="mt-1 text-[0.82rem] font-medium transition-colors hover:underline"
        style={{ color: "var(--oxblood)" }}
      >
        Go to Reviews →
      </Link>
    </div>
  );
}
