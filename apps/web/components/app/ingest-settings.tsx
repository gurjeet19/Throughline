"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, CheckIcon, RefreshCwIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

function useCopy() {
  const [copied, setCopied] = useState(false);
  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return { copied, copy };
}

export function IngestSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const { copied, copy } = useCopy();

  const { data, isLoading } = useQuery(trpc.workspace.getIngestToken.queryOptions());

  const regenerate = useMutation(
    trpc.workspace.regenerateIngestToken.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.workspace.getIngestToken.queryKey(),
        });
        setRevealed(true);
        toast.success("Token regenerated", {
          description: "The previous token no longer works.",
        });
      },
      onError: (err) => toast.error("Couldn't regenerate", { description: err.message }),
    }),
  );

  const token = data?.token ?? "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpoint = `${origin}/api/ingest`;
  const masked = token ? `${token.slice(0, 12)}${"•".repeat(16)}` : "";

  const curl = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${revealed ? token : "<INGEST_TOKEN>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"channel":"email","title":"Add SSO","content":"A customer asked for SAML login..."}'`;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="h-section">Intake</h1>
        <p className="text-sm max-w-prose" style={{ color: "var(--text-2)" }}>
          Requests arrive through any channel. Use the manual form, or let an
          email forwarder, support-ticket system, or call-notes tool POST to the
          inbound endpoint below. Every channel feeds the same AI triage → PRD
          pipeline.
        </p>
      </div>

      <Separator />

      {/* Endpoint */}
      <Field label="Endpoint">
        <CodeRow value={endpoint} onCopy={() => copy(endpoint)} copied={copied} />
      </Field>

      {/* Token */}
      <Field label="Ingest token">
        {isLoading ? (
          <div className="h-9 rounded-lg" style={{ background: "var(--muted)" }} />
        ) : (
          <div className="flex items-center gap-2">
            <CodeRow
              value={revealed ? token : masked}
              onCopy={() => copy(token)}
              copied={copied}
              mono
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRevealed((r) => !r)}
              title={revealed ? "Hide" : "Reveal"}
            >
              {revealed ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              title="Regenerate"
            >
              <RefreshCwIcon
                className={`size-4 ${regenerate.isPending ? "spin-slow" : ""}`}
              />
            </Button>
          </div>
        )}
        <p className="text-[0.7rem]" style={{ color: "var(--text-3)" }}>
          Treat this like a password. Anyone with it can submit requests into
          this workspace. Regenerating invalidates the old token immediately.
        </p>
      </Field>

      {/* Example */}
      <Field label="Example">
        <pre
          className="overflow-x-auto rounded-lg p-4 text-[0.75rem] leading-relaxed"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-hair)",
            color: "var(--text-2)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {curl}
        </pre>
        <p className="text-[0.7rem]" style={{ color: "var(--text-3)" }}>
          {'Valid channels: manual, email, support_ticket, customer_call. '}
          {'"title" is optional; "content" is required.'}
        </p>
      </Field>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="eyebrow">{label}</label>
      {children}
    </div>
  );
}

function CodeRow({
  value,
  onCopy,
  copied,
  mono,
}: {
  value: string;
  onCopy: () => void;
  copied: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: "var(--muted)", border: "1px solid var(--border-hair)" }}
    >
      <code
        className="flex-1 truncate text-[0.8rem]"
        style={{
          color: "var(--text-1)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 transition-colors"
        style={{ color: copied ? "var(--green)" : "var(--text-3)" }}
        title="Copy"
      >
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      </button>
    </div>
  );
}
