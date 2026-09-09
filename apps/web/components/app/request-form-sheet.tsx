"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { useActiveProject } from "@/lib/active-project";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

/**
 * Intake channels, mirroring `INTAKE_CHANNELS` in @throughline/api. Defined
 * locally so this client component doesn't import server-only code.
 */
const CHANNELS = [
  { value: "manual", label: "Manual" },
  { value: "email", label: "Email" },
  { value: "support_ticket", label: "Support ticket" },
  { value: "customer_call", label: "Customer call" },
] as const;

type Channel = (typeof CHANNELS)[number]["value"];

type Errors = { title?: string; description?: string };

function validate(title: string, description: string): Errors {
  const errs: Errors = {};
  if (!title.trim()) {
    errs.title = "Title is required.";
  } else if (title.trim().length < 3) {
    errs.title = "At least 3 characters.";
  } else if (title.trim().length > 200) {
    errs.title = "Max 200 characters.";
  }
  if (!description.trim()) {
    errs.description = "Description is required.";
  } else if (description.trim().length < 10) {
    errs.description = "Add at least 10 characters of detail.";
  }
  return errs;
}

export function RequestFormSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState<Channel>("manual");
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState({ title: false, description: false });

  const titleRef = useRef<HTMLInputElement>(null);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { activeProjectId } = useActiveProject();

  const createMutation = useMutation(
    trpc.featureRequest.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.featureRequest.list.queryKey(),
        });
        toast.success("Request submitted!", {
          description: "AI triage will pick it up shortly.",
        });
        onClose();
        resetForm();
      },
      onError: (err) => {
        toast.error("Something went wrong", { description: err.message });
      },
    }),
  );

  function resetForm() {
    setTitle("");
    setDescription("");
    setChannel("manual");
    setErrors({});
    setTouched({ title: false, description: false });
  }

  // Auto-focus title on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => titleRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      onClose();
      resetForm();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ title: true, description: true });
    const errs = validate(title, description);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const rawContent = `${title.trim()}\n\n${description.trim()}`;
    // New requests land in the active project; "All projects" falls back to the
    // workspace default server-side.
    createMutation.mutate({
      rawContent,
      channel,
      projectId: activeProjectId ?? undefined,
    });
  }

  function revalidateField(field: "title" | "description") {
    setErrors((prev) => ({
      ...prev,
      [field]: validate(title, description)[field],
    }));
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]"
        style={{ borderLeft: "1px solid var(--border-hair)" }}
      >
        {/* Header */}
        <SheetHeader
          className="px-6 pt-6 pb-0 gap-1"
          style={{ borderBottom: "none" }}
        >
          <SheetTitle
            className="text-base font-medium"
            style={{ color: "var(--text-1)" }}
          >
            New{" "}
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                color: "var(--peach-bright)",
                fontWeight: 400,
              }}
            >
              request
            </span>
          </SheetTitle>
          <SheetDescription
            className="text-xs leading-relaxed"
            style={{ color: "var(--text-3)" }}
          >
            Capture what a customer is asking for. More context → better PRD.
          </SheetDescription>
        </SheetHeader>

        <Separator className="mt-4" />

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-y-auto"
          noValidate
        >
          <div className="flex flex-col gap-6 px-6 py-6">
            {/* Title */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="req-title" className="eyebrow">
                  Summary
                </label>
                <span
                  className="text-[0.65rem] tabular-nums"
                  style={{
                    color:
                      title.length > 180 ? "var(--red-err)" : "var(--text-3)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {title.length}/200
                </span>
              </div>
              <Input
                ref={titleRef}
                id="req-title"
                placeholder={'e.g. "Add SSO support via SAML"'}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (touched.title) revalidateField("title");
                }}
                onBlur={() => {
                  setTouched((t) => ({ ...t, title: true }));
                  revalidateField("title");
                }}
                maxLength={200}
                disabled={createMutation.isPending}
                aria-invalid={!!(errors.title && touched.title)}
                aria-describedby={
                  errors.title && touched.title ? "req-title-err" : undefined
                }
                className="text-sm"
              />
              {errors.title && touched.title && (
                <p
                  id="req-title-err"
                  className="text-xs"
                  style={{ color: "var(--red-err)" }}
                >
                  {errors.title}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="req-desc" className="eyebrow">
                  Description
                </label>
                <span
                  className="text-[0.65rem] tabular-nums"
                  style={{
                    color:
                      description.length > 9000
                        ? "var(--red-err)"
                        : "var(--text-3)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {description.length.toLocaleString()}/10,000
                </span>
              </div>
              <Textarea
                id="req-desc"
                placeholder={
                  "What problem is the customer solving?\n\nAdd context — who asked, how often, what workaround they use today. The more detail, the better the PRD."
                }
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (touched.description) revalidateField("description");
                }}
                onBlur={() => {
                  setTouched((t) => ({ ...t, description: true }));
                  revalidateField("description");
                }}
                maxLength={10000}
                disabled={createMutation.isPending}
                aria-invalid={!!(errors.description && touched.description)}
                aria-describedby={
                  errors.description && touched.description
                    ? "req-desc-err"
                    : undefined
                }
                className="min-h-[180px] resize-none text-sm leading-relaxed"
              />
              {errors.description && touched.description && (
                <p
                  id="req-desc-err"
                  className="text-xs"
                  style={{ color: "var(--red-err)" }}
                >
                  {errors.description}
                </p>
              )}
            </div>

            {/* Channel selector */}
            <div className="flex flex-col gap-2">
              <label className="eyebrow">Channel</label>
              <div className="grid grid-cols-2 gap-2">
                {CHANNELS.map((c) => {
                  const active = channel === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setChannel(c.value)}
                      disabled={createMutation.isPending}
                      aria-pressed={active}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors"
                      style={{
                        background: active ? "var(--peach-pale)" : "var(--muted)",
                        border: `1px solid ${
                          active ? "var(--peach-light)" : "var(--border-hair)"
                        }`,
                        color: active ? "var(--oxblood)" : "var(--text-2)",
                      }}
                    >
                      <span
                        className="size-1.5 rounded-full shrink-0"
                        style={{
                          background: active
                            ? "var(--oxblood)"
                            : "var(--text-3)",
                        }}
                      />
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[0.7rem]" style={{ color: "var(--text-3)" }}>
                Email, ticket and call requests also arrive automatically via the
                ingest API — see Settings.
              </p>
            </div>
          </div>

          {/* Footer */}
          <SheetFooter
            className="flex-row items-center justify-end gap-2 border-t px-6 py-4"
            style={{ borderColor: "var(--border-hair)", marginTop: "auto" }}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending}
              className="min-w-[136px] gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
                  Submitting…
                </>
              ) : (
                "Submit request"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
