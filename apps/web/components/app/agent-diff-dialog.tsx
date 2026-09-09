"use client";

import { useMemo, useState } from "react";
import {
  CheckIcon,
  FileMinusIcon,
  FilePenIcon,
  FilePlusIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  baseName,
  buildSplitFiles,
  type SplitCell,
  type SplitFile,
  type SplitRow,
} from "@/lib/split-diff";
import type { ProposalChange } from "@/lib/proposal-diff";

/**
 * Focused review of the coding agent's proposed changes: one tab per file, each
 * showing the old code on the left and the new code on the right, aligned
 * line-for-line with +/- gutters. The decision (confirm / reject) lives in the
 * footer so a change is only shipped after it's been looked at.
 */
export function AgentDiffDialog({
  open,
  onOpenChange,
  isFix,
  summary,
  changes,
  busy,
  confirming,
  onConfirm,
  onReject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFix: boolean;
  summary: string;
  changes: ProposalChange[];
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const files = useMemo(() => buildSplitFiles(changes), [changes]);
  const [active, setActive] = useState(0);
  const file = files[active] ?? files[0];

  const totals = files.reduce(
    (acc, f) => {
      acc.add += f.additions;
      acc.del += f.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );

  const rationale = changes[active]?.rationale ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(82vh,800px)] max-w-[min(1180px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 gap-2 border-b border-[var(--border-hair)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-[0.95rem]">
                {isFix ? "Proposed fix" : "Proposed changes"}
              </DialogTitle>
              <DialogDescription className="text-[0.8rem]">
                {files.length} file{files.length === 1 ? "" : "s"} changed
                <span
                  className="ml-2 tabular-nums"
                  style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}
                >
                  +{totals.add}
                </span>
                <span
                  className="ml-1.5 tabular-nums"
                  style={{ color: "var(--red-err)", fontFamily: "var(--font-mono)" }}
                >
                  −{totals.del}
                </span>
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <XIcon className="size-4" />
            </Button>
          </div>

          {summary && (
            <p
              className="text-[0.82rem] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              {summary}
            </p>
          )}
        </DialogHeader>

        {/* File tabs */}
        <div
          className="flex shrink-0 gap-1 overflow-x-auto px-3 pt-2"
          style={{ borderBottom: "1px solid var(--border-hair)" }}
          role="tablist"
        >
          {files.map((f, i) => (
            <FileTab
              key={f.path}
              file={f}
              active={i === active}
              onSelect={() => setActive(i)}
            />
          ))}
        </div>

        {/* Active file diff */}
        <div className="flex min-h-0 flex-1 flex-col">
          {file && (
            <>
              <div
                className="flex items-center justify-between gap-3 px-5 py-2.5"
                style={{ background: "var(--muted)" }}
              >
                <span
                  className="min-w-0 flex-1 truncate text-[0.78rem]"
                  style={{ color: "var(--text-1)", fontFamily: "var(--font-mono)" }}
                  title={file.path}
                >
                  {file.path}
                </span>
                {rationale && (
                  <span
                    className="hidden max-w-[40%] truncate text-[0.76rem] sm:inline"
                    style={{ color: "var(--text-3)" }}
                    title={rationale}
                  >
                    {rationale}
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <SplitDiff file={file} />
              </div>
            </>
          )}
        </div>

        {/* Decision footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-hair)] p-4">
          <Button
            variant="ghost"
            onClick={onReject}
            disabled={busy}
            className="gap-2"
            style={{ color: "var(--red-err)" }}
          >
            <XIcon className="size-4" />
            Reject
          </Button>
          <Button onClick={onConfirm} disabled={busy} className="gap-2">
            {confirming ? (
              <>
                <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
                {isFix ? "Pushing…" : "Committing…"}
              </>
            ) : (
              <>
                <CheckIcon className="size-4" />
                {isFix ? "Confirm & push fix" : "Confirm & open PR"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FileTab({
  file,
  active,
  onSelect,
}: {
  file: SplitFile;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      title={file.path}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-[0.78rem] font-medium transition-colors"
      style={{
        color: active ? "var(--oxblood)" : "var(--text-2)",
        borderBottom: `2px solid ${active ? "var(--oxblood)" : "transparent"}`,
      }}
    >
      <StatusIcon status={file.status} />
      {baseName(file.path)}
      <span
        className="tabular-nums text-[0.68rem]"
        style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
      >
        +{file.additions} −{file.deletions}
      </span>
    </button>
  );
}

function StatusIcon({ status }: { status: SplitFile["status"] }) {
  const cfg =
    status === "added"
      ? { icon: <FilePlusIcon className="size-3.5" />, color: "var(--green)" }
      : status === "removed"
        ? { icon: <FileMinusIcon className="size-3.5" />, color: "var(--red-err)" }
        : { icon: <FilePenIcon className="size-3.5" />, color: "var(--blue)" };
  return (
    <span className="shrink-0" style={{ color: cfg.color }}>
      {cfg.icon}
    </span>
  );
}

function SplitDiff({ file }: { file: SplitFile }) {
  if (file.rows.length === 0) {
    return (
      <p className="px-5 py-6 text-[0.8rem]" style={{ color: "var(--text-3)" }}>
        No textual changes in this file.
      </p>
    );
  }

  // Two equal panes: the old code (deletions) on the left, the new code
  // (additions) on the right. Each pane scrolls horizontally on its own; the
  // outer container scrolls them vertically together. Rows align by index, so a
  // one-sided change shows a quiet filler opposite it.
  return (
    <div className="flex" style={{ fontFamily: "var(--font-mono)" }}>
      <Pane rows={file.rows} side="left" />
      <Pane rows={file.rows} side="right" />
    </div>
  );
}

function Pane({ rows, side }: { rows: SplitRow[]; side: "left" | "right" }) {
  return (
    <div
      className="w-1/2 min-w-0 overflow-x-auto"
      style={{
        borderRight: side === "left" ? "1px solid var(--border-hair)" : undefined,
      }}
    >
      <div className="w-max min-w-full">
        {rows.map((row, i) => (
          <RowLine key={i} cell={side === "left" ? row.left : row.right} />
        ))}
      </div>
    </div>
  );
}

function RowLine({ cell }: { cell: SplitCell | null }) {
  // Empty half of a one-sided change — a quiet filler so the row still aligns.
  if (!cell) {
    return (
      <div className="flex min-w-full" style={{ background: "var(--border-soft)" }}>
        <span className="w-10 shrink-0" />
        <span className="w-4 shrink-0" />
        <span className="whitespace-pre py-0.5 pr-3 text-[0.74rem] leading-relaxed">
          {" "}
        </span>
      </div>
    );
  }

  const tone =
    cell.kind === "add"
      ? { bg: "var(--green-bg)", sign: "+", signColor: "var(--green)" }
      : cell.kind === "del"
        ? { bg: "var(--red-bg)", sign: "−", signColor: "var(--red-err)" }
        : { bg: "var(--surface)", sign: " ", signColor: "var(--text-3)" };

  return (
    <div className="flex min-w-full" style={{ background: tone.bg }}>
      <span
        className="w-10 shrink-0 select-none px-2 py-0.5 text-right text-[0.7rem] leading-relaxed"
        style={{ color: "var(--text-3)" }}
      >
        {cell.num}
      </span>
      <span
        className="w-4 shrink-0 select-none py-0.5 text-center text-[0.72rem] leading-relaxed"
        style={{ color: tone.signColor }}
      >
        {tone.sign}
      </span>
      <span
        className="whitespace-pre py-0.5 pr-3 text-[0.74rem] leading-relaxed"
        style={{ color: "var(--text-1)" }}
      >
        {cell.text || " "}
      </span>
    </div>
  );
}
