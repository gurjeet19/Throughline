"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type ProjectInit = { id: string; name: string; description: string | null };

/**
 * Create or rename a project. One dialog covers both: pass an existing
 * `project` to rename (slug stays stable), or omit it to create. The form is
 * mounted only while open and keyed on the project, so its fields initialise
 * straight from props — no effect syncing.
 */
export function ProjectFormDialog({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project?: ProjectInit;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        {open && (
          <ProjectForm
            key={project?.id ?? "new"}
            project={project}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({
  project,
  onClose,
}: {
  project?: ProjectInit;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isEdit = Boolean(project);

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: trpc.project.list.queryKey() });
    queryClient.invalidateQueries({
      queryKey: trpc.project.listWithRollup.queryKey(),
    });
    if (project) {
      queryClient.invalidateQueries({
        queryKey: trpc.project.get.queryKey({ id: project.id }),
      });
    }
  }

  const createMutation = useMutation(
    trpc.project.create.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Project created");
        onClose();
      },
      onError: (err) =>
        toast.error("Couldn't create project", { description: err.message }),
    }),
  );

  const renameMutation = useMutation(
    trpc.project.rename.mutationOptions({
      onSuccess: () => {
        invalidate();
        toast.success("Project updated");
        onClose();
      },
      onError: (err) =>
        toast.error("Couldn't update project", { description: err.message }),
    }),
  );

  const busy = createMutation.isPending || renameMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const desc = description.trim() || undefined;
    if (project) {
      renameMutation.mutate({ id: project.id, name: trimmed, description: desc });
    } else {
      createMutation.mutate({ name: trimmed, description: desc });
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Rename project" : "New project"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update the name or description. The project's link stays the same."
            : "Group related feature requests under a project."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor="project-name" className="eyebrow">
            Name
          </label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mobile app"
            maxLength={80}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="project-desc" className="eyebrow">
            Description <span style={{ color: "var(--text-3)" }}>(optional)</span>
          </label>
          <Textarea
            id="project-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this project is for."
            maxLength={500}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
