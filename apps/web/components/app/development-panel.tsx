"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BotIcon,
  ExternalLinkIcon,
  FileDiffIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  LinkIcon,
  Link2OffIcon,
  UserIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { PrDetailDialog } from "./pr-detail-dialog";
import { AgentPanel } from "./agent-panel";
import { toast } from "sonner";

const IMPLEMENTER_LABELS: Record<string, string> = {
  developer: "Developer",
  agent: "Throughline agent",
};

type Implementer = "developer" | "agent";

export function DevelopmentPanel({
  requestId,
  requestStatus,
}: {
  requestId: string;
  requestStatus: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const devQuery = useQuery({
    ...trpc.github.featureDevelopment.queryOptions({ featureRequestId: requestId }),
    // Poll while waiting on a PR so the webhook's auto-link and live PR state
    // surface without a manual refresh; ease off once in review.
    refetchInterval: requestStatus === "in-development" ? 6000 : 20000,
  });

  const data = devQuery.data;
  const linkedCount = data?.started ? data.linkedPullRequests.length : 0;

  // When a PR links (auto or manual) the feature advances to in-review; pull the
  // fresh request so the status badge above updates in step.
  useEffect(() => {
    if (linkedCount > 0) {
      queryClient.invalidateQueries({
        queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCount]);

  if (devQuery.isLoading) {
    return (
      <div className="h-40 rounded-[10px]" style={{ background: "var(--muted)" }} />
    );
  }

  if (!data?.started) {
    return <StartDevelopment requestId={requestId} />;
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Development</p>
        <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
          This feature is linked to a repository and branch. A pull request opened
          on its branch moves it into review automatically.
        </p>
      </div>

      <div
        className="flex flex-col gap-4 rounded-[10px] p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
      >
        <InfoRow
          icon={<GitBranchIcon className="size-4" />}
          label="Repository"
          value={
            data.repository
              ? `${data.repository.owner}/${data.repository.name}`
              : "Repository disconnected"
          }
          mono
        />
        <InfoRow
          icon={<GitBranchIcon className="size-4" />}
          label="Branch"
          value={data.branch}
          mono
          href={data.repository?.branchUrl}
        />
        <InfoRow
          icon={
            data.implementer === "agent" ? (
              <BotIcon className="size-4" />
            ) : (
              <UserIcon className="size-4" />
            )
          }
          label="Implementer"
          value={IMPLEMENTER_LABELS[data.implementer ?? ""] ?? "—"}
        />
      </div>

      {data.implementer === "agent" && requestStatus === "in-development" && (
        <AgentPanel requestId={requestId} />
      )}

      <Separator />

      <LinkedPullRequests
        requestId={requestId}
        linked={data.linkedPullRequests}
        linkable={data.linkablePullRequests}
      />
    </section>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0" style={{ color: "var(--text-3)" }}>
        {icon}
      </span>
      <span
        className="w-24 shrink-0 text-[0.7rem] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 truncate text-[0.82rem] transition-colors"
          style={{
            color: "var(--text-1)",
            fontFamily: mono ? "var(--font-mono)" : undefined,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--oxblood)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-1)")}
        >
          <span className="truncate">{value}</span>
          <ExternalLinkIcon className="size-3 shrink-0" />
        </a>
      ) : (
        <span
          className="min-w-0 truncate text-[0.82rem]"
          style={{
            color: "var(--text-1)",
            fontFamily: mono ? "var(--font-mono)" : undefined,
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

type Pr = {
  id: string;
  number: number;
  title: string;
  state: string;
  merged: boolean;
  branch: string;
  htmlUrl: string;
};

function prStateStyle(pr: Pr): { label: string; color: string; bg: string } {
  if (pr.merged) return { label: "Merged", color: "var(--oxblood)", bg: "var(--oxblood-pale)" };
  if (pr.state === "closed") return { label: "Closed", color: "var(--red-err)", bg: "var(--red-bg)" };
  return { label: "Open", color: "var(--green)", bg: "var(--green-bg)" };
}

function LinkedPullRequests({
  requestId,
  linked,
  linkable,
}: {
  requestId: string;
  linked: Pr[];
  linkable: Pr[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [detailPrId, setDetailPrId] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.github.featureDevelopment.queryKey({ featureRequestId: requestId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
    });
  }

  const link = useMutation(
    trpc.github.linkPullRequest.mutationOptions({
      onSuccess: () => {
        invalidate();
        setPicking(false);
        toast.success("Pull request linked");
      },
      onError: (err) => toast.error("Couldn't link", { description: err.message }),
    }),
  );

  const unlink = useMutation(
    trpc.github.unlinkPullRequest.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Pull request unlinked");
      },
      onError: (err) => toast.error("Couldn't unlink", { description: err.message }),
    }),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Pull requests</p>
        {linkable.length > 0 && !picking && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setPicking(true)}
          >
            <LinkIcon className="size-3.5" />
            Link a PR
          </Button>
        )}
      </div>

      {picking && (
        <div
          className="flex flex-col gap-1.5 rounded-[10px] p-3"
          style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.74rem]" style={{ color: "var(--text-2)" }}>
              Link an existing pull request to this feature.
            </p>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="text-[0.72rem]"
              style={{ color: "var(--text-3)" }}
            >
              Cancel
            </button>
          </div>
          {linkable.map((pr) => (
            <button
              key={pr.id}
              type="button"
              disabled={link.isPending}
              onClick={() =>
                link.mutate({ pullRequestId: pr.id, featureRequestId: requestId })
              }
              className="flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-left transition-colors disabled:opacity-50"
              style={{ border: "1px solid var(--border-hair)" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--peach-light)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-hair)")}
            >
              <GitPullRequestIcon className="size-3.5 shrink-0" style={{ color: "var(--text-3)" }} />
              <span
                className="shrink-0 text-[0.72rem] tabular-nums"
                style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
              >
                #{pr.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.78rem]" style={{ color: "var(--text-1)" }}>
                {pr.title || "(untitled)"}
              </span>
              <span
                className="shrink-0 text-[0.68rem]"
                style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
              >
                {pr.branch}
              </span>
            </button>
          ))}
        </div>
      )}

      {linked.length === 0 ? (
        <div
          className="flex items-center gap-2 rounded-[10px] px-4 py-5 text-[0.78rem]"
          style={{ border: "1px dashed var(--border-hair)", color: "var(--text-3)" }}
        >
          <GitPullRequestIcon className="size-4 shrink-0" />
          No pull request linked yet. Open one on the feature&apos;s branch and it
          links here automatically.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {linked.map((pr) => {
            const s = prStateStyle(pr);
            return (
              <li
                key={pr.id}
                className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
                style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
              >
                <GitPullRequestIcon className="size-3.5 shrink-0" style={{ color: s.color }} />
                <a
                  href={pr.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-2 transition-colors"
                  style={{ color: "var(--text-1)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--oxblood)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-1)")}
                >
                  <span
                    className="shrink-0 text-[0.72rem] tabular-nums"
                    style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
                  >
                    #{pr.number}
                  </span>
                  <span className="min-w-0 truncate text-[0.78rem]">
                    {pr.title || "(untitled)"}
                  </span>
                  <ExternalLinkIcon className="size-3 shrink-0" style={{ color: "var(--text-3)" }} />
                </a>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
                  style={{ background: s.bg, color: s.color }}
                >
                  {s.label}
                </span>
                <button
                  type="button"
                  aria-label="View changes"
                  onClick={() => setDetailPrId(pr.id)}
                  className="grid size-6 shrink-0 place-items-center rounded-[6px] transition-colors"
                  style={{ color: "var(--text-3)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--oxblood)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
                >
                  <FileDiffIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Unlink pull request"
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate({ pullRequestId: pr.id })}
                  className="grid size-6 shrink-0 place-items-center rounded-[6px] transition-colors disabled:opacity-50"
                  style={{ color: "var(--text-3)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red-err)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
                >
                  <Link2OffIcon className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {detailPrId && (
        <PrDetailDialog
          pullRequestId={detailPrId}
          open={!!detailPrId}
          onOpenChange={(o) => {
            if (!o) setDetailPrId(null);
          }}
        />
      )}
    </div>
  );
}

const IMPLEMENTERS: {
  id: Implementer;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "developer",
    label: "Developer",
    desc: "A human (or your own coding agent) writes the code and opens the PR.",
    icon: <UserIcon className="size-4" />,
  },
  {
    id: "agent",
    label: "Throughline agent",
    desc: "Throughline's coding agent implements the feature from its tasks.",
    icon: <BotIcon className="size-4" />,
  },
];

function StartDevelopment({ requestId }: { requestId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [repositoryId, setRepositoryId] = useState<string | null>(null);
  const [implementer, setImplementer] = useState<Implementer>("developer");

  const reposQuery = useQuery(trpc.github.connectedRepos.queryOptions());
  const repos = reposQuery.data ?? [];

  // Default to the only repo when there's exactly one — derived, not stored, so
  // it settles once the list loads without a state-syncing effect.
  const selectedRepoId = repositoryId ?? (repos.length === 1 ? repos[0].id : null);

  const start = useMutation(
    trpc.github.startDevelopment.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.featureRequest.getById.queryKey({ id: requestId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.github.featureDevelopment.queryKey({ featureRequestId: requestId }),
        });
        toast.success("Development started", {
          description: "Branch created. Open a PR on it to move into review.",
        });
      },
      onError: (err) =>
        toast.error("Couldn't start development", { description: err.message }),
    }),
  );

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Start development</p>
        <p className="text-[0.82rem]" style={{ color: "var(--text-2)" }}>
          The plan is approved. Pick a connected repository and who implements it
          — Throughline creates the working branch and tracks its pull request.
        </p>
      </div>

      {reposQuery.isLoading ? (
        <div className="h-24 rounded-[10px]" style={{ background: "var(--muted)" }} />
      ) : repos.length === 0 ? (
        <div
          className="flex flex-col gap-1.5 rounded-[10px] p-4"
          style={{ background: "var(--amber-bg)", border: "1px solid var(--border-hair)" }}
        >
          <p className="text-[0.82rem] font-medium" style={{ color: "var(--text-1)" }}>
            No repository connected
          </p>
          <p className="text-[0.78rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
            Connect a repository under Settings → GitHub before starting
            development.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p
              className="text-[0.7rem] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-3)" }}
            >
              Repository
            </p>
            <div className="flex flex-col gap-2">
              {repos.map((repo) => {
                const active = selectedRepoId === repo.id;
                return (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => setRepositoryId(repo.id)}
                    className="flex items-center gap-2.5 rounded-[10px] px-4 py-3 text-left transition-colors"
                    style={{
                      background: active ? "var(--peach-pale)" : "var(--surface)",
                      border: `1px solid ${active ? "var(--oxblood)" : "var(--border-hair)"}`,
                    }}
                  >
                    <GitBranchIcon
                      className="size-4 shrink-0"
                      style={{ color: active ? "var(--oxblood)" : "var(--text-3)" }}
                    />
                    <span
                      className="text-[0.82rem]"
                      style={{ color: "var(--text-1)", fontFamily: "var(--font-mono)" }}
                    >
                      {repo.owner}/{repo.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p
              className="text-[0.7rem] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-3)" }}
            >
              Implementer
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {IMPLEMENTERS.map((opt) => {
                const active = implementer === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setImplementer(opt.id)}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-[10px] p-4 text-left transition-colors",
                    )}
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
                    </span>
                    <span className="text-[0.74rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() =>
                selectedRepoId &&
                start.mutate({
                  featureRequestId: requestId,
                  repositoryId: selectedRepoId,
                  implementer,
                })
              }
              disabled={!selectedRepoId || start.isPending}
              className="gap-2"
            >
              {start.isPending ? (
                <>
                  <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
                  Starting…
                </>
              ) : (
                <>
                  <GitBranchIcon className="size-4" />
                  Start development
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
