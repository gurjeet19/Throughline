import { cn } from "@/lib/utils";

type Status = string;

const STATUS_MAP: Record<
  string,
  { label: string; bg: string; color: string; dot: string }
> = {
  requested: {
    label: "Requested",
    bg: "var(--amber-bg)",
    color: "var(--amber)",
    dot: "var(--amber)",
  },
  clarifying: {
    label: "Clarifying",
    bg: "var(--blue-bg)",
    color: "var(--blue)",
    dot: "var(--blue)",
  },
  "prd-drafted": {
    label: "PRD Drafted",
    bg: "var(--green-bg)",
    color: "var(--green)",
    dot: "var(--green)",
  },
  "prd-approved": {
    label: "PRD Approved",
    bg: "var(--oxblood-pale)",
    color: "var(--oxblood)",
    dot: "var(--oxblood)",
  },
  "tasks-planned": {
    label: "Tasks Planned",
    bg: "var(--blue-bg)",
    color: "var(--blue)",
    dot: "var(--blue)",
  },
  "plan-approved": {
    label: "Plan Approved",
    bg: "var(--green-bg)",
    color: "var(--green)",
    dot: "var(--green)",
  },
  "in-development": {
    label: "In Development",
    bg: "var(--blue-bg)",
    color: "var(--blue)",
    dot: "var(--blue)",
  },
  "in-review": {
    label: "In Review",
    bg: "var(--oxblood-pale)",
    color: "var(--oxblood)",
    dot: "var(--oxblood)",
  },
  "fix-needed": {
    label: "Fix Needed",
    bg: "var(--red-bg)",
    color: "var(--red-err)",
    dot: "var(--red-err)",
  },
  "awaiting-approval": {
    label: "Awaiting Approval",
    bg: "var(--amber-bg)",
    color: "var(--amber)",
    dot: "var(--amber)",
  },
  "changes-requested": {
    label: "Changes Requested",
    bg: "var(--red-bg)",
    color: "var(--red-err)",
    dot: "var(--red-err)",
  },
  shipped: {
    label: "Shipped",
    bg: "var(--green-bg)",
    color: "var(--green)",
    dot: "var(--green)",
  },
  exists: {
    label: "Already Exists",
    bg: "var(--muted)",
    color: "var(--text-2)",
    dot: "var(--text-3)",
  },
  flagged: {
    label: "Flagged",
    bg: "var(--red-bg)",
    color: "var(--red-err)",
    dot: "var(--red-err)",
  },
};

const FALLBACK = {
  label: "Unknown",
  bg: "var(--muted)",
  color: "var(--text-3)",
  dot: "var(--text-3)",
};

export function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const cfg = STATUS_MAP[status.toLowerCase()] ?? FALLBACK;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        className,
      )}
      style={{
        background: cfg.bg,
        color: cfg.color,
        fontSize: "0.62rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}
