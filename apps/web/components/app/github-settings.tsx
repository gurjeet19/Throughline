"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FolderGitIcon,
  GitPullRequestIcon,
  LockIcon,
  PlugZapIcon,
  PlusIcon,
  UnplugIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PrDetailDialog } from "./pr-detail-dialog";
import { toast } from "sonner";

/** GitHub mark (lucide dropped its brand icons; keep our own inline). */
function GithubMark({ className, color }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={color ?? "currentColor"} aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.36 9.36 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

const REASONS: Record<string, string> = {
  missing_installation: "GitHub didn't return an installation.",
  no_workspace: "No active workspace to connect.",
  forbidden: "Only an owner or admin can connect GitHub.",
  token_failed: "Couldn't verify the installation token.",
};

export function GithubSettings() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const handledParam = useRef(false);

  const statusQuery = useQuery(trpc.github.status.queryOptions());

  const disconnect = useMutation(
    trpc.github.disconnect.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.github.status.queryKey() });
        toast.success("GitHub disconnected");
      },
      onError: (err) =>
        toast.error("Couldn't disconnect", { description: err.message }),
    }),
  );

  // Surface the result of the post-install redirect, then clean the URL.
  useEffect(() => {
    if (handledParam.current) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("github");
    if (!result) return;
    handledParam.current = true;
    if (result === "connected") {
      toast.success("GitHub connected");
    } else {
      toast.error("Couldn't connect GitHub", {
        description: REASONS[params.get("reason") ?? ""] ?? "Please try again.",
      });
    }
    queryClient.invalidateQueries({ queryKey: trpc.github.status.queryKey() });
    router.replace("/dashboard/settings");
  }, [queryClient, router, trpc.github.status]);

  const data = statusQuery.data;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="h-section">GitHub</h1>
        <p className="text-sm max-w-prose" style={{ color: "var(--text-2)" }}>
          Connect a repository so Throughline can carry an approved plan into
          development — branches, pull requests, and AI review. Install the
          Throughline GitHub App on the org or account that owns your repos.
        </p>
      </div>

      <Separator />

      {statusQuery.isLoading ? (
        <div className="h-24 rounded-lg" style={{ background: "var(--muted)" }} />
      ) : !data?.configured ? (
        <NotConfigured />
      ) : data.connected ? (
        <>
          <Connected
            accountLogin={data.accountLogin ?? "unknown"}
            accountType={data.accountType}
            repoCount={data.repoCount}
            connectUrl={data.connectUrl}
            onDisconnect={() => disconnect.mutate()}
            disconnecting={disconnect.isPending}
          />
          <Repositories />
        </>
      ) : (
        <Disconnected
          connectUrl={data.connectUrl}
          stale={"stale" in data ? data.stale : undefined}
        />
      )}
    </section>
  );
}

/**
 * Connected repositories for the active workspace. Lists the persisted rows and
 * lets an admin connect another from the installation's accessible repos (live)
 * or disconnect one. All identifiers render in mono per the design system.
 */
function Repositories() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const connectedQuery = useQuery(trpc.github.connectedRepos.queryOptions());

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.github.connectedRepos.queryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.github.availableRepos.queryKey(),
    });
    // The header card shows an accessible-repo count derived from status.
    queryClient.invalidateQueries({ queryKey: trpc.github.status.queryKey() });
  }

  const disconnectRepo = useMutation(
    trpc.github.disconnectRepo.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Repository disconnected");
      },
      onError: (err) =>
        toast.error("Couldn't disconnect", { description: err.message }),
    }),
  );

  const connected = connectedQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="eyebrow">Repositories</p>
          <span
            className="text-[0.72rem] tabular-nums"
            style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
          >
            {connected.length}
          </span>
        </div>
        <RepoPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onConnected={invalidate}
        />
      </div>

      {connectedQuery.isLoading ? (
        <div className="h-16 rounded-lg" style={{ background: "var(--muted)" }} />
      ) : connected.length === 0 ? (
        <div
          className="flex flex-col items-center gap-1.5 rounded-[10px] px-4 py-8 text-center"
          style={{ border: "1px dashed var(--border-hair)" }}
        >
          <FolderGitIcon className="size-5" style={{ color: "var(--text-3)" }} />
          <p className="text-[0.8rem]" style={{ color: "var(--text-2)" }}>
            No repositories connected yet.
          </p>
          <p className="text-[0.72rem]" style={{ color: "var(--text-3)" }}>
            Connect one to tie feature work to real code.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {connected.map((repo) => (
            <RepoRow
              key={repo.id}
              repo={repo}
              onDisconnect={() => disconnectRepo.mutate({ id: repo.id })}
              disconnecting={disconnectRepo.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type ConnectedRepo = {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
};

/** A connected repo, expandable to reveal its webhook-tracked pull requests. */
function RepoRow({
  repo,
  onDisconnect,
  disconnecting,
}: {
  repo: ConnectedRepo;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  const prsQuery = useQuery({
    ...trpc.github.pullRequests.queryOptions({ repositoryId: repo.id }),
    enabled: open,
    // While open, keep the list fresh as webhooks land new PR activity.
    refetchInterval: open ? 10_000 : false,
  });

  const prs = prsQuery.data ?? [];

  return (
    <li
      className="rounded-[10px]"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-label={open ? "Hide pull requests" : "Show pull requests"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid size-5 shrink-0 place-items-center rounded-[5px] transition-colors"
          style={{ color: "var(--text-3)" }}
        >
          <ChevronRightIcon
            className={cn("size-4 transition-transform", open && "rotate-90")}
          />
        </button>
        <FolderGitIcon className="size-4 shrink-0" style={{ color: "var(--text-3)" }} />
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[0.82rem]"
            style={{ color: "var(--text-1)", fontFamily: "var(--font-mono)" }}
          >
            {repo.owner}/{repo.name}
          </div>
          <div
            className="text-[0.7rem]"
            style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
          >
            default: {repo.defaultBranch}
          </div>
        </div>
        <button
          type="button"
          aria-label={`Disconnect ${repo.owner}/${repo.name}`}
          onClick={onDisconnect}
          disabled={disconnecting}
          className="grid size-7 shrink-0 place-items-center rounded-[6px] transition-colors disabled:opacity-50"
          style={{ color: "var(--text-3)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--red-bg)";
            e.currentTarget.style.color = "var(--red-err)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-3)";
          }}
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {open && (
        <div
          className="flex flex-col gap-1.5 px-4 pb-3"
          style={{ borderTop: "1px solid var(--border-hair)" }}
        >
          {prsQuery.isLoading ? (
            <div className="py-3 text-[0.74rem]" style={{ color: "var(--text-3)" }}>
              Loading pull requests…
            </div>
          ) : prs.length === 0 ? (
            <div
              className="flex items-center gap-2 py-3 text-[0.74rem]"
              style={{ color: "var(--text-3)" }}
            >
              <GitPullRequestIcon className="size-3.5" />
              No pull requests tracked yet. They appear here as the GitHub App
              receives webhook events.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 pt-2.5">
              {prs.map((pr) => (
                <PullRequestRow key={pr.id} pr={pr} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

type PullRequestItem = {
  id: string;
  number: number;
  title: string;
  state: string;
  merged: boolean;
  branch: string;
  htmlUrl: string;
  authorLogin: string | null;
};

function prStateStyle(pr: PullRequestItem): { label: string; color: string; bg: string } {
  if (pr.merged) return { label: "Merged", color: "var(--oxblood)", bg: "var(--oxblood-pale)" };
  if (pr.state === "closed") return { label: "Closed", color: "var(--red-err)", bg: "var(--red-bg)" };
  return { label: "Open", color: "var(--green)", bg: "var(--green-bg)" };
}

function PullRequestRow({ pr }: { pr: PullRequestItem }) {
  const s = prStateStyle(pr);
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <li>
      <div
        className="flex items-center gap-2.5 rounded-[8px] px-3 py-2 transition-colors"
        style={{ border: "1px solid var(--border-hair)" }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--peach-light)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-hair)")}
      >
        <GitPullRequestIcon className="size-3.5 shrink-0" style={{ color: s.color }} />
        <span
          className="shrink-0 text-[0.72rem] tabular-nums"
          style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
        >
          #{pr.number}
        </span>
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="min-w-0 flex-1 truncate text-left text-[0.78rem] transition-colors"
          style={{ color: "var(--text-1)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--oxblood)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-1)")}
        >
          {pr.title || "(untitled)"}
        </button>
        <span
          className="hidden shrink-0 truncate text-[0.68rem] sm:inline"
          style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)", maxWidth: 140 }}
        >
          {pr.branch}
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
          style={{ background: s.bg, color: s.color }}
        >
          {s.label}
        </span>
        <a
          href={pr.htmlUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View on GitHub"
          className="grid size-6 shrink-0 place-items-center rounded-[6px] transition-colors"
          style={{ color: "var(--text-3)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--oxblood)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
        >
          <ExternalLinkIcon className="size-3.5" />
        </a>
      </div>

      {detailOpen && (
        <PrDetailDialog
          pullRequestId={pr.id}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}
    </li>
  );
}

/** Dialog picker of the installation's accessible repos, live via Octokit. */
function RepoPicker({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const trpc = useTRPC();

  // Only fetch the (potentially large) accessible list while the picker is open.
  const availableQuery = useQuery({
    ...trpc.github.availableRepos.queryOptions(),
    enabled: open,
  });

  const [connectingId, setConnectingId] = useState<string | null>(null);

  const connectRepo = useMutation(
    trpc.github.connectRepo.mutationOptions({
      onSuccess: () => {
        onConnected();
        setConnectingId(null);
        toast.success("Repository connected");
      },
      onError: (err) => {
        setConnectingId(null);
        toast.error("Couldn't connect", { description: err.message });
      },
    }),
  );
  const repos = availableQuery.data ?? [];
  const connectable = repos.filter((r) => !r.connected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <PlusIcon className="size-3.5" />
            Connect a repo
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a repository</DialogTitle>
          <DialogDescription>
            Pick a repository the Throughline GitHub App can access.
          </DialogDescription>
        </DialogHeader>

        {availableQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 rounded-[8px]"
                style={{ background: "var(--muted)" }}
              />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <p className="py-6 text-center text-[0.8rem]" style={{ color: "var(--text-2)" }}>
            The installation can&apos;t access any repositories. Configure the
            App on GitHub to grant repo access, then reopen this.
          </p>
        ) : connectable.length === 0 ? (
          <p className="py-6 text-center text-[0.8rem]" style={{ color: "var(--text-2)" }}>
            Every accessible repository is already connected.
          </p>
        ) : (
          <ul className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
            {connectable.map((repo) => (
              <li key={repo.repoId}>
                <div
                  className="flex items-center gap-3 rounded-[8px] px-3 py-2.5"
                  style={{ border: "1px solid var(--border-hair)" }}
                >
                  {repo.private ? (
                    <LockIcon
                      className="size-3.5 shrink-0"
                      style={{ color: "var(--text-3)" }}
                    />
                  ) : (
                    <FolderGitIcon
                      className="size-3.5 shrink-0"
                      style={{ color: "var(--text-3)" }}
                    />
                  )}
                  <span
                    className="min-w-0 flex-1 truncate text-[0.8rem]"
                    style={{ color: "var(--text-1)", fontFamily: "var(--font-mono)" }}
                  >
                    {repo.fullName}
                  </span>
                  <Button
                    size="sm"
                    disabled={connectRepo.isPending}
                    onClick={() => {
                      setConnectingId(repo.repoId);
                      connectRepo.mutate({ repoId: repo.repoId });
                    }}
                  >
                    {connectingId === repo.repoId ? "Connecting…" : "Connect"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-4 rounded-lg p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
    >
      {children}
    </div>
  );
}

function Connected({
  accountLogin,
  accountType,
  repoCount,
  connectUrl,
  onDisconnect,
  disconnecting,
}: {
  accountLogin: string;
  accountType?: string;
  repoCount?: number;
  connectUrl?: string;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--muted)" }}
        >
          <GithubMark className="size-5" color="var(--text-1)" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="truncate text-sm font-semibold"
              style={{ color: "var(--text-1)" }}
            >
              {accountLogin}
            </span>
            <CheckCircle2Icon
              className="size-4 shrink-0"
              style={{ color: "var(--green)" }}
            />
          </div>
          <div className="text-[0.75rem]" style={{ color: "var(--text-3)" }}>
            {accountType ?? "Account"}
            {typeof repoCount === "number"
              ? ` · ${repoCount} repositor${repoCount === 1 ? "y" : "ies"} accessible`
              : ""}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide"
          style={{ background: "var(--green-bg)", color: "var(--green)" }}
        >
          Connected
        </span>
      </div>

      <Separator />

      <div className="flex flex-wrap items-center gap-2">
        {connectUrl && (
          <Button
            variant="outline"
            size="sm"
            render={<a href={connectUrl} target="_blank" rel="noreferrer" />}
          >
            Configure repositories
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="gap-2"
          style={{ color: "var(--red-err)" }}
        >
          <UnplugIcon className="size-4" />
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </Button>
      </div>
    </Card>
  );
}

function Disconnected({
  connectUrl,
  stale,
}: {
  connectUrl?: string;
  stale?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--muted)" }}
        >
          <GithubMark className="size-5" color="var(--text-2)" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
            Not connected
          </div>
          <div className="text-[0.75rem]" style={{ color: "var(--text-3)" }}>
            {stale
              ? "The previous installation was removed on GitHub. Reconnect to continue."
              : "Install the GitHub App to link a repository."}
          </div>
        </div>
      </div>

      {connectUrl ? (
        <Button render={<a href={connectUrl} />} className="gap-2 self-start">
          <PlugZapIcon className="size-4" />
          Connect GitHub
        </Button>
      ) : (
        <p className="text-[0.75rem]" style={{ color: "var(--red-err)" }}>
          Couldn&apos;t reach GitHub to build the install link. Check the App
          credentials on the server.
        </p>
      )}
    </Card>
  );
}

function NotConfigured() {
  return (
    <Card>
      <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
        GitHub integration isn&apos;t configured
      </div>
      <p className="text-[0.8rem] leading-relaxed" style={{ color: "var(--text-2)" }}>
        This server is missing the GitHub App credentials. Set{" "}
        <code style={{ fontFamily: "var(--font-mono)" }}>GITHUB_APP_ID</code>,{" "}
        <code style={{ fontFamily: "var(--font-mono)" }}>GITHUB_APP_PRIVATE_KEY</code>,
        and the client/webhook secrets in the environment, then reload.
      </p>
    </Card>
  );
}
