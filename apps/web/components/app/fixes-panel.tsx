"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BotIcon,
  CheckCircle2Icon,
  GitBranchIcon,
  LayoutGridIcon,
  ShieldAlertIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { AgentPanel } from "./agent-panel";
import { toast } from "sonner";

type Finding = {
  dimension: string;
  severity: "blocking" | "non-blocking";
  title: string;
  explanation: string;
  recommendation: string;
  file: string | null;
  line: number | null;
};

type Review = {
  id: string;
  status: string;
  summary: string;
  blockingCount: number;
  findings: Finding[];
} | null;

type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  seq: number;
  kind: string;
  reviewId: string | null;
  requirementRefs: string[];
};

const TASK_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  todo: { label: "To do", color: "var(--amber)", bg: "var(--amber-bg)" },
  "in-progress": { label: "In progress", color: "var(--blue)", bg: "var(--blue-bg)" },
  done: { label: "Done", color: "var(--green)", bg: "var(--green-bg)" },
};

/**
 * Fixes Plan tab. When a review flags blocking issues, the feature
 * enters `fix-needed`: the issues are turned into fix tasks (on the board, in
 * todo) and the team chooses who resolves them — a developer who pushes fixes,
 * or the Throughline agent. Either way a new commit triggers an automatic
 * re-review, looping until nothing blocking remains.
 */
export function FixesPanel({
  requestId,
  requestStatus,
  implementer,
}: {
  requestId: string;
  requestStatus: string;
  implementer: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const isFixNeeded = requestStatus === "fix-needed";

  const { data: reviewData } = useQuery({
    ...trpc.review.getForFeature.queryOptions({ featureRequestId: requestId }),
    // Poll while a review is running, and while the feature still needs a fix —
    // after a fix is pushed we're waiting on GitHub's webhook to start the
    // re-review, so keep checking until it appears (and then while it runs).
    refetchInterval: (q) =>
      (q.state.data as Review)?.status === "running" || isFixNeeded ? 3000 : false,
  });
  const review = reviewData as Review;

  const { data: taskData } = useQuery({
    ...trpc.task.list.queryOptions({ featureRequestId: requestId }),
    refetchInterval: requestStatus === "fix-needed" ? 4000 : false,
  });
  const allTasks = (taskData ?? []) as TaskRow[];

  const { data: dev } = useQuery(
    trpc.github.featureDevelopment.queryOptions({ featureRequestId: requestId }),
  );

  const { data: loop } = useQuery({
    ...trpc.review.fixLoopStatus.queryOptions({ featureRequestId: requestId }),
    enabled: isFixNeeded,
  });
  // The auto-fix circuit breaker has tripped: too many review rounds without
  // converging, so no further AI fix plan will be generated — a human takes over.
  const capped = Boolean(loop?.capped);

  const blocking = (review?.findings ?? []).filter((f) => f.severity === "blocking");
  // The fix plan for the current review run; falls back to all fix tasks so a
  // prior loop's tasks still render once the verdict has moved on.
  const fixTasks = allTasks
    .filter((t) => t.kind === "fix")
    .filter((t) => !review || !t.reviewId || t.reviewId === review.id)
    .sort((a, b) => a.seq - b.seq);
  // Show the "planning" spinner only while a plan is actually coming — never once
  // the breaker has capped the loop, or it would spin forever.
  const planning =
    isFixNeeded && !capped && blocking.length > 0 && fixTasks.length === 0;

  // Once the review verdict clears (re-review passed), pull the fresh request so
  // the surrounding status badge + tabs update in step.
  useEffect(() => {
    if (review?.status === "completed" && review.blockingCount === 0) {
      queryClient.invalidateQueries({
        queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review?.status, review?.blockingCount]);

  if (!isFixNeeded && fixTasks.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <p className="eyebrow">Fixes plan</p>
        <div
          className="flex items-center gap-2.5 rounded-[10px] p-4"
          style={{ background: "var(--green-bg)", border: "1px solid var(--border-hair)" }}
        >
          <CheckCircle2Icon className="size-4 shrink-0" style={{ color: "var(--green)" }} />
          <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
            No fixes outstanding. If a review flags blocking issues, the
            remediation plan appears here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <p className="eyebrow">Fixes plan</p>
        {fixTasks.length > 0 && (
          <Link
            href={`/dashboard/requests/${requestId}/board`}
            className="inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[0.78rem] font-medium transition-colors"
            style={{
              background: "var(--muted)",
              color: "var(--text-2)",
              border: "1px solid var(--border-hair)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--peach-light)";
              e.currentTarget.style.color = "var(--oxblood)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-hair)";
              e.currentTarget.style.color = "var(--text-2)";
            }}
          >
            <LayoutGridIcon className="size-3.5" />
            Open board
          </Link>
        )}
      </div>

      {/* Verdict strip */}
      {isFixNeeded && (
        <div
          className="flex flex-col gap-2.5 rounded-[10px] p-4"
          style={{ background: "var(--red-bg)", border: "1px solid var(--border-hair)" }}
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlertIcon className="size-4 shrink-0" style={{ color: "var(--red-err)" }} />
            <span className="text-[0.84rem] font-medium" style={{ color: "var(--red-err)" }}>
              {blocking.length} blocking issue{blocking.length === 1 ? "" : "s"} to resolve
            </span>
          </div>
          {review?.summary && (
            <p
              className="text-[0.82rem] leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--text-2)" }}
            >
              {review.summary}
            </p>
          )}
        </div>
      )}

      {/* Circuit-breaker notice: the auto-fix loop stopped without converging. */}
      {isFixNeeded && capped && (
        <div
          className="flex flex-col gap-2 rounded-[10px] p-4"
          style={{ background: "var(--amber-bg)", border: "1px solid var(--border-hair)" }}
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlertIcon className="size-4 shrink-0" style={{ color: "var(--amber)" }} />
            <span className="text-[0.84rem] font-medium" style={{ color: "var(--amber)" }}>
              Auto-fix stopped after {loop?.rounds} review rounds
            </span>
          </div>
          <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
            The review and the agent haven&apos;t converged, so Throughline has
            stopped generating new AI fix plans to avoid an endless loop. A human
            should take over — resolve the remaining blockers on the branch as a
            Developer, then push. The push still triggers a re-review.
          </p>
        </div>
      )}

      {/* Path chooser — who resolves the blockers. */}
      {isFixNeeded && (
        <PathChooser requestId={requestId} implementer={implementer} />
      )}

      {/* Remediation plan: the generated fix tasks. */}
      <FixTaskList tasks={fixTasks} planning={planning} />

      {/* The chosen path's action surface. */}
      {isFixNeeded && implementer === "agent" && (
        <AgentPanel requestId={requestId} mode="fix" />
      )}
      {isFixNeeded && implementer !== "agent" && (
        <DeveloperGuidance
          branch={dev?.started ? dev.branch : null}
          prUrl={
            dev?.started ? dev.linkedPullRequests[0]?.htmlUrl ?? null : null
          }
        />
      )}
    </section>
  );
}

function PathChooser({
  requestId,
  implementer,
}: {
  requestId: string;
  implementer: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.github.featureDevelopment.queryKey({ featureRequestId: requestId }),
    });
  }

  const toAgent = useMutation(
    trpc.agent.switchToAgent.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("The Throughline agent will fix the blockers");
      },
      onError: (err) => toast.error("Couldn't switch", { description: err.message }),
    }),
  );
  const toDeveloper = useMutation(
    trpc.agent.switchToDeveloper.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Handed off to the Developer path");
      },
      onError: (err) => toast.error("Couldn't switch", { description: err.message }),
    }),
  );

  const busy = toAgent.isPending || toDeveloper.isPending;
  const options = [
    {
      id: "developer",
      label: "Developer",
      desc: "A human (or your own coding agent) pushes the fix to the branch.",
      icon: <UserIcon className="size-4" />,
      onPick: () => toDeveloper.mutate({ featureRequestId: requestId }),
    },
    {
      id: "agent",
      label: "Throughline agent",
      desc: "The agent reads the findings and proposes a fix for you to confirm.",
      icon: <BotIcon className="size-4" />,
      onPick: () => toAgent.mutate({ featureRequestId: requestId }),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-[0.7rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        Who fixes this?
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((opt) => {
          const active = (implementer ?? "developer") === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={busy || active}
              onClick={opt.onPick}
              className="flex flex-col gap-1.5 rounded-[10px] p-4 text-left transition-colors disabled:cursor-default"
              style={{
                background: active ? "var(--peach-pale)" : "var(--surface)",
                border: `1px solid ${active ? "var(--oxblood)" : "var(--border-hair)"}`,
              }}
            >
              <span
                className="flex items-center gap-2 text-[0.84rem] font-medium"
                style={{ color: active ? "var(--oxblood)" : "var(--text-1)" }}
              >
                {opt.icon}
                {opt.label}
                {active && <span className="ml-auto text-[0.68rem]">Selected</span>}
              </span>
              <span className="text-[0.74rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeveloperGuidance({
  branch,
  prUrl,
}: {
  branch: string | null;
  prUrl: string | null;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <div className="flex items-center gap-2">
        <UserIcon className="size-4" style={{ color: "var(--text-3)" }} />
        <p className="eyebrow" style={{ color: "var(--text-3)" }}>
          Developer fix
        </p>
      </div>
      <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
        Resolve the fix tasks above, then push your commit to{" "}
        {branch ? (
          <span
            className="rounded-[4px] px-1 py-0.5"
            style={{
              background: "var(--muted)",
              color: "var(--text-1)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.78rem",
            }}
          >
            {branch}
          </span>
        ) : (
          "the feature branch"
        )}
        . The push triggers an automatic re-review — no manual step. The feature
        stays in fix-needed until a review comes back with nothing blocking.
      </p>
      <div className="flex items-center gap-2">
        <GitBranchIcon className="size-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
        {prUrl ? (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[0.78rem] transition-colors"
            style={{ color: "var(--text-2)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--oxblood)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-2)")}
          >
            Open the pull request on GitHub →
          </a>
        ) : (
          <span className="text-[0.78rem]" style={{ color: "var(--text-3)" }}>
            Push to the branch to update the open pull request.
          </span>
        )}
      </div>
    </div>
  );
}

function FixTaskList({ tasks, planning }: { tasks: TaskRow[]; planning: boolean }) {
  if (planning) {
    return (
      <div
        className="flex items-center gap-3 rounded-[10px] p-4"
        style={{ background: "var(--muted)", border: "1px solid var(--border-hair)" }}
      >
        <span
          className="size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent spin-slow"
          style={{ color: "var(--peach)" }}
        />
        <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
          Turning the blocking findings into fix tasks…
        </p>
      </div>
    );
  }

  if (tasks.length === 0) return null;

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <WrenchIcon className="size-3.5" style={{ color: "var(--oxblood)" }} />
        <span
          className="text-[0.7rem] font-semibold uppercase tracking-wider"
          style={{ color: "var(--oxblood)" }}
        >
          Remediation plan · {tasks.length}
        </span>
        {done > 0 && (
          <span className="text-[0.7rem]" style={{ color: "var(--green)" }}>
            {done} done
          </span>
        )}
      </div>
      <div className="grid gap-3">
        {tasks.map((task) => {
          const meta = TASK_STATUS_META[task.status] ?? TASK_STATUS_META.todo;
          return (
            <div
              key={task.id}
              className="flex flex-col gap-2 rounded-[10px] p-4"
              style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
            >
              <div className="flex items-start justify-between gap-2.5">
                <h4
                  className="text-[0.88rem] font-medium leading-snug"
                  style={{ color: "var(--text-1)" }}
                >
                  <span
                    className="mr-1.5"
                    style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
                  >
                    #{task.seq}
                  </span>
                  {task.title}
                </h4>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5"
                  style={{
                    background: meta.bg,
                    color: meta.color,
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </span>
              </div>
              {task.description && (
                <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
                  {task.description}
                </p>
              )}
              {task.requirementRefs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {task.requirementRefs.map((ref, i) => (
                    <span
                      key={i}
                      className="rounded-[3px] px-1.5 py-0.5"
                      style={{
                        background: "var(--muted)",
                        color: "var(--text-2)",
                        fontSize: "0.62rem",
                        fontWeight: 600,
                      }}
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
