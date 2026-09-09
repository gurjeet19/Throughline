"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  GitBranchIcon,
  PencilIcon,
  PlusIcon,
  RocketIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { ProjectFormDialog } from "./project-form-dialog";

type ProjectRollup = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  featureCount: number;
  shippedCount: number;
  inFlightCount: number;
  repositoryCount: number;
};

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
      {icon}
      <span className="text-[0.78rem] tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
        {value}
      </span>
      <span className="text-[0.72rem]" style={{ color: "var(--text-3)" }}>
        {label}
      </span>
    </div>
  );
}

export function ProjectList() {
  const trpc = useTRPC();
  const { data: projects, isLoading } = useQuery(
    trpc.project.listWithRollup.queryOptions(),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRollup | null>(null);

  return (
    <>
      <div
        className="flex items-end justify-between gap-4 pb-6"
        style={{ borderBottom: "1px solid var(--border-hair)" }}
      >
        <div className="fade-up" style={{ "--d": "0s" } as React.CSSProperties}>
          <p className="eyebrow mb-2">Projects</p>
          <h1 className="h-section">
            Work, grouped by <em>project.</em>
          </h1>
          <p
            className="mt-2 text-sm leading-relaxed max-w-sm"
            style={{ color: "var(--text-2)" }}
          >
            Every feature request lives in a project. Browse each one&apos;s
            pipeline, repositories, and progress.
          </p>
        </div>
        <div className="fade-up shrink-0" style={{ "--d": "0.08s" } as React.CSSProperties}>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
            <PlusIcon className="size-3.5" />
            New project
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 pt-5 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-32 rounded-[10px]"
              style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 pt-5 sm:grid-cols-2">
          {(projects as ProjectRollup[] | undefined)?.map((p) => (
            <div
              key={p.id}
              className="group relative flex flex-col gap-3 rounded-[10px] p-5 transition-colors"
              style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    className="text-[0.92rem] font-medium transition-colors"
                    style={{ color: "var(--text-1)" }}
                  >
                    {p.name}
                  </Link>
                  {p.isDefault && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider"
                      style={{ background: "var(--muted)", color: "var(--text-3)" }}
                    >
                      Default
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  aria-label={`Rename ${p.name}`}
                  className="shrink-0 rounded-md p-1 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
                  style={{ color: "var(--text-3)" }}
                >
                  <PencilIcon className="size-3.5" />
                </button>
              </div>

              {p.description && (
                <p
                  className="text-[0.8rem] leading-relaxed"
                  style={{ color: "var(--text-2)" }}
                >
                  {p.description}
                </p>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
                <Stat
                  icon={<ArrowRightIcon className="size-3.5" style={{ color: "var(--text-3)" }} />}
                  value={p.featureCount}
                  label={p.featureCount === 1 ? "request" : "requests"}
                />
                <Stat
                  icon={<RocketIcon className="size-3.5" style={{ color: "var(--green)" }} />}
                  value={p.shippedCount}
                  label="shipped"
                />
                <Stat
                  icon={<GitBranchIcon className="size-3.5" style={{ color: "var(--text-3)" }} />}
                  value={p.repositoryCount}
                  label={p.repositoryCount === 1 ? "repo" : "repos"}
                />
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  className="ml-auto inline-flex items-center gap-1 text-[0.74rem] font-medium transition-colors"
                  style={{ color: "var(--text-3)" }}
                >
                  Open
                  <ArrowRightIcon className="size-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProjectFormDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ProjectFormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        project={
          editing
            ? { id: editing.id, name: editing.name, description: editing.description }
            : undefined
        }
      />
    </>
  );
}
