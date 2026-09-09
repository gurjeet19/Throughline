"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  GitBranchIcon,
  PencilIcon,
  RocketIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { RequestCard } from "./request-card";
import { ProjectFormDialog } from "./project-form-dialog";

function RollupStat({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[10px] p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <span
        className="text-2xl font-medium tabular-nums"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)", letterSpacing: "-0.02em" }}
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

export function ProjectDetail({ id }: { id: string }) {
  const trpc = useTRPC();
  const [editOpen, setEditOpen] = useState(false);
  const { data, isLoading, isError } = useQuery(
    trpc.project.get.queryOptions({ id }),
  );

  if (isLoading) {
    return (
      <div
        className="h-40 rounded-[10px]"
        style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
      />
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1.5 text-[0.8rem]"
          style={{ color: "var(--text-3)" }}
        >
          <ArrowLeftIcon className="size-3.5" />
          Projects
        </Link>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          This project could not be found.
        </p>
      </div>
    );
  }

  const { project, features, repositories, lifecycle } = data;
  const sortedFeatures = [...features].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <>
      <Link
        href="/dashboard/projects"
        className="mb-5 inline-flex items-center gap-1.5 text-[0.8rem] transition-colors"
        style={{ color: "var(--text-3)" }}
      >
        <ArrowLeftIcon className="size-3.5" />
        Projects
      </Link>

      {/* Header */}
      <div
        className="flex items-start justify-between gap-4 pb-6"
        style={{ borderBottom: "1px solid var(--border-hair)" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <p className="eyebrow">Project</p>
            {project.isDefault && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider"
                style={{ background: "var(--muted)", color: "var(--text-3)" }}
              >
                Default
              </span>
            )}
          </div>
          <h1 className="h-section mt-1">{project.name}</h1>
          {project.description && (
            <p
              className="mt-2 max-w-md text-sm leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              {project.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[0.78rem] font-medium transition-colors"
          style={{
            background: "var(--muted)",
            color: "var(--text-2)",
            border: "1px solid var(--border-hair)",
          }}
        >
          <PencilIcon className="size-3.5" />
          Rename
        </button>
      </div>

      {/* Lifecycle rollup */}
      <div className="grid grid-cols-3 gap-3 py-5">
        <RollupStat value={lifecycle.total} label="Requests" />
        <RollupStat value={lifecycle.inFlight} label="In flight" />
        <RollupStat value={lifecycle.shipped} label="Shipped" />
      </div>

      {/* Connected repositories */}
      {repositories.length > 0 && (
        <section className="flex flex-col gap-2.5 pb-5">
          <p className="eyebrow">Connected repositories</p>
          <div className="flex flex-wrap gap-2">
            {repositories.map((repo) => (
              <span
                key={repo.id}
                className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[0.78rem]"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-hair)",
                  color: "var(--text-2)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <GitBranchIcon className="size-3.5" style={{ color: "var(--text-3)" }} />
                {repo.owner}/{repo.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Feature requests */}
      <section className="flex flex-col gap-3">
        <p className="eyebrow">Feature requests</p>
        {sortedFeatures.length === 0 ? (
          <div
            className="flex items-center gap-2.5 rounded-[10px] p-4"
            style={{ background: "var(--muted)", border: "1px solid var(--border-hair)" }}
          >
            <RocketIcon className="size-4 shrink-0" style={{ color: "var(--text-3)" }} />
            <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
              No feature requests in this project yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {sortedFeatures.map((req) => (
              <RequestCard key={req.id} request={req} />
            ))}
          </div>
        )}
      </section>

      <ProjectFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
        }}
      />
    </>
  );
}
