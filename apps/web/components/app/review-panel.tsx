"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagonIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  InfoIcon,
  ShieldAlertIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
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
  model: string | null;
  headSha: string;
  summary: string;
  blockingCount: number;
  nonBlockingCount: number;
  findings: Finding[];
  truncated: boolean;
  error: string | null;
  createdAt: string | Date;
  postedAt: string | Date | null;
  postedUrl: string | null;
  postError: string | null;
};

const DIMENSION_LABELS: Record<string, string> = {
  requirements: "Requirements",
  "acceptance-criteria": "Acceptance criteria",
  tasks: "Tasks",
  security: "Security",
  performance: "Performance",
  "edge-cases": "Edge cases",
  "code-quality": "Code quality",
};

/**
 * Review tab: the AI QA review of the feature's pull request. The newest
 * run is the headline verdict (summary + findings grouped blocking vs
 * non-blocking); earlier runs are kept as an ordered re-review history. Polls
 * while a review is in flight. A review runs automatically when a PR is linked
 * and again on every pushed commit; the button is a manual fallback / retry.
 */
export function ReviewPanel({
  requestId,
  requestStatus,
}: {
  requestId: string;
  requestStatus: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    ...trpc.review.listForFeature.queryOptions({ featureRequestId: requestId }),
    refetchInterval: (q) => {
      const latest = q.state.data?.[0];
      const s = latest?.status;
      if (s === "pending" || s === "running") return 1800;
      // No review row yet but a PR is linked — poll until the auto-triggered
      // review appears.
      if ((!q.state.data || q.state.data.length === 0) && requestStatus === "in-review")
        return 2500;
      // Completed but the auto-post hasn't landed — poll briefly until it
      // resolves to posted or a post error.
      if (s === "completed" && latest && !latest.postedAt && !latest.postError)
        return 2500;
      return false;
    },
  });

  const reviews = (data ?? []) as Review[];
  const latest = reviews[0] ?? null;
  const history = reviews.slice(1);
  const inFlight = latest
    ? latest.status === "pending" || latest.status === "running"
    : false;

  // While a review runs, the feature's workflow_run carries the step text shown
  // in the header; keep it fresh so that progress moves in step with this panel.
  useEffect(() => {
    if (inFlight) {
      queryClient.invalidateQueries({
        queryKey: trpc.workflowRun.getByEntityId.queryKey({ entityId: requestId }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight]);

  const start = useMutation(
    trpc.review.start.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.review.listForFeature.queryKey({ featureRequestId: requestId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.workflowRun.getByEntityId.queryKey({ entityId: requestId }),
        });
      },
      onError: (err) =>
        toast.error("Couldn't start review", { description: err.message }),
    }),
  );

  if (isLoading) {
    return <div className="h-40 rounded-[10px]" style={{ background: "var(--muted)" }} />;
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <p className="eyebrow">AI review</p>
        {latest && !inFlight && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={start.isPending}
            onClick={() => start.mutate({ featureRequestId: requestId })}
          >
            <SparklesIcon className="size-3.5" />
            {start.isPending ? "Starting…" : "Run review"}
          </Button>
        )}
      </div>

      {!latest ? (
        <NoReview
          onRun={() => start.mutate({ featureRequestId: requestId })}
          pending={start.isPending}
        />
      ) : inFlight ? (
        <ProgressRow />
      ) : latest.status === "failed" ? (
        <FailedRow
          error={latest.error}
          onRetry={() => start.mutate({ featureRequestId: requestId })}
          pending={start.isPending}
        />
      ) : (
        <CompletedReview
          review={latest}
          requestStatus={requestStatus}
          requestId={requestId}
        />
      )}

      {history.length > 0 && <ReviewHistory runs={history} />}
    </section>
  );
}

function CompletedReview({
  review,
  requestStatus,
  requestId,
}: {
  review: Review;
  requestStatus: string;
  requestId: string;
}) {
  const blocking = review.findings.filter((f) => f.severity === "blocking");
  const nonBlocking = review.findings.filter((f) => f.severity === "non-blocking");
  const clear = blocking.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <PostStatus review={review} requestId={requestId} />

      {/* Gate banner — the explicit next action driven by the review outcome. */}
      {requestStatus === "fix-needed" && blocking.length > 0 && (
        <GateBanner
          tone="fix"
          icon={<WrenchIcon className="size-4" />}
          title={`Fixes needed — ${blocking.length} blocking issue${
            blocking.length === 1 ? "" : "s"
          }`}
          body="Resolve the blocking findings below and push the fixes to the pull request. The feature can't move forward until none remain."
        />
      )}
      {requestStatus === "awaiting-approval" && (
        <GateBanner
          tone="ready"
          icon={<CheckCircle2Icon className="size-4" />}
          title="No blocking issues — ready for release approval"
          body="The review found nothing blocking. A human reviewer makes the final call before this ships."
        />
      )}

      {/* Verdict + summary */}
      <div
        className="flex flex-col gap-3 rounded-[10px] p-4"
        style={{
          background: clear ? "var(--green-bg)" : "var(--red-bg)",
          border: "1px solid var(--border-hair)",
        }}
      >
        <div className="flex items-center gap-2.5">
          {clear ? (
            <CheckCircle2Icon className="size-4 shrink-0" style={{ color: "var(--green)" }} />
          ) : (
            <ShieldAlertIcon className="size-4 shrink-0" style={{ color: "var(--red-err)" }} />
          )}
          <span
            className="text-[0.84rem] font-medium"
            style={{ color: clear ? "var(--green)" : "var(--red-err)" }}
          >
            {clear
              ? "No blocking issues found"
              : `${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"}`}
          </span>
          <span className="text-[0.74rem]" style={{ color: "var(--text-3)" }}>
            {review.findings.length} finding{review.findings.length === 1 ? "" : "s"} ·{" "}
            {nonBlocking.length} non-blocking
          </span>
        </div>
        <p
          className="text-[0.85rem] leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--text-2)" }}
        >
          {review.summary}
        </p>
        {review.truncated && (
          <p
            className="inline-flex items-center gap-1.5 text-[0.74rem]"
            style={{ color: "var(--amber)" }}
          >
            <InfoIcon className="size-3.5" />
            The diff was large — this review worked from a reduced view of the changes.
          </p>
        )}
      </div>

      {review.findings.length === 0 ? (
        <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
          The reviewer raised no issues against the PRD, acceptance criteria, tasks,
          security, performance, edge cases, or code quality.
        </p>
      ) : (
        <>
          {blocking.length > 0 && (
            <FindingGroup
              title="Blocking"
              icon={<AlertOctagonIcon className="size-3.5" />}
              color="var(--red-err)"
              findings={blocking}
            />
          )}
          {nonBlocking.length > 0 && (
            <FindingGroup
              title="Non-blocking"
              icon={<InfoIcon className="size-3.5" />}
              color="var(--amber)"
              findings={nonBlocking}
            />
          )}
        </>
      )}
    </div>
  );
}

function fmtDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * The re-review trail: every prior run, newest first, each collapsible to its
 * summary + findings. Lets the team see how the review changed as fixes landed.
 */
function ReviewHistory({ runs }: { runs: Review[] }) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <p className="eyebrow">Review history</p>
      <div className="flex flex-col gap-2">
        {runs.map((run) => (
          <HistoryRow key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}

function HistoryRow({ run }: { run: Review }) {
  const [open, setOpen] = useState(false);
  const clear = run.status === "completed" && run.blockingCount === 0;
  const failed = run.status === "failed";
  const dot = failed ? "var(--text-3)" : clear ? "var(--green)" : "var(--red-err)";
  const verdict = failed
    ? "Failed"
    : clear
      ? "No blocking issues"
      : `${run.blockingCount} blocking`;

  return (
    <div
      className="rounded-[10px]"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <ChevronRightIcon
          className="size-3.5 shrink-0 transition-transform"
          style={{ color: "var(--text-3)", transform: open ? "rotate(90deg)" : "none" }}
        />
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: dot }} />
        <span className="text-[0.8rem] font-medium" style={{ color: "var(--text-1)" }}>
          {verdict}
        </span>
        <span className="text-[0.72rem]" style={{ color: "var(--text-3)" }}>
          {run.status === "completed"
            ? `${run.nonBlockingCount} non-blocking`
            : ""}
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          <span
            className="text-[0.7rem]"
            style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
          >
            {run.headSha.slice(0, 7)}
          </span>
          <span className="text-[0.7rem]" style={{ color: "var(--text-3)" }}>
            {fmtDate(run.createdAt)}
          </span>
        </span>
      </button>
      {open && (
        <div
          className="flex flex-col gap-3 px-3 pb-3"
          style={{ borderTop: "1px solid var(--border-hair)" }}
        >
          {run.summary && (
            <p
              className="pt-3 text-[0.82rem] leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--text-2)" }}
            >
              {run.summary}
            </p>
          )}
          {run.findings.map((f, i) => (
            <FindingCard
              key={i}
              finding={f}
              accent={f.severity === "blocking" ? "var(--red-err)" : "var(--amber)"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Where the review stands relative to GitHub: posted (with a link), or a failed
 * post with a retry. Nothing renders in the brief window before the automatic
 * post lands.
 */
function PostStatus({ review, requestId }: { review: Review; requestId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const retry = useMutation(
    trpc.review.retryPost.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.review.listForFeature.queryKey({ featureRequestId: requestId }),
        });
        toast.success("Review posted to GitHub");
      },
      onError: (err) =>
        toast.error("Couldn't post to GitHub", { description: err.message }),
    }),
  );

  if (review.postedAt) {
    return (
      <div
        className="flex items-center gap-2 text-[0.74rem]"
        style={{ color: "var(--text-3)" }}
      >
        <GitPullRequestIcon className="size-3.5 shrink-0" />
        <span>Posted to the pull request.</span>
        {review.postedUrl && (
          <a
            href={review.postedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors"
            style={{ color: "var(--text-2)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--oxblood)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-2)")}
          >
            View on GitHub
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
    );
  }

  if (review.postError) {
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-[8px] px-3 py-2"
        style={{ background: "var(--amber-bg)", border: "1px solid var(--border-hair)" }}
      >
        <GitPullRequestIcon className="size-3.5 shrink-0" style={{ color: "var(--amber)" }} />
        <span className="text-[0.74rem]" style={{ color: "var(--text-2)" }}>
          Couldn&apos;t post this review to GitHub.
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7"
          disabled={retry.isPending}
          onClick={() => retry.mutate({ reviewId: review.id })}
        >
          {retry.isPending ? "Posting…" : "Retry"}
        </Button>
      </div>
    );
  }

  return null;
}

function GateBanner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "fix" | "ready";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const accent = tone === "fix" ? "var(--red-err)" : "var(--green)";
  const bg = tone === "fix" ? "var(--red-bg)" : "var(--green-bg)";
  return (
    <div
      className="flex gap-3 rounded-[10px] p-4"
      style={{ background: bg, border: "1px solid var(--border-hair)" }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: accent }}>
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[0.84rem] font-medium" style={{ color: accent }}>
          {title}
        </p>
        <p
          className="text-[0.82rem] leading-relaxed"
          style={{ color: "var(--text-2)" }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function FindingGroup({
  title,
  icon,
  color,
  findings,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  findings: Finding[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5" style={{ color }}>
        {icon}
        <span className="text-[0.7rem] font-semibold uppercase tracking-wider">
          {title} · {findings.length}
        </span>
      </div>
      <div className="grid gap-3">
        {findings.map((f, i) => (
          <FindingCard key={i} finding={f} accent={color} />
        ))}
      </div>
    </div>
  );
}

function FindingCard({ finding, accent }: { finding: Finding; accent: string }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-[10px] p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-[3px] px-1.5 py-0.5"
          style={{
            background: "var(--muted)",
            color: "var(--text-2)",
            fontSize: "0.62rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {DIMENSION_LABELS[finding.dimension] ?? finding.dimension}
        </span>
        {finding.file && (
          <span
            className="text-[0.7rem]"
            style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
          >
            {finding.file}
            {finding.line ? `:${finding.line}` : ""}
          </span>
        )}
      </div>
      <h4
        className="text-[0.88rem] font-medium leading-snug"
        style={{ color: "var(--text-1)" }}
      >
        {finding.title}
      </h4>
      <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
        {finding.explanation}
      </p>
      <div
        className="flex gap-2 rounded-[8px] p-2.5"
        style={{ background: "var(--bg)", borderLeft: `2px solid ${accent}` }}
      >
        <span
          className="shrink-0 text-[0.62rem] font-semibold uppercase tracking-wider"
          style={{ color: accent }}
        >
          Fix
        </span>
        <p className="text-[0.8rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
          {finding.recommendation}
        </p>
      </div>
    </div>
  );
}

function ProgressRow() {
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
        Reviewing the pull request against the PRD, acceptance criteria, and tasks…
      </p>
    </div>
  );
}

function NoReview({ onRun, pending }: { onRun: () => void; pending: boolean }) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-[10px] p-4"
      style={{ background: "var(--muted)", border: "1px solid var(--border-hair)" }}
    >
      <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
        No AI review has run yet. A review starts automatically when a pull request
        is linked — or run one now.
      </p>
      <Button size="sm" className="gap-1.5" disabled={pending} onClick={onRun}>
        <SparklesIcon className="size-3.5" />
        {pending ? "Starting…" : "Run review"}
      </Button>
    </div>
  );
}

function FailedRow({
  error,
  onRetry,
  pending,
}: {
  error: string | null;
  onRetry: () => void;
  pending: boolean;
}) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-[10px] p-4"
      style={{ background: "var(--red-bg)", border: "1px solid var(--border-hair)" }}
    >
      <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
        {error ?? "The review couldn't complete."} You can try again.
      </p>
      <Button size="sm" variant="outline" disabled={pending} onClick={onRetry}>
        {pending ? "Starting…" : "Retry review"}
      </Button>
    </div>
  );
}
