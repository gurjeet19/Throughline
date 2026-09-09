import type { DiffFile } from "@/components/app/diff-view";

export type ProposalChange = {
  path: string;
  action: "create" | "modify" | "delete";
  oldContent: string;
  newContent: string;
  rationale: string;
};

/**
 * Turn a coding-agent proposal into the unified-diff string + file summary that
 * `DiffView` renders, so the pre-PR review reuses the same diff UI as a real PR.
 * Each file is diffed line-by-line via LCS; create/delete degenerate to all
 * additions / all deletions.
 */
export function buildProposalDiff(changes: ProposalChange[]): {
  diff: string;
  files: DiffFile[];
} {
  const blocks: string[] = [];
  const files: DiffFile[] = [];

  for (const change of changes) {
    const oldLines = change.oldContent ? splitLines(change.oldContent) : [];
    const newLines = change.newContent ? splitLines(change.newContent) : [];
    const lines = diffLines(oldLines, newLines);

    const additions = lines.filter((l) => l[0] === "+").length;
    const deletions = lines.filter((l) => l[0] === "-").length;

    files.push({
      filename: change.path,
      status:
        change.action === "create"
          ? "added"
          : change.action === "delete"
            ? "removed"
            : "modified",
      additions,
      deletions,
    });

    const aHeader = change.action === "create" ? "/dev/null" : `a/${change.path}`;
    const bHeader = change.action === "delete" ? "/dev/null" : `b/${change.path}`;
    blocks.push(
      [
        `diff --git a/${change.path} b/${change.path}`,
        `--- ${aHeader}`,
        `+++ ${bHeader}`,
        `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
        ...lines,
      ].join("\n"),
    );
  }

  return { diff: blocks.join("\n"), files };
}

export function splitLines(text: string): string[] {
  const lines = text.split("\n");
  // A trailing newline yields a final empty element; drop it so it isn't shown.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Classic LCS line diff → unified-diff body lines (` ` context, `-` removed,
 * `+` added). Adequate for review-sized files; not optimized for huge inputs.
 */
export function diffLines(a: string[], b: string[]): string[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(` ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${a[i]}`);
      i++;
    } else {
      out.push(`+${b[j]}`);
      j++;
    }
  }
  while (i < n) out.push(`-${a[i++]}`);
  while (j < m) out.push(`+${b[j++]}`);
  return out;
}
