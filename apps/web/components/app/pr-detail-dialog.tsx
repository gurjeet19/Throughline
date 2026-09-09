"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DiffView } from "./diff-view";
import { cn } from "@/lib/utils";

/**
 * Pull request detail: the changed files + diff, fetched live in the background.
 * Shows the fetch's progress, auto-refetches when the snapshot is missing or
 * lags the PR's head, and lets the user re-fetch on demand.
 */
export function PrDetailDialog({
  pullRequestId,
  open,
  onOpenChange,
}: {
  pullRequestId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const triggered = useRef(false);

  const run = useQuery({
    ...trpc.workflowRun.getByEntityId.queryOptions({ entityId: pullRequestId }),
    enabled: open,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "succeeded" || s === "failed" ? false : 1500;
    },
  });
  const runActive = run.data
    ? run.data.status === "pending" || run.data.status === "running"
    : false;

  const diffQuery = useQuery({
    ...trpc.github.prDiff.queryOptions({ pullRequestId }),
    enabled: open,
    refetchInterval: runActive ? 1500 : false,
  });

  const refetch = useMutation(
    trpc.github.refetchPrDiff.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.workflowRun.getByEntityId.queryKey({ entityId: pullRequestId }),
        });
      },
    }),
  );

  // Kick off a fetch once per open when the snapshot is missing or stale and
  // nothing is already running.
  const data = diffQuery.data;
  useEffect(() => {
    if (!open) {
      triggered.current = false;
      return;
    }
    if (triggered.current || diffQuery.isLoading || run.isLoading) return;
    if (data?.stale && !runActive) {
      triggered.current = true;
      refetch.mutate({ pullRequestId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data?.stale, runActive, diffQuery.isLoading, run.isLoading]);

  // When a run settles, pull the fresh snapshot in.
  useEffect(() => {
    if (run.data?.status === "succeeded") {
      queryClient.invalidateQueries({
        queryKey: trpc.github.prDiff.queryKey({ pullRequestId }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.data?.status]);

  const pr = data?.pullRequest;
  const snapshot = data?.snapshot ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            {pr && (
              <span
                className="text-[0.72rem] tabular-nums"
                style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
              >
                #{pr.number}
              </span>
            )}
            <DialogTitle className="min-w-0 flex-1 truncate leading-snug">
              {pr?.title || "Pull request"}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Changed files and diff for this pull request.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {pr && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              render={<a href={pr.htmlUrl} target="_blank" rel="noreferrer" />}
            >
              <ExternalLinkIcon className="size-3.5" />
              View on GitHub
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            disabled={runActive || refetch.isPending}
            onClick={() => {
              triggered.current = true;
              refetch.mutate({ pullRequestId });
            }}
          >
            <RefreshCwIcon className={cn("size-3.5", runActive && "spin-slow")} />
            {runActive ? "Fetching…" : "Refresh diff"}
          </Button>
          {snapshot?.truncated ? null : data?.stale && !runActive ? (
            <span className="text-[0.72rem]" style={{ color: "var(--amber)" }}>
              Snapshot is out of date
            </span>
          ) : null}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {runActive && !snapshot ? (
            <ProgressRow step={run.data?.currentStep ?? "Fetching the diff"} />
          ) : run.data?.status === "failed" && !snapshot ? (
            <p className="py-6 text-center text-[0.82rem]" style={{ color: "var(--red-err)" }}>
              Couldn&apos;t fetch the diff. Try refreshing.
            </p>
          ) : snapshot ? (
            <DiffView
              files={snapshot.files}
              diff={snapshot.diff}
              truncated={snapshot.truncated}
            />
          ) : diffQuery.isLoading ? (
            <ProgressRow step="Loading" />
          ) : (
            <p className="py-6 text-center text-[0.82rem]" style={{ color: "var(--text-3)" }}>
              No diff yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProgressRow({ step }: { step: string }) {
  return (
    <div className="flex items-center gap-2.5 py-6" style={{ color: "var(--text-2)" }}>
      <span
        className="size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent spin-slow"
        style={{ color: "var(--peach)" }}
      />
      <span className="text-[0.82rem]">{step}…</span>
    </div>
  );
}
