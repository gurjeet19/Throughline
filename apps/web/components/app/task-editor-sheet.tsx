"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
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

type ColumnId = "todo" | "in-progress" | "done";

export type EditorTarget =
  | { mode: "create"; status: ColumnId; columnLabel: string }
  | {
      mode: "edit";
      status: ColumnId;
      task: { id: string; title: string; description: string };
    };

/**
 * Create or edit a single task. Mounted fresh per open (keyed by the parent) so
 * fields initialize from props without a sync effect. Invalidates both the
 * board (by feature request) and the request page's plan preview (by PRD).
 */
export function TaskEditorSheet({
  open,
  onOpenChange,
  target,
  prdId,
  requestId,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  target: EditorTarget;
  prdId: string;
  requestId: string;
}) {
  const isEdit = target.mode === "edit";
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(isEdit ? target.task.title : "");
  const [description, setDescription] = useState(
    isEdit ? target.task.description : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => titleRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: trpc.task.list.queryKey({ featureRequestId: requestId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.task.list.queryKey({ prdId }),
    });
  }

  const create = useMutation(
    trpc.task.create.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Task added");
        onOpenChange(false);
      },
      onError: (err) => toast.error("Couldn't add task", { description: err.message }),
    }),
  );

  const update = useMutation(
    trpc.task.update.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Task saved");
        onOpenChange(false);
      },
      onError: (err) => toast.error("Couldn't save", { description: err.message }),
    }),
  );

  const remove = useMutation(
    trpc.task.delete.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Task deleted");
        onOpenChange(false);
      },
      onError: (err) => toast.error("Couldn't delete", { description: err.message }),
    }),
  );

  const pending = create.isPending || update.isPending || remove.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }
    if (trimmed.length > 200) {
      setError("Max 200 characters.");
      return;
    }
    if (target.mode === "edit") {
      update.mutate({
        id: target.task.id,
        title: trimmed,
        description: description.trim(),
      });
    } else {
      create.mutate({
        prdId,
        status: target.status,
        title: trimmed,
        description: description.trim(),
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]"
        style={{ borderLeft: "1px solid var(--border-hair)" }}
      >
        <SheetHeader className="gap-1 px-6 pb-0 pt-6" style={{ borderBottom: "none" }}>
          <SheetTitle
            className="text-base font-medium"
            style={{ color: "var(--text-1)" }}
          >
            {isEdit ? "Edit " : "New "}
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                color: "var(--peach-bright)",
                fontWeight: 400,
              }}
            >
              task
            </span>
          </SheetTitle>
          <SheetDescription
            className="text-xs leading-relaxed"
            style={{ color: "var(--text-3)" }}
          >
            {isEdit
              ? "Refine the work item so it matches how your team builds."
              : `Add a work item to “${target.columnLabel}”.`}
          </SheetDescription>
        </SheetHeader>

        <Separator className="mt-4" />

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto" noValidate>
          <div className="flex flex-col gap-6 px-6 py-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="task-title" className="eyebrow">
                  Title
                </label>
                <span
                  className="text-[0.65rem] tabular-nums"
                  style={{
                    color: title.length > 180 ? "var(--red-err)" : "var(--text-3)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {title.length}/200
                </span>
              </div>
              <Input
                ref={titleRef}
                id="task-title"
                placeholder={'e.g. "A user can filter tasks by status"'}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={200}
                disabled={pending}
                aria-invalid={!!error}
                className="text-sm"
              />
              {error && (
                <p className="text-xs" style={{ color: "var(--red-err)" }}>
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="task-desc" className="eyebrow">
                Description
              </label>
              <Textarea
                id="task-desc"
                placeholder="What does this slice deliver end-to-end, and how is it verified?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                disabled={pending}
                className="min-h-[160px] resize-none text-sm leading-relaxed"
              />
            </div>

            {isEdit && (
              <div className="flex flex-col gap-2">
                <label className="eyebrow" style={{ color: "var(--red-err)" }}>
                  Danger zone
                </label>
                {confirmingDelete ? (
                  <div
                    className="flex items-center justify-between gap-3 rounded-[10px] p-3"
                    style={{ background: "var(--red-bg)", border: "1px solid var(--border-hair)" }}
                  >
                    <span className="text-[0.78rem]" style={{ color: "var(--text-2)" }}>
                      Delete this task?
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingDelete(false)}
                        disabled={pending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => remove.mutate({ id: target.task.id })}
                        disabled={pending}
                        style={{ background: "var(--red-err)", color: "#fff" }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={pending}
                    className="w-fit gap-2"
                    style={{ color: "var(--red-err)" }}
                  >
                    <Trash2Icon className="size-3.5" />
                    Delete task
                  </Button>
                )}
              </div>
            )}
          </div>

          <SheetFooter
            className="flex-row items-center justify-end gap-2 border-t px-6 py-4"
            style={{ borderColor: "var(--border-hair)", marginTop: "auto" }}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending} className="min-w-[120px] gap-2">
              {pending ? (
                <>
                  <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
                  Saving…
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Add task"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
