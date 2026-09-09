"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

type FeatureRequest = {
  id: string;
  rawContent: string;
  status: string;
  channel: string;
  createdAt: Date | string;
};

function parseRawContent(raw: string): { title: string; description: string } {
  const sep = raw.indexOf("\n\n");
  if (sep === -1) return { title: raw.trim(), description: "" };
  return {
    title: raw.slice(0, sep).trim(),
    description: raw.slice(sep + 2).trim(),
  };
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

const CHANNEL_LABELS: Record<string, string> = {
  manual: "Manual",
  email: "Email",
  support_ticket: "Support ticket",
  customer_call: "Customer call",
};

export function RequestCard({
  request,
  style,
  className,
}: {
  request: FeatureRequest;
  style?: React.CSSProperties;
  className?: string;
}) {
  const { title, description } = parseRawContent(request.rawContent);
  const excerpt =
    description.length > 140
      ? description.slice(0, 140).trimEnd() + "…"
      : description;
  const channelLabel =
    CHANNEL_LABELS[request.channel.toLowerCase()] ?? request.channel;

  return (
    <Link
      href={`/dashboard/requests/${request.id}`}
      className={cn(
        "group relative flex flex-col gap-3 rounded-[10px] p-5 transition-all duration-200 cursor-pointer",
        className,
      )}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-hair)",
        ...style,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--peach-light)";
        el.style.transform = "translateY(-1px)";
        el.style.boxShadow = "var(--shadow-sm)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--border-hair)";
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
      }}
    >
      {/* Top row: status + date */}
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={request.status} />
        <span
          className="text-[0.7rem] tabular-nums"
          style={{
            color: "var(--text-3)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {formatDate(request.createdAt)}
        </span>
      </div>

      {/* Title */}
      <div>
        <h3
          className="text-[0.9rem] font-medium leading-snug"
          style={{ color: "var(--text-1)" }}
        >
          {title || "Untitled request"}
        </h3>
        {excerpt && (
          <p
            className="mt-1 text-[0.8rem] leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            {excerpt}
          </p>
        )}
      </div>

      {/* Bottom row: channel + arrow */}
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.62rem] font-medium"
          style={{
            background: "var(--muted)",
            color: "var(--text-3)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {channelLabel}
        </span>
        <ArrowRightIcon
          className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
          style={{ color: "var(--text-3)" }}
        />
      </div>
    </Link>
  );
}
