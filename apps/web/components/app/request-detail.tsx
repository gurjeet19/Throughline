"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  InfoIcon,
  AlertTriangleIcon,
  SparklesIcon,
  Trash2Icon,
  ListChecksIcon,
  LinkIcon,
  LayoutGridIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "./status-badge";
import { DevelopmentPanel } from "./development-panel";
import { ReviewPanel } from "./review-panel";
import { FixesPanel } from "./fixes-panel";
import { ReleasePanel } from "./release-panel";
import { toast } from "sonner";

function parseRawContent(raw: string): { title: string; description: string } {
  const sep = raw.indexOf("\n\n");
  if (sep === -1) return { title: raw.trim(), description: "" };
  return { title: raw.slice(0, sep).trim(), description: raw.slice(sep + 2).trim() };
}

/** A request whose workflow is still in flight. */
const WORKING_STATUSES = new Set(["requested"]);

/** Statuses at or past PRD draft — the PRD (and its plan) stay visible. */
const PRD_VISIBLE_STATUSES = new Set([
  "prd-drafted",
  "prd-approved",
  "tasks-planned",
  "plan-approved",
  "in-development",
  "in-review",
  "fix-needed",
  "awaiting-approval",
  "changes-requested",
  "shipped",
]);

/** Statuses where the Development tab (start dev / branch / PR link) applies. */
const DEV_STATUSES = new Set([
  "plan-approved",
  "in-development",
  "in-review",
  "fix-needed",
  "awaiting-approval",
  "changes-requested",
  "shipped",
]);

/** Statuses where the AI Review tab applies (a PR is linked). */
const REVIEW_STATUSES = new Set([
  "in-review",
  "fix-needed",
  "awaiting-approval",
  "changes-requested",
  "shipped",
]);

/** Statuses where the Fixes Plan tab applies (blocking findings → fix loop). */
const FIXES_STATUSES = new Set([
  "fix-needed",
  "awaiting-approval",
  "changes-requested",
]);

/** Statuses where the Approval & Release tab applies. */
const APPROVAL_STATUSES = new Set([
  "awaiting-approval",
  "changes-requested",
  "shipped",
]);

type Tab =
  | "overview"
  | "prd"
  | "plan"
  | "development"
  | "review"
  | "fixes"
  | "approval";

const CHANNEL_LABELS: Record<string, string> = {
  manual: "Manual",
  email: "Email",
  support_ticket: "Support ticket",
  customer_call: "Customer call",
};

export function RequestDetail({ id }: { id: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: run } = useQuery({
    ...trpc.workflowRun.getByEntityId.queryOptions({ entityId: id }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "succeeded" || s === "failed" ? false : 1500;
    },
  });

  const runActive = run ? run.status === "pending" || run.status === "running" : false;

  const { data: request, isLoading } = useQuery({
    ...trpc.featureRequest.getById.queryOptions({ id }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return runActive || (s && WORKING_STATUSES.has(s)) ? 1200 : false;
    },
  });

  const showPrd = request ? PRD_VISIBLE_STATUSES.has(request.status) : false;

  const { data: prd } = useQuery({
    ...trpc.prd.getForRequest.queryOptions({ featureRequestId: id }),
    enabled: !!showPrd,
  });

  // When the workflow settles, pull the freshest request + PRD once.
  useEffect(() => {
    if (run && !runActive) {
      queryClient.invalidateQueries({
        queryKey: trpc.featureRequest.getById.queryKey({ id }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.prd.getForRequest.queryKey({ featureRequestId: id }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runActive, run?.status]);

  if (isLoading || !request) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <div
          className="h-32 rounded-[10px]"
          style={{ background: "var(--muted)" }}
        />
      </div>
    );
  }

  const { title, description } = parseRawContent(request.rawContent);
  const openQuestions = request.clarificationHistory.filter(
    (h) => h.answer === null,
  );
  const answered = request.clarificationHistory.filter((h) => h.answer !== null);

  // The Overview body has nothing to show when a request needed no clarification
  // and isn't in a state with its own callout (exists / flagged / processing) —
  // e.g. it sailed straight to a PRD. Show a placeholder instead of a bare page.
  const showClarifyForm =
    request.status === "clarifying" && openQuestions.length > 0;
  const overviewEmpty =
    answered.length === 0 &&
    !showClarifyForm &&
    request.status !== "exists" &&
    request.status !== "flagged" &&
    !WORKING_STATUSES.has(request.status);

  // Tabs appear only once there's more than the overview to show, so early-
  // stage requests (clarifying, flagged, …) stay a single simple view.
  const tabs: { id: Tab; label: string }[] = [{ id: "overview", label: "Overview" }];
  if (showPrd && prd) tabs.push({ id: "prd", label: "PRD" });
  if (showPrd && prd && prd.status === "approved")
    tabs.push({ id: "plan", label: "Plan" });
  if (DEV_STATUSES.has(request.status))
    tabs.push({ id: "development", label: "Development" });
  if (REVIEW_STATUSES.has(request.status))
    tabs.push({ id: "review", label: "Review" });
  if (FIXES_STATUSES.has(request.status))
    tabs.push({ id: "fixes", label: "Fixes plan" });
  if (APPROVAL_STATUSES.has(request.status))
    tabs.push({ id: "approval", label: "Approval & release" });
  const hasTabs = tabs.length > 1;
  // Guard against a stale selection if the active tab isn't available yet
  // (e.g. PRD still loading after a refetch).
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "overview";

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <StatusBadge status={request.status} />
          <span
            className="rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider"
            style={{ background: "var(--muted)", color: "var(--text-3)" }}
          >
            {CHANNEL_LABELS[request.channel] ?? request.channel}
          </span>
          {runActive && run?.currentStep && (
            <span
              className="inline-flex items-center gap-1.5 text-[0.75rem]"
              style={{ color: "var(--peach)", fontFamily: "var(--font-mono)" }}
            >
              <span className="size-3 rounded-full border-2 border-current border-t-transparent spin-slow" />
              {run.currentStep}…
            </span>
          )}
        </div>
        <h1 className="h-section">{title || "Untitled request"}</h1>
        {description && (
          <p
            className="text-sm leading-relaxed whitespace-pre-wrap max-w-prose"
            style={{ color: "var(--text-2)" }}
          >
            {description}
          </p>
        )}
      </div>

      {hasTabs ? (
        <TabBar tabs={tabs} active={activeTab} onChange={setTab} />
      ) : (
        <Separator />
      )}

      {activeTab === "overview" && (
        <div className="flex flex-col gap-6">
          {/* Answered clarifications, if any */}
          {answered.length > 0 && (
            <section className="flex flex-col gap-3">
              <p className="eyebrow">Clarification</p>
              <div className="flex flex-col gap-3">
                {answered.map((entry, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-1 rounded-[10px] p-4"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border-hair)",
                    }}
                  >
                    <p
                      className="text-[0.82rem] font-medium"
                      style={{ color: "var(--text-1)" }}
                    >
                      {entry.question}
                    </p>
                    <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
                      {entry.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* State-specific body */}
          {showClarifyForm && (
            <ClarificationForm
              requestId={id}
              questions={openQuestions.map((q) => q.question)}
            />
          )}

          {overviewEmpty && (
            <Callout
              icon={<InfoIcon className="size-4" />}
              tone="neutral"
              title="No clarification was needed"
              body={
                showPrd && prd
                  ? "This request was clear enough to specify straight away. Open the PRD and Plan tabs for its full specification and engineering plan."
                  : "This request was clear enough to specify straight away — nothing to review here yet."
              }
            />
          )}

          {request.status === "exists" && (
            <Callout
              icon={<InfoIcon className="size-4" />}
              tone="neutral"
              title="This already exists"
              body={request.triageNote ?? "A similar capability already covers this request."}
            />
          )}

          {request.status === "flagged" && (
            <Callout
              icon={<AlertTriangleIcon className="size-4" />}
              tone="warn"
              title="Flagged for human attention"
              body={request.triageNote ?? "This request needs a human to resolve ambiguity before a PRD can be written."}
            />
          )}

          {WORKING_STATUSES.has(request.status) && (
            <Callout
              icon={<SparklesIcon className="size-4" />}
              tone="neutral"
              title="AI is reviewing your request"
              body="Checking for duplicates and gaps, then drafting a PRD if it's a genuinely new request."
            />
          )}

          <Separator />
          <DeleteRequest requestId={id} />
        </div>
      )}

      {activeTab === "prd" && showPrd && prd && (
        <PrdView prd={prd} requestId={id} />
      )}

      {activeTab === "plan" && showPrd && prd && prd.status === "approved" && (
        <PlanView
          prdId={prd.id}
          requestId={id}
          requestStatus={request.status}
          planApprovedAt={request.planApprovedAt}
        />
      )}

      {activeTab === "development" && DEV_STATUSES.has(request.status) && (
        <DevelopmentPanel requestId={id} requestStatus={request.status} />
      )}

      {activeTab === "review" && REVIEW_STATUSES.has(request.status) && (
        <ReviewPanel requestId={id} requestStatus={request.status} />
      )}

      {activeTab === "fixes" && FIXES_STATUSES.has(request.status) && (
        <FixesPanel
          requestId={id}
          requestStatus={request.status}
          implementer={request.implementer}
        />
      )}

      {activeTab === "approval" && APPROVAL_STATUSES.has(request.status) && (
        <ReleasePanel requestId={id} requestStatus={request.status} />
      )}
    </div>
  );
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: Tab; label: string }[];
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1"
      style={{ borderBottom: "1px solid var(--border-hair)" }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className="relative px-3 py-2 text-[0.82rem] font-medium transition-colors"
            style={{ color: isActive ? "var(--oxblood)" : "var(--text-3)" }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = "var(--text-2)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = "var(--text-3)";
            }}
          >
            {t.label}
            {isActive && (
              <span
                className="absolute inset-x-0 -bottom-px h-0.5"
                style={{ background: "var(--oxblood)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function DeleteRequest({ requestId }: { requestId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const del = useMutation(
    trpc.featureRequest.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.featureRequest.list.queryKey(),
        });
        toast.success("Request deleted");
        router.push("/dashboard/requests");
      },
      onError: (err) =>
        toast.error("Couldn't delete", { description: err.message }),
    }),
  );

  if (!confirming) {
    return (
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(true)}
          className="gap-2"
          style={{ color: "var(--red-err)" }}
        >
          <Trash2Icon className="size-3.5" />
          Delete request
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] p-4"
      style={{ background: "var(--red-bg)", border: "1px solid var(--border-hair)" }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangleIcon
          className="mt-0.5 size-4 shrink-0"
          style={{ color: "var(--red-err)" }}
        />
        <p
          className="text-[0.82rem] leading-relaxed"
          style={{ color: "var(--text-2)" }}
        >
          This permanently deletes the request and its generated PRD. This can&apos;t
          be undone.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={del.isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => del.mutate({ id: requestId })}
          disabled={del.isPending}
          className="gap-2"
          style={{ background: "var(--red-err)", color: "#fff" }}
        >
          {del.isPending ? (
            <>
              <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
              Deleting…
            </>
          ) : (
            "Delete"
          )}
        </Button>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/requests"
      className="inline-flex items-center gap-1.5 text-[0.8rem] w-fit transition-colors"
      style={{ color: "var(--text-3)" }}
    >
      <ArrowLeftIcon className="size-3.5" />
      All requests
    </Link>
  );
}

function Callout({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: "neutral" | "warn";
}) {
  const bg = tone === "warn" ? "var(--amber-bg)" : "var(--muted)";
  const color = tone === "warn" ? "var(--amber)" : "var(--text-2)";
  return (
    <div
      className="flex gap-3 rounded-[10px] p-4"
      style={{ background: bg, border: "1px solid var(--border-hair)" }}
    >
      <span style={{ color }} className="mt-0.5 shrink-0">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[0.82rem] font-medium" style={{ color: "var(--text-1)" }}>
          {title}
        </p>
        <p
          className="text-[0.82rem] leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--text-2)" }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function ClarificationForm({
  requestId,
  questions,
}: {
  requestId: string;
  questions: string[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const mutation = useMutation(
    trpc.featureRequest.answerClarification.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.workflowRun.getByEntityId.queryKey({
            entityId: requestId,
          }),
        });
        toast.success("Answers submitted", {
          description: "The AI is re-reviewing your request.",
        });
      },
      onError: (err) => toast.error("Couldn't submit", { description: err.message }),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = questions.map((question) => ({
      question,
      answer: (answers[question] ?? "").trim(),
    }));
    if (payload.some((a) => a.answer.length === 0)) {
      toast.error("Please answer every question.");
      return;
    }
    mutation.mutate({ id: requestId, answers: payload });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">A few questions</p>
        <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
          The AI needs more context before writing the PRD.
        </p>
      </div>
      {questions.map((question, i) => (
        <div key={i} className="flex flex-col gap-2">
          <label
            htmlFor={`q-${i}`}
            className="text-[0.85rem] font-medium"
            style={{ color: "var(--text-1)" }}
          >
            {question}
          </label>
          <Textarea
            id={`q-${i}`}
            value={answers[question] ?? ""}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [question]: e.target.value }))
            }
            disabled={mutation.isPending}
            placeholder="Your answer…"
            className="min-h-[72px] resize-none text-sm"
          />
        </div>
      ))}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? (
            <>
              <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
              Submitting…
            </>
          ) : (
            "Submit answers"
          )}
        </Button>
      </div>
    </form>
  );
}

type Prd = {
  id: string;
  status: string;
  problemStatement: string;
  goals: string[];
  nonGoals: string[];
  userStories: string[];
  acceptanceCriteria: string[];
  edgeCases: string[];
  successMetrics: string[];
};

/** The seven editable section fields, in display order. */
const LIST_SECTIONS = [
  { key: "goals", title: "Goals" },
  { key: "nonGoals", title: "Non-goals" },
  { key: "userStories", title: "User stories" },
  { key: "acceptanceCriteria", title: "Acceptance criteria" },
  { key: "edgeCases", title: "Edge cases" },
  { key: "successMetrics", title: "Success metrics" },
] as const;

type Draft = {
  problemStatement: string;
  goals: string[];
  nonGoals: string[];
  userStories: string[];
  acceptanceCriteria: string[];
  edgeCases: string[];
  successMetrics: string[];
};

function toDraft(prd: Prd): Draft {
  return {
    problemStatement: prd.problemStatement,
    goals: prd.goals,
    nonGoals: prd.nonGoals,
    userStories: prd.userStories,
    acceptanceCriteria: prd.acceptanceCriteria,
    edgeCases: prd.edgeCases,
    successMetrics: prd.successMetrics,
  };
}

function PrdView({ prd, requestId }: { prd: Prd; requestId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(prd));

  // Re-sync the draft when the PRD changes underneath us (e.g. a refetch flips
  // it to approved) while we're not editing. Adjusting state during render is
  // React's recommended pattern here — no effect, no cascading commit.
  const prdKey = `${prd.id}:${prd.status}`;
  const [syncedKey, setSyncedKey] = useState(prdKey);
  if (!editing && syncedKey !== prdKey) {
    setSyncedKey(prdKey);
    setDraft(toDraft(prd));
  }

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.prd.getForRequest.queryKey({ featureRequestId: requestId }),
    });
  }

  const save = useMutation(
    trpc.prd.update.mutationOptions({
      onSuccess: () => {
        invalidate();
        setEditing(false);
        toast.success("PRD saved");
      },
      onError: (err) => toast.error("Couldn't save", { description: err.message }),
    }),
  );

  const approve = useMutation(
    trpc.prd.approve.mutationOptions({
      onSuccess: () => {
        invalidate();
        // Approval fires the generate-tasks workflow; refetch the run so its
        // progress resumes in the header.
        queryClient.invalidateQueries({
          queryKey: trpc.workflowRun.getByEntityId.queryKey({
            entityId: requestId,
          }),
        });
        toast.success("PRD approved", {
          description: "Breaking the spec into engineering tasks…",
        });
      },
      onError: (err) => toast.error("Couldn't approve", { description: err.message }),
    }),
  );

  const isApproved = prd.status === "approved";

  function handleSave() {
    save.mutate({ id: prd.id, ...draft });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <p className="eyebrow">Generated PRD</p>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(toDraft(prd));
                  setEditing(false);
                }}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : isApproved ? (
            <span
              className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium"
              style={{ color: "var(--green)" }}
            >
              <CheckCircle2Icon className="size-4" />
              Approved
            </span>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                size="sm"
                onClick={() => approve.mutate({ id: prd.id })}
                disabled={approve.isPending}
              >
                {approve.isPending ? "Approving…" : "Approve PRD"}
              </Button>
            </>
          )}
        </div>
      </div>

      <PrdSection title="Problem statement">
        {editing ? (
          <Textarea
            value={draft.problemStatement}
            onChange={(e) =>
              setDraft((d) => ({ ...d, problemStatement: e.target.value }))
            }
            className="min-h-[80px] resize-y text-[0.85rem]"
          />
        ) : (
          <p
            className="text-[0.85rem] leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--text-2)" }}
          >
            {prd.problemStatement}
          </p>
        )}
      </PrdSection>

      {LIST_SECTIONS.map(({ key, title }) =>
        editing ? (
          <PrdListEditor
            key={key}
            title={title}
            items={draft[key]}
            onChange={(items) => setDraft((d) => ({ ...d, [key]: items }))}
          />
        ) : (
          <PrdList key={key} title={title} items={prd[key]} />
        ),
      )}
    </section>
  );
}

type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  seq: number;
  kind: string;
  dependsOn: string[];
  requirementRefs: string[];
};

/**
 * Minimal read-only view of the generated engineering plan. The drag-and-drop
 * Kanban board lives on its own board route; this just surfaces the tasks (and
 * live generation progress) the moment a PRD is approved.
 */
function PlanView({
  prdId,
  requestId,
  requestStatus,
  planApprovedAt,
}: {
  prdId: string;
  requestId: string;
  requestStatus: string;
  planApprovedAt: Date | string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useQuery({
    ...trpc.task.list.queryOptions({ prdId }),
    refetchInterval: (q) => {
      // Poll while the workflow is still producing tasks…
      if (!q.state.data || q.state.data.length === 0) return 2500;
      // …and while the feature is moving through dev/review, so the board
      // columns advance live as work progresses.
      if (["in-development", "in-review", "fix-needed"].includes(requestStatus))
        return 5000;
      return false;
    },
  });

  // The Plan tab shows only the original feature plan; remediation tasks
  // (kind 'fix') live on the Fixes Plan tab and the board.
  const all = (tasks ?? []) as TaskRow[];
  const list = all.filter((t) => t.kind !== "fix");
  const seqById = new Map(all.map((t) => [t.id, t.seq]));
  const doneCount = list.filter((t) => t.status === "done").length;
  const isPlanApproved = requestStatus === "plan-approved";
  const canApprove = requestStatus === "tasks-planned" && list.length > 0;

  const approve = useMutation(
    trpc.featureRequest.approvePlan.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.featureRequest.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.task.list.queryKey({ prdId }),
        });
        toast.success("Plan approved", {
          description: "Locked and ready for development.",
        });
      },
      onError: (err) =>
        toast.error("Couldn't approve plan", { description: err.message }),
    }),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="eyebrow">Engineering plan</p>
        {list.length > 0 && (
          <div className="flex items-center gap-3">
            <span
              className="text-[0.7rem] tabular-nums"
              style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
            >
              {list.length} task{list.length === 1 ? "" : "s"}
              {doneCount > 0 && (
                <span style={{ color: "var(--green)" }}> · {doneCount} done</span>
              )}
            </span>
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
            {canApprove && (
              <Button
                size="sm"
                onClick={() => approve.mutate({ id: requestId })}
                disabled={approve.isPending}
                className="gap-2"
              >
                {approve.isPending ? "Approving…" : "Approve plan"}
              </Button>
            )}
          </div>
        )}
      </div>

      {isPlanApproved && (
        <Callout
          icon={<CheckCircle2Icon className="size-4" />}
          tone="neutral"
          title="Plan approved — ready for development"
          body={
            planApprovedAt
              ? `Approved on ${new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(planApprovedAt))}. The board is locked; reopen it to review the committed plan.`
              : "The board is locked; reopen it to review the committed plan."
          }
        />
      )}

      {isLoading || list.length === 0 ? (
        <div
          className="flex items-center gap-3 rounded-[10px] p-4"
          style={{ background: "var(--muted)", border: "1px solid var(--border-hair)" }}
        >
          <span
            className="size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent spin-slow"
            style={{ color: "var(--peach)" }}
          />
          <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
            Breaking the PRD into engineering tasks…
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((task) => {
            const blockers = task.dependsOn
              .map((id) => seqById.get(id))
              .filter((n): n is number => typeof n === "number")
              .sort((a, b) => a - b);
            return (
            <div
              key={task.id}
              className="flex flex-col gap-2 rounded-[10px] p-4"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-hair)",
              }}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <ListChecksIcon
                    className="mt-0.5 size-4 shrink-0"
                    style={{ color: "var(--text-3)" }}
                  />
                  <div className="flex flex-col gap-1">
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
                    {task.description && (
                      <p
                        className="text-[0.82rem] leading-relaxed"
                        style={{ color: "var(--text-2)" }}
                      >
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>
                <TaskStatusPill status={task.status} />
              </div>
              {blockers.length > 0 && (
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5"
                  style={{
                    background: "var(--amber-bg)",
                    color: "var(--amber)",
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  <LinkIcon className="size-3" />
                  Blocked by {blockers.map((n) => `#${n}`).join(", ")}
                </span>
              )}
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const TASK_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  todo: { label: "To do", color: "var(--amber)", bg: "var(--amber-bg)" },
  "in-progress": { label: "In progress", color: "var(--blue)", bg: "var(--blue-bg)" },
  done: { label: "Done", color: "var(--green)", bg: "var(--green-bg)" },
};

/** Per-task board status, shown on the plan so progress reads without the board. */
function TaskStatusPill({ status }: { status: string }) {
  const meta = TASK_STATUS_META[status] ?? TASK_STATUS_META.todo;
  return (
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
  );
}

function PrdSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-[10px] p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <h3
        className="text-[0.8rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-1)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function PrdList({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <PrdSection title={title}>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-2 text-[0.85rem] leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            <span style={{ color: "var(--peach)" }} className="select-none">
              ·
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </PrdSection>
  );
}

/**
 * Edits a list section as one bullet per line. The raw text (including blank
 * lines mid-edit) lives in local state so newlines aren't stripped while
 * typing; the parsed string[] is reported up on every change for saving.
 */
function PrdListEditor({
  title,
  items,
  onChange,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [text, setText] = useState(() => items.join("\n"));

  return (
    <PrdSection title={title}>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.length > 0),
          );
        }}
        placeholder="One item per line…"
        className="min-h-[88px] resize-y text-[0.85rem]"
      />
    </PrdSection>
  );
}
