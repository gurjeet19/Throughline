"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileDiffIcon,
  GitPullRequestIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { AgentDiffDialog } from "./agent-diff-dialog";
import { buildSplitFiles } from "@/lib/split-diff";
import type { ProposalChange } from "@/lib/proposal-diff";
import { toast } from "sonner";

/**
 * Throughline coding-agent flow on an agent feature: generate a proposal, review
 * it as a diff, then confirm or reject / regenerate. Nothing reaches GitHub until
 * confirm. `mode` adapts the copy and the commit action: `feature` opens the PR
 * (in-development); `fix` pushes onto the existing PR's branch to repair the
 * review's blocking findings, firing an automatic re-review.
 */
export function AgentPanel({
  requestId,
  mode = "feature",
}: {
  requestId: string;
  mode?: "feature" | "fix";
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const isFix = mode === "fix";

  const proposalQuery = useQuery({
    ...trpc.agent.getProposal.queryOptions({ featureRequestId: requestId }),
    refetchInterval: (q) =>
      q.state.data?.status === "generating" ? 2000 : false,
  });

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.agent.getProposal.queryKey({ featureRequestId: requestId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.github.featureDevelopment.queryKey({ featureRequestId: requestId }),
    });
  }

  const generate = useMutation(
    trpc.agent.generate.mutationOptions({
      onSuccess: () => {
        setFeedback("");
        invalidate();
      },
      onError: (err) => toast.error("Couldn't start", { description: err.message }),
    }),
  );

  const confirm = useMutation(
    trpc.agent.confirm.mutationOptions({
      onSuccess: (pr) => {
        invalidate();
        setReviewOpen(false);
        if (pr.mode === "fix") {
          toast.success("Fix pushed", {
            description: `PR #${pr.number} — a re-review starts automatically.`,
          });
        } else {
          toast.success("Pull request opened", { description: `#${pr.number}` });
        }
      },
      onError: (err) => toast.error("Couldn't commit", { description: err.message }),
    }),
  );

  const reject = useMutation(
    trpc.agent.reject.mutationOptions({
      onSuccess: () => {
        invalidate();
        setReviewOpen(false);
      },
      onError: (err) => toast.error("Couldn't reject", { description: err.message }),
    }),
  );

  const switchToDeveloper = useMutation(
    trpc.agent.switchToDeveloper.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Handed off to the Developer path");
      },
      onError: (err) => toast.error("Couldn't switch", { description: err.message }),
    }),
  );

  const proposal = proposalQuery.data;
  const status = proposal?.status;
  const busy = generate.isPending || confirm.isPending || reject.isPending;

  return (
    <section className="flex flex-col gap-4">
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BotIcon className="size-4" style={{ color: "var(--oxblood)" }} />
          <p className="eyebrow" style={{ color: "var(--oxblood)" }}>
            Throughline agent
          </p>
        </div>
        {status !== "committed" && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            disabled={switchToDeveloper.isPending}
            onClick={() => switchToDeveloper.mutate({ featureRequestId: requestId })}
          >
            <UserIcon className="size-3.5" />
            Switch to Developer
          </Button>
        )}
      </div>

      {/* Idle / first run / after a rejection → offer to generate. A committed
          fix doesn't reopen this card; its waiting state (below) carries its own
          "generate another fix" affordance so the page doesn't look unchanged. */}
      {(!proposal || status === "rejected") && (
        <GenerateCard
          label={
            status === "rejected"
              ? "Generate again"
              : isFix
                ? "Generate the fix"
                : "Generate the implementation"
          }
          intro={
            isFix
              ? "Throughline reads the review's blocking findings, the PRD, and the current code, then proposes a fix. Nothing is pushed until you confirm."
              : "Throughline reads the PRD, tasks, and repository, then proposes the code changes. Nothing is committed until you confirm."
          }
          feedback={feedback}
          onFeedback={setFeedback}
          showFeedback={status === "rejected"}
          pending={generate.isPending}
          onGenerate={() =>
            generate.mutate({ featureRequestId: requestId, feedback: feedback || undefined })
          }
        />
      )}

      {status === "generating" && (
        <ProgressRow step={proposal?.currentStep ?? "Working"} />
      )}

      {status === "failed" && (
        <div
          className="flex flex-col gap-2 rounded-[10px] p-4"
          style={{ background: "var(--red-bg)", border: "1px solid var(--border-hair)" }}
        >
          <p className="text-[0.82rem] font-medium" style={{ color: "var(--red-err)" }}>
            Generation failed
          </p>
          <p className="text-[0.78rem]" style={{ color: "var(--text-2)" }}>
            {proposal?.error ?? "Something went wrong."}
          </p>
          <div>
            <Button
              size="sm"
              disabled={generate.isPending}
              onClick={() => generate.mutate({ featureRequestId: requestId })}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {status === "committed" && isFix && (
        <CommittedWaiting
          prNumber={proposal?.prNumber ?? null}
          prUrl={proposal?.prUrl ?? null}
          generating={generate.isPending}
          onGenerateAgain={() =>
            generate.mutate({
              featureRequestId: requestId,
              feedback: feedback || undefined,
            })
          }
        />
      )}

      {status === "committed" && !isFix && (
        <div
          className="flex items-start gap-2.5 rounded-[10px] px-4 py-3"
          style={{ background: "var(--green-bg)", border: "1px solid var(--border-hair)" }}
        >
          <CheckIcon className="mt-0.5 size-4 shrink-0" style={{ color: "var(--green)" }} />
          <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
            Changes committed and pull request{" "}
            {proposal?.prNumber ? `#${proposal.prNumber}` : ""} opened. Throughline
            is now waiting for GitHub to register the pull request — the feature
            moves into review automatically once it arrives.
          </p>
        </div>
      )}

      {status === "ready" && proposal && (
        <ReadyProposal
          isFix={isFix}
          summary={proposal.summary}
          changes={proposal.changes as ProposalChange[]}
          feedback={feedback}
          onFeedback={setFeedback}
          busy={busy}
          onConfirm={() => confirm.mutate({ proposalId: proposal.id })}
          onReject={() => reject.mutate({ proposalId: proposal.id })}
          onRegenerate={() =>
            generate.mutate({ featureRequestId: requestId, feedback: feedback || undefined })
          }
          confirming={confirm.isPending}
          reviewOpen={reviewOpen}
          onReviewOpenChange={setReviewOpen}
        />
      )}
    </section>
  );
}

function GenerateCard({
  label,
  intro,
  feedback,
  onFeedback,
  showFeedback,
  pending,
  onGenerate,
}: {
  label: string;
  intro: string;
  feedback: string;
  onFeedback: (v: string) => void;
  showFeedback: boolean;
  pending: boolean;
  onGenerate: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
        {intro}
      </p>
      {showFeedback && (
        <Textarea
          value={feedback}
          onChange={(e) => onFeedback(e.target.value)}
          placeholder="Optional: what to change this time…"
          className="min-h-[64px] resize-y text-[0.82rem]"
        />
      )}
      <div>
        <Button onClick={onGenerate} disabled={pending} className="gap-2">
          {pending ? (
            <>
              <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
              Starting…
            </>
          ) : (
            <>
              <SparklesIcon className="size-4" />
              {label}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ReadyProposal({
  isFix,
  summary,
  changes,
  feedback,
  onFeedback,
  busy,
  onConfirm,
  onReject,
  onRegenerate,
  confirming,
  reviewOpen,
  onReviewOpenChange,
}: {
  isFix: boolean;
  summary: string;
  changes: ProposalChange[];
  feedback: string;
  onFeedback: (v: string) => void;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  confirming: boolean;
  reviewOpen: boolean;
  onReviewOpenChange: (open: boolean) => void;
}) {
  const files = useMemo(() => buildSplitFiles(changes), [changes]);
  const totals = files.reduce(
    (acc, f) => {
      acc.add += f.additions;
      acc.del += f.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <div
          className="rounded-[10px] p-4 text-[0.82rem] leading-relaxed"
          style={{ background: "var(--surface)", border: "1px solid var(--border-hair)", color: "var(--text-2)" }}
        >
          {summary}
        </div>
      )}

      {/* Entry to the focused, tabbed side-by-side review dialog. */}
      <button
        type="button"
        onClick={() => onReviewOpenChange(true)}
        className="group flex items-center justify-between gap-3 rounded-[10px] p-4 text-left transition-all duration-200"
        style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--oxblood)";
          e.currentTarget.style.background = "var(--peach-pale)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-hair)";
          e.currentTarget.style.background = "var(--surface)";
        }}
      >
        <span className="flex items-center gap-2.5">
          <FileDiffIcon className="size-4 shrink-0" style={{ color: "var(--oxblood)" }} />
          <span className="flex flex-col">
            <span className="text-[0.86rem] font-medium" style={{ color: "var(--text-1)" }}>
              Review {files.length} file{files.length === 1 ? "" : "s"}
            </span>
            <span className="text-[0.74rem]" style={{ color: "var(--text-3)" }}>
              Old vs new, side by side — then confirm or reject.
            </span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-[0.74rem] tabular-nums" style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}>
            +{totals.add}
          </span>
          <span className="text-[0.74rem] tabular-nums" style={{ color: "var(--red-err)", fontFamily: "var(--font-mono)" }}>
            −{totals.del}
          </span>
          <ChevronRightIcon
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
            style={{ color: "var(--oxblood)" }}
          />
        </span>
      </button>

      {/* Regenerate with optional feedback stays here; confirm/reject live in the
          review dialog so a change is only shipped after it's been looked at. */}
      <div className="flex flex-col gap-2">
        <Textarea
          value={feedback}
          onChange={(e) => onFeedback(e.target.value)}
          placeholder="Optional feedback for a regenerate…"
          className="min-h-[56px] resize-y text-[0.82rem]"
        />
        <div>
          <Button variant="outline" onClick={onRegenerate} disabled={busy} className="gap-2">
            <SparklesIcon className="size-4" />
            Regenerate
          </Button>
        </div>
      </div>

      <AgentDiffDialog
        open={reviewOpen}
        onOpenChange={onReviewOpenChange}
        isFix={isFix}
        summary={summary}
        changes={changes}
        busy={busy}
        confirming={confirming}
        onConfirm={onConfirm}
        onReject={onReject}
      />
    </div>
  );
}

/**
 * Fix pushed, now waiting on GitHub. After the agent commits a fix to the PR's
 * branch nothing visible happens until GitHub delivers the pull-request webhook
 * and the re-review kicks off — a quiet gap that reads as "stuck". This makes the
 * wait explicit (so it never looks like a bug), links the PR, and still offers a
 * regenerate for when the re-review comes back with more to fix.
 */
function CommittedWaiting({
  prNumber,
  prUrl,
  generating,
  onGenerateAgain,
}: {
  prNumber: number | null;
  prUrl: string | null;
  generating: boolean;
  onGenerateAgain: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: "var(--peach-pale)", border: "1px solid var(--border-hair)" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent spin-slow"
          style={{ color: "var(--oxblood)" }}
        />
        <p className="text-[0.84rem] font-medium" style={{ color: "var(--oxblood)" }}>
          Fix pushed{prNumber ? ` to pull request #${prNumber}` : ""} — waiting for
          GitHub
        </p>
      </div>
      <p className="text-[0.8rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
        Throughline is waiting for GitHub to deliver the pull-request event. The AI
        re-review starts automatically the moment it arrives — usually within a few
        seconds — and you can follow it on the Review tab. You don&apos;t need to
        do anything.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[0.78rem] font-medium transition-colors"
            style={{ color: "var(--oxblood)" }}
          >
            <GitPullRequestIcon className="size-3.5" />
            View pull request
            <ExternalLinkIcon className="size-3" />
          </a>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto gap-1.5"
          disabled={generating}
          onClick={onGenerateAgain}
        >
          <SparklesIcon className="size-3.5" />
          {generating ? "Starting…" : "Generate another fix"}
        </Button>
      </div>
    </div>
  );
}

function ProgressRow({ step }: { step: string }) {
  return (
    <div className="flex items-center gap-2.5 py-2" style={{ color: "var(--text-2)" }}>
      <span
        className="size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent spin-slow"
        style={{ color: "var(--peach)" }}
      />
      <span className="text-[0.82rem]">{step}…</span>
    </div>
  );
}
