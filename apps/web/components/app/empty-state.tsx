import { InboxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center py-24 px-8 text-center fade-up" style={{ "--d": "0.1s" } as React.CSSProperties}>
      {/* Illustration */}
      <div
        className="relative mb-8 flex size-20 items-center justify-center rounded-2xl"
        style={{
          background: "var(--peach-pale)",
          border: "1px solid var(--peach-light)",
        }}
      >
        <InboxIcon
          className="size-9"
          style={{ color: "var(--oxblood)", opacity: 0.7 }}
        />
        {/* Decorative ring */}
        <div
          className="absolute inset-[-6px] rounded-[18px]"
          style={{
            border: "1px dashed var(--peach-light)",
            opacity: 0.6,
          }}
        />
      </div>

      <p
        className="eyebrow mb-2"
        style={{ color: "var(--peach)" }}
      >
        Nothing here yet
      </p>

      <h3
        className="mb-3 text-xl font-medium"
        style={{
          fontFamily: "var(--font-serif)",
          color: "var(--text-1)",
        }}
      >
        Start capturing what customers{" "}
        <em
          style={{
            fontStyle: "italic",
            color: "var(--peach-bright)",
          }}
        >
          want.
        </em>
      </h3>

      <p
        className="mb-8 max-w-sm text-sm leading-relaxed"
        style={{ color: "var(--text-2)" }}
      >
        Every feature request lands here — from customer calls, support tickets,
        or your own ideas. Submit the first one to kick off the pipeline.
      </p>

      <Button onClick={onNew} size="sm" className="gap-2">
        Submit first request
      </Button>
    </div>
  );
}
