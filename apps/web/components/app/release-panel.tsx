"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  FileTextIcon,
  GitPullRequestIcon,
  InfoIcon,
  ListChecksIcon,
  RefreshCwIcon,
  RocketIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Finding = {
  dimension: string;
  severity: "blocking" | "non-blocking";
  title: string;
  explanation: string;
  recommendation: string;
};

type Readiness = {
  status: string;
  ready: boolean;
  rationale: string;
  risks: string[];
  model: string | null;
  error: string | null;
} | null;

/**
 * Approval & Release cockpit.
 *
 * The single screen a human reviewer reads before deciding whether to ship: the
 * AI release-readiness verdict, the approved PRD, the task plan's completion, the
 * linked pull request(s), the AI review verdict + history, and the outstanding
 * (non-blocking) issues that remain — then the Approve & Ship / Request changes
 * decision controls. Everything is live, tenant-scoped data from the
 * `release.getReadiness` query.
 */
export function ReleasePanel({
  requestId,
  requestStatus,
}: {
  requestId: string;
  requestStatus: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery(
    trpc.release.getReadiness.queryOptions({ featureRequestId: requestId }),
  );

  // The AI readiness assessment, polled live while it runs so the verdict lands
  // without a manual refresh — mirrors how the review panel tracks its workflow.
  const { data: assessment } = useQuery({
    ...trpc.release.getAssessment.queryOptions({ featureRequestId: requestId }),
    refetchInterval: (q) => {
      const s = (q.state.data as Readiness)?.status;
      return s === "pending" || s === "running" ? 2500 : false;
    },
  });
  const readiness = assessment as Readiness;
  const assessing =
    readiness?.status === "pending" || readiness?.status === "running";

  const runReadinessCheck = useMutation(
    trpc.release.runReadinessCheck.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.release.getAssessment.queryKey({ featureRequestId: requestId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.workflowRun.getByEntityId.queryKey({ entityId: requestId }),
        });
      },
      onError: (err) =>
        toast.error("Couldn't start the readiness check", {
          description: err.message,
        }),
    }),
  );

  // The feature, its readiness payload, the request list, and the board all
  // shift on a decision — refresh them together.
  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.featureRequest.list.queryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.release.getReadiness.queryKey({ featureRequestId: requestId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.task.list.queryKey({ featureRequestId: requestId }),
    });
  }

  const approveAndShip = useMutation(
    trpc.release.approveAndShip.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Shipped — every task moved to done");
      },
      onError: (err) => toast.error("Couldn't ship", { description: err.message }),
    }),
  );

  const requestChanges = useMutation(
    trpc.release.requestChanges.mutationOptions({
      onSuccess: () => {
        invalidate();
        setRejecting(false);
        setReason("");
        toast.success("Sent back — the feature is in the fix loop");
      },
      onError: (err) =>
        toast.error("Couldn't request changes", { description: err.message }),
    }),
  );

  if (isLoading || !data) {
    return (
      <div className="h-40 rounded-[10px]" style={{ background: "var(--muted)" }} />
    );
  }

  const {
    prd,
    taskSummary,
    pullRequests,
    reviews,
    latestReview,
    outstandingFindings,
    decisions,
  } = data;

  const shipped = requestStatus === "shipped";
  const rejected = requestStatus === "changes-requested";

  return (
    <section className="flex flex-col gap-5">
      <p className="eyebrow">Approval &amp; release</p>

      {/* Gate banner — what the reviewer should do, driven by the status. */}
      {shipped ? (
        <GateBanner
          tone="ready"
          icon={<RocketIcon className="size-4" />}
          title="Shipped"
          body="This feature has been approved and released. The record below is read-only."
        />
      ) : rejected ? (
        <GateBanner
          tone="fix"
          icon={<AlertTriangleIcon className="size-4" />}
          title="Changes requested — back in the fix loop"
          body="A reviewer sent this back. Resolve the requested changes, push, and let the AI re-review before it returns for approval."
        />
      ) : (
        <GateBanner
          tone="ready"
          icon={<CheckCircle2Icon className="size-4" />}
          title="Ready for release approval"
          body="Verify each input below, then make the final call. Humans are the last gate before this ships."
        />
      )}

      {/* AI release-readiness verdict — the cockpit's headline. */}
      <ReadinessCard
        readiness={readiness}
        assessing={assessing}
        canRun={!shipped && !rejected}
        rerunning={runReadinessCheck.isPending}
        onRun={() => runReadinessCheck.mutate({ featureRequestId: requestId })}
      />

      {/* Verification inputs */}
      <PrdCard prd={prd} />
      <TasksCard summary={taskSummary} />
      <PullRequestsCard pullRequests={pullRequests} />
      <ReviewCard latestReview={latestReview} runCount={reviews.length} />
      <OutstandingCard findings={outstandingFindings} />

      {/* Decision controls */}
      {!shipped && (
        <div
          className="flex flex-col gap-3 rounded-[10px] p-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-hair)",
          }}
        >
          <p className="text-[0.82rem] font-medium" style={{ color: "var(--text-1)" }}>
            Release decision
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={approveAndShip.isPending || rejecting}
              onClick={() => approveAndShip.mutate({ featureRequestId: requestId })}
            >
              <RocketIcon className="size-3.5" />
              {approveAndShip.isPending ? "Shipping…" : "Approve & ship"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={approveAndShip.isPending || rejecting}
              onClick={() => setRejecting(true)}
            >
              <AlertTriangleIcon className="size-3.5" />
              Request changes
            </Button>
          </div>

          {rejecting ? (
            <div className="flex flex-col gap-2">
              <label
                className="text-[0.74rem] font-medium"
                style={{ color: "var(--text-2)" }}
              >
                Why are you sending this back? A reason is required.
              </label>
              <Textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe the changes the team needs to make before this can ship…"
                className="text-[0.82rem]"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={requestChanges.isPending || reason.trim().length === 0}
                  onClick={() =>
                    requestChanges.mutate({
                      featureRequestId: requestId,
                      reason: reason.trim(),
                    })
                  }
                >
                  <AlertTriangleIcon className="size-3.5" />
                  {requestChanges.isPending
                    ? "Sending back…"
                    : "Confirm — request changes"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={requestChanges.isPending}
                  onClick={() => {
                    setRejecting(false);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p
              className="inline-flex items-center gap-1.5 text-[0.74rem]"
              style={{ color: "var(--text-3)" }}
            >
              <InfoIcon className="size-3.5" />
              Approve to ship and move every task to done, or request changes to
              send it back into the fix loop.
            </p>
          )}
        </div>
      )}

      {decisions.length > 0 && <DecisionHistory decisions={decisions} />}
    </section>
  );
}

function GateBanner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "ready" | "fix";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const color = tone === "fix" ? "var(--red-err)" : "var(--green)";
  const bg = tone === "fix" ? "var(--red-bg)" : "var(--green-bg)";
  return (
    <div
      className="flex items-start gap-2.5 rounded-[10px] p-4"
      style={{ background: bg, border: "1px solid var(--border-hair)" }}
    >
      <span style={{ color }}>{icon}</span>
      <div className="flex flex-col gap-1">
        <span className="text-[0.84rem] font-medium" style={{ color }}>
          {title}
        </span>
        <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
          {body}
        </p>
      </div>
    </div>
  );
}

function ReadinessCard({
  readiness,
  assessing,
  canRun,
  rerunning,
  onRun,
}: {
  readiness: Readiness;
  assessing: boolean;
  canRun: boolean;
  rerunning: boolean;
  onRun: () => void;
}) {
  const failed = readiness?.status === "failed";
  const completed = readiness?.status === "completed";
  const ready = completed && readiness?.ready;

  // Tone the headline by the verdict: ready = green, not-ready = peach caution,
  // assessing/none = neutral, failed = red.
  const tone = assessing
    ? { color: "var(--text-2)", bg: "var(--muted)" }
    : failed
      ? { color: "var(--red-err)", bg: "var(--red-bg)" }
      : ready
        ? { color: "var(--green)", bg: "var(--green-bg)" }
        : completed
          ? { color: "var(--oxblood)", bg: "var(--peach-pale)" }
          : { color: "var(--text-2)", bg: "var(--muted)" };

  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: tone.bg, border: "1px solid var(--border-hair)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-2 text-[0.84rem] font-medium"
          style={{ color: tone.color }}
        >
          {assessing ? (
            <span
              className="size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent spin-slow"
              aria-hidden
            />
          ) : failed ? (
            <XCircleIcon className="size-4" />
          ) : ready ? (
            <ShieldCheckIcon className="size-4" />
          ) : completed ? (
            <ShieldAlertIcon className="size-4" />
          ) : (
            <SparklesIcon className="size-4" />
          )}
          {assessing
            ? "Assessing release readiness…"
            : failed
              ? "Readiness check failed"
              : ready
                ? "AI check: ready to ship"
                : completed
                  ? "AI check: not ready yet"
                  : "AI release-readiness check"}
        </span>
        {canRun && !assessing && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={rerunning}
            onClick={onRun}
          >
            <RefreshCwIcon className="size-3.5" />
            {rerunning
              ? "Starting…"
              : readiness
                ? "Re-run check"
                : "Run check"}
          </Button>
        )}
      </div>

      {assessing ? (
        <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
          Weighing the PRD, the AI review history, and the outstanding findings
          into a ship / no-ship verdict.
        </p>
      ) : failed ? (
        <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
          {readiness?.error ||
            "The assessment couldn't complete. Re-run the check to try again."}
        </p>
      ) : completed ? (
        <div className="flex flex-col gap-3">
          <p
            className="text-[0.82rem] leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--text-2)" }}
          >
            {readiness?.rationale}
          </p>
          {readiness && readiness.risks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span
                className="text-[0.7rem] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Key risks to weigh
              </span>
              <ul className="flex flex-col gap-1.5">
                {readiness.risks.map((risk, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[0.8rem]"
                    style={{ color: "var(--text-2)" }}
                  >
                    <AlertTriangleIcon
                      className="mt-0.5 size-3.5 shrink-0"
                      style={{ color: "var(--text-3)" }}
                    />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {readiness?.model && (
            <span className="text-[0.7rem]" style={{ color: "var(--text-3)" }}>
              Assessed by {readiness.model}. Advisory — the human makes the call.
            </span>
          )}
        </div>
      ) : (
        <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
          No readiness check has run yet. Run one to get an AI ship / no-ship
          read on this feature.
        </p>
      )}
    </div>
  );
}

function Card({
  icon,
  label,
  meta,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-2 text-[0.82rem] font-medium"
          style={{ color: "var(--text-1)" }}
        >
          <span style={{ color: "var(--text-3)" }}>{icon}</span>
          {label}
        </span>
        {meta && (
          <span className="text-[0.74rem]" style={{ color: "var(--text-3)" }}>
            {meta}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PrdCard({ prd }: { prd: { problemStatement: string; acceptanceCriteria: string[] } | null }) {
  return (
    <Card
      icon={<FileTextIcon className="size-3.5" />}
      label="PRD"
      meta={prd ? `${prd.acceptanceCriteria.length} acceptance criteria` : undefined}
    >
      {prd ? (
        <p
          className="text-[0.82rem] leading-relaxed line-clamp-3"
          style={{ color: "var(--text-2)" }}
        >
          {prd.problemStatement || "No problem statement recorded."}
        </p>
      ) : (
        <Empty>No PRD is attached to this feature.</Empty>
      )}
    </Card>
  );
}

function TasksCard({
  summary,
}: {
  summary: { total: number; done: number; inProgress: number; todo: number };
}) {
  return (
    <Card
      icon={<ListChecksIcon className="size-3.5" />}
      label="Task plan"
      meta={`${summary.done}/${summary.total} done`}
    >
      {summary.total === 0 ? (
        <Empty>No tasks were planned for this feature.</Empty>
      ) : (
        <div className="flex flex-wrap gap-2 text-[0.74rem]" style={{ color: "var(--text-2)" }}>
          <Pill>{summary.todo} to do</Pill>
          <Pill>{summary.inProgress} in progress</Pill>
          <Pill>{summary.done} done</Pill>
        </div>
      )}
    </Card>
  );
}

function PullRequestsCard({
  pullRequests,
}: {
  pullRequests: {
    id: string;
    number: number;
    title: string;
    state: string;
    merged: boolean;
    htmlUrl: string;
  }[];
}) {
  return (
    <Card
      icon={<GitPullRequestIcon className="size-3.5" />}
      label="Pull request"
      meta={pullRequests.length > 1 ? `${pullRequests.length} linked` : undefined}
    >
      {pullRequests.length === 0 ? (
        <Empty>No pull request is linked to this feature.</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {pullRequests.map((pr) => (
            <a
              key={pr.id}
              href={pr.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[0.82rem] hover:underline"
              style={{ color: "var(--text-2)" }}
            >
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
                #{pr.number}
              </span>
              <span className="truncate">{pr.title || "Untitled PR"}</span>
              <span className="text-[0.72rem]" style={{ color: "var(--text-3)" }}>
                {pr.merged ? "merged" : pr.state}
              </span>
              <ExternalLinkIcon className="size-3 shrink-0" style={{ color: "var(--text-3)" }} />
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

function ReviewCard({
  latestReview,
  runCount,
}: {
  latestReview:
    | { summary: string; blockingCount: number; nonBlockingCount: number }
    | null;
  runCount: number;
}) {
  return (
    <Card
      icon={<SparklesIcon className="size-3.5" />}
      label="AI review"
      meta={runCount > 0 ? `${runCount} run${runCount === 1 ? "" : "s"}` : undefined}
    >
      {!latestReview ? (
        <Empty>No AI review has run for this feature yet.</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2 text-[0.74rem]">
            <Pill tone={latestReview.blockingCount > 0 ? "fix" : "ready"}>
              {latestReview.blockingCount} blocking
            </Pill>
            <Pill>{latestReview.nonBlockingCount} non-blocking</Pill>
          </div>
          <p
            className="text-[0.82rem] leading-relaxed line-clamp-3"
            style={{ color: "var(--text-2)" }}
          >
            {latestReview.summary}
          </p>
        </div>
      )}
    </Card>
  );
}

function OutstandingCard({ findings }: { findings: Finding[] }) {
  return (
    <Card
      icon={<AlertTriangleIcon className="size-3.5" />}
      label="Outstanding issues"
      meta={`${findings.length} non-blocking`}
    >
      {findings.length === 0 ? (
        <Empty>No outstanding issues — the latest review left nothing open.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {findings.map((f, i) => (
            <li
              key={i}
              className="flex flex-col gap-0.5 rounded-[8px] p-2.5"
              style={{ background: "var(--muted)" }}
            >
              <span className="text-[0.8rem] font-medium" style={{ color: "var(--text-1)" }}>
                {f.title}
              </span>
              <span className="text-[0.76rem]" style={{ color: "var(--text-2)" }}>
                {f.recommendation}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DecisionHistory({
  decisions,
}: {
  decisions: {
    id: string;
    decision: string;
    reason: string | null;
    createdAt: string | Date;
  }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="eyebrow">Decision history</p>
      <ul className="flex flex-col gap-2">
        {decisions.map((d) => {
          const approved = d.decision === "approved";
          return (
            <li
              key={d.id}
              className="flex items-start gap-2.5 rounded-[10px] p-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
            >
              {approved ? (
                <CheckCircle2Icon className="size-4 shrink-0" style={{ color: "var(--green)" }} />
              ) : (
                <AlertTriangleIcon className="size-4 shrink-0" style={{ color: "var(--red-err)" }} />
              )}
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.82rem] font-medium" style={{ color: "var(--text-1)" }}>
                  {approved ? "Approved for release" : "Changes requested"}
                  <span className="ml-2 font-normal text-[0.74rem]" style={{ color: "var(--text-3)" }}>
                    {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                </span>
                {d.reason && (
                  <span className="text-[0.78rem]" style={{ color: "var(--text-2)" }}>
                    {d.reason}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "ready" | "fix" }) {
  const color =
    tone === "fix" ? "var(--red-err)" : tone === "ready" ? "var(--green)" : "var(--text-2)";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[0.72rem]"
      style={{ background: "var(--muted)", color }}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.82rem]" style={{ color: "var(--text-3)" }}>
      {children}
    </p>
  );
}
