"use client";

import { useMemo, useState } from "react";
import {
  ChevronRightIcon,
  FileDiffIcon,
  FileMinusIcon,
  FilePlusIcon,
  FilePenIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  previousFilename?: string;
};

type DiffLine = { kind: "hunk" | "add" | "del" | "ctx"; text: string };

// Files whose rendered body is large start collapsed so a big PR doesn't blow
// up the page; the header still summarizes them and they expand on click.
const COLLAPSE_OVER_LINES = 300;

/**
 * GitHub-style diff renderer: a changed-file summary, then per-file collapsible
 * hunks with additions in green (`+`) and deletions in red (`-`), in the design
 * system's mono treatment. Presentational only — it takes already-fetched data,
 * so it's reused wherever a diff needs showing.
 */
export function DiffView({
  files,
  diff,
  truncated,
}: {
  files: DiffFile[];
  diff: string;
  truncated?: boolean;
}) {
  const byFile = useMemo(() => parseDiff(diff), [diff]);

  const totals = files.reduce(
    (acc, f) => {
      acc.add += f.additions;
      acc.del += f.deletions;
      return acc;
    },
    { add: 0, del: 0 },
  );

  if (files.length === 0) {
    return (
      <p className="text-[0.8rem]" style={{ color: "var(--text-3)" }}>
        No changed files in this snapshot.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-[0.75rem]" style={{ color: "var(--text-3)" }}>
        <span>
          {files.length} file{files.length === 1 ? "" : "s"} changed
        </span>
        <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}>
          +{totals.add}
        </span>
        <span style={{ color: "var(--red-err)", fontFamily: "var(--font-mono)" }}>
          −{totals.del}
        </span>
      </div>

      {truncated && (
        <div
          className="rounded-[8px] px-3 py-2 text-[0.74rem]"
          style={{ background: "var(--amber-bg)", color: "var(--amber)" }}
        >
          This diff is large and was truncated. Open it on GitHub to see the rest.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {files.map((file) => (
          <FileBlock
            key={file.filename}
            file={file}
            lines={byFile.get(file.filename) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function FileBlock({ file, lines }: { file: DiffFile; lines: DiffLine[] | null }) {
  const big = (lines?.length ?? 0) > COLLAPSE_OVER_LINES;
  const [open, setOpen] = useState(!big);

  return (
    <div
      className="overflow-hidden rounded-[8px]"
      style={{ border: "1px solid var(--border-hair)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
        style={{ background: "var(--muted)" }}
      >
        <ChevronRightIcon
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
          style={{ color: "var(--text-3)" }}
        />
        <StatusIcon status={file.status} />
        <span
          className="min-w-0 flex-1 truncate text-[0.78rem]"
          style={{ color: "var(--text-1)", fontFamily: "var(--font-mono)" }}
        >
          {file.previousFilename && file.previousFilename !== file.filename
            ? `${file.previousFilename} → ${file.filename}`
            : file.filename}
        </span>
        <span className="shrink-0 text-[0.7rem]" style={{ color: "var(--green)", fontFamily: "var(--font-mono)" }}>
          +{file.additions}
        </span>
        <span className="shrink-0 text-[0.7rem]" style={{ color: "var(--red-err)", fontFamily: "var(--font-mono)" }}>
          −{file.deletions}
        </span>
      </button>

      {open &&
        (lines && lines.length > 0 ? (
          <div className="overflow-x-auto" style={{ background: "var(--surface)" }}>
            <table className="w-full border-collapse" style={{ fontFamily: "var(--font-mono)" }}>
              <tbody>
                {lines.map((line, i) => (
                  <DiffRow key={i} line={line} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p
            className="px-3 py-3 text-[0.74rem]"
            style={{ background: "var(--surface)", color: "var(--text-3)" }}
          >
            No textual diff (binary file, or no line changes).
          </p>
        ))}
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  if (line.kind === "hunk") {
    return (
      <tr>
        <td
          className="select-none px-3 py-0.5 text-[0.72rem]"
          style={{ background: "var(--blue-bg)", color: "var(--blue)" }}
        >
          {line.text}
        </td>
      </tr>
    );
  }

  const style =
    line.kind === "add"
      ? { bg: "var(--green-bg)", color: "var(--text-1)", gutter: "var(--green)", sign: "+" }
      : line.kind === "del"
        ? { bg: "var(--red-bg)", color: "var(--text-1)", gutter: "var(--red-err)", sign: "−" }
        : { bg: "var(--surface)", color: "var(--text-2)", gutter: "var(--text-3)", sign: " " };

  return (
    <tr>
      <td className="p-0 align-top" style={{ background: style.bg }}>
        <div className="flex">
          <span
            className="w-6 shrink-0 select-none px-1 text-right text-[0.72rem]"
            style={{ color: style.gutter }}
          >
            {style.sign}
          </span>
          <span
            className="whitespace-pre py-0.5 pr-3 text-[0.74rem] leading-relaxed"
            style={{ color: style.color }}
          >
            {line.text.slice(1) || " "}
          </span>
        </div>
      </td>
    </tr>
  );
}

function StatusIcon({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; color: string }> = {
    added: { icon: <FilePlusIcon className="size-3.5" />, color: "var(--green)" },
    removed: { icon: <FileMinusIcon className="size-3.5" />, color: "var(--red-err)" },
    modified: { icon: <FilePenIcon className="size-3.5" />, color: "var(--blue)" },
    renamed: { icon: <FileDiffIcon className="size-3.5" />, color: "var(--amber)" },
  };
  const cfg = map[status] ?? { icon: <FileDiffIcon className="size-3.5" />, color: "var(--text-3)" };
  return (
    <span className="shrink-0" style={{ color: cfg.color }} title={status}>
      {cfg.icon}
    </span>
  );
}

/** Split a unified diff into per-file line lists, classified for rendering. */
function parseDiff(diff: string): Map<string, DiffLine[]> {
  const byFile = new Map<string, DiffLine[]>();
  if (!diff) return byFile;

  // Each file section starts with "diff --git a/… b/…".
  const blocks = diff.split(/^diff --git .*$/m).slice(1);
  const headers = diff.match(/^diff --git .*$/gm) ?? [];

  headers.forEach((header, idx) => {
    const block = blocks[idx] ?? "";
    const filename = fileNameFromBlock(header, block);
    if (!filename) return;

    const lines: DiffLine[] = [];
    for (const raw of block.split("\n")) {
      if (
        raw.startsWith("index ") ||
        raw.startsWith("--- ") ||
        raw.startsWith("+++ ") ||
        raw.startsWith("new file mode") ||
        raw.startsWith("deleted file mode") ||
        raw.startsWith("old mode") ||
        raw.startsWith("new mode") ||
        raw.startsWith("similarity index") ||
        raw.startsWith("rename from") ||
        raw.startsWith("rename to") ||
        raw.startsWith("\\ No newline")
      ) {
        continue;
      }
      if (raw.startsWith("@@")) lines.push({ kind: "hunk", text: raw });
      else if (raw.startsWith("+")) lines.push({ kind: "add", text: raw });
      else if (raw.startsWith("-")) lines.push({ kind: "del", text: raw });
      else if (raw.length > 0) lines.push({ kind: "ctx", text: raw });
    }
    byFile.set(filename, lines);
  });

  return byFile;
}

function fileNameFromBlock(header: string, block: string): string | null {
  // Prefer the "+++ b/<file>" target; fall back to "--- a/<file>" for deletions,
  // then to the "diff --git a/x b/y" header.
  const plus = block.match(/^\+\+\+ b\/(.+)$/m);
  if (plus && plus[1] !== "/dev/null") return plus[1];
  const minus = block.match(/^--- a\/(.+)$/m);
  if (minus && minus[1] !== "/dev/null") return minus[1];
  const git = header.match(/^diff --git a\/(.+) b\/(.+)$/);
  return git ? git[2] : null;
}
