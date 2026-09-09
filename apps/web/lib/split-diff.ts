import { diffLines, splitLines, type ProposalChange } from "@/lib/proposal-diff";

export type SplitCellKind = "ctx" | "del" | "add";

/** One side of a split-diff row: a line number, its text, and how it changed. */
export type SplitCell = {
  num: number;
  text: string;
  kind: SplitCellKind;
};

/** A single aligned row: the old line on the left, the new line on the right. */
export type SplitRow = {
  left: SplitCell | null;
  right: SplitCell | null;
};

export type SplitFile = {
  path: string;
  status: "added" | "removed" | "modified";
  additions: number;
  deletions: number;
  rows: SplitRow[];
};

/**
 * Build a side-by-side (split) diff for each proposed file change: the old
 * content on the left, the new content on the right, with changed lines aligned
 * row-for-row. Reuses the same LCS line diff as the unified view so both stay
 * consistent. Deletions sit on the left, additions on the right; a changed block
 * pairs them up and pads the shorter side with an empty cell.
 */
export function buildSplitFiles(changes: ProposalChange[]): SplitFile[] {
  return changes.map((change) => {
    const oldLines = splitLines(change.oldContent ?? "");
    const newLines = splitLines(change.newContent ?? "");
    const unified = diffLines(oldLines, newLines);

    const rows: SplitRow[] = [];
    let leftNo = 1;
    let rightNo = 1;
    let additions = 0;
    let deletions = 0;

    let i = 0;
    while (i < unified.length) {
      const marker = unified[i][0];

      // Unchanged line — same on both sides.
      if (marker === " ") {
        const text = unified[i].slice(1);
        rows.push({
          left: { num: leftNo++, text, kind: "ctx" },
          right: { num: rightNo++, text, kind: "ctx" },
        });
        i++;
        continue;
      }

      // A change block: collect the run of removals and additions, then zip them
      // so paired edits line up across the gutter.
      const dels: string[] = [];
      const adds: string[] = [];
      while (i < unified.length && unified[i][0] !== " ") {
        if (unified[i][0] === "-") dels.push(unified[i].slice(1));
        else adds.push(unified[i].slice(1));
        i++;
      }
      deletions += dels.length;
      additions += adds.length;

      const span = Math.max(dels.length, adds.length);
      for (let k = 0; k < span; k++) {
        rows.push({
          left: k < dels.length ? { num: leftNo++, text: dels[k], kind: "del" } : null,
          right: k < adds.length ? { num: rightNo++, text: adds[k], kind: "add" } : null,
        });
      }
    }

    return {
      path: change.path,
      status:
        change.action === "create"
          ? "added"
          : change.action === "delete"
            ? "removed"
            : "modified",
      additions,
      deletions,
      rows,
    };
  });
}

/** The last path segment, for a compact tab label. */
export function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}
