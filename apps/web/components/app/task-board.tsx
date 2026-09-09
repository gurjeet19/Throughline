"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeftIcon,
  GripVerticalIcon,
  LinkIcon,
  ListChecksIcon,
  LockIcon,
  Maximize2Icon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { StatusBadge } from "./status-badge";
import { TaskEditorSheet, type EditorTarget } from "./task-editor-sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  orderIndex: number;
  seq: number;
  kind: string;
  dependsOn: string[];
  requirementRefs: string[];
};

/** Map a task's dependsOn ids to the blocker tasks' display numbers, sorted. */
function blockerNums(
  dependsOn: string[],
  seqById: Map<string, number>,
): number[] {
  return dependsOn
    .map((id) => seqById.get(id))
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);
}

/** Render a list of blocker numbers as "#2, #3". */
function blockedByLabel(nums: number[]): string {
  return nums.map((n) => `#${n}`).join(", ");
}

type ColumnId = "todo" | "in-progress" | "done";

const COLUMNS: { id: ColumnId; label: string; dot: string }[] = [
  { id: "todo", label: "To do", dot: "var(--amber)" },
  { id: "in-progress", label: "In progress", dot: "var(--blue)" },
  { id: "done", label: "Done", dot: "var(--green)" },
];

type Board = Record<ColumnId, TaskRow[]>;

function emptyBoard(): Board {
  return { todo: [], "in-progress": [], done: [] };
}

function groupTasks(tasks: TaskRow[]): Board {
  const board = emptyBoard();
  for (const t of tasks) {
    const col = (COLUMNS.find((c) => c.id === t.status)?.id ?? "todo") as ColumnId;
    board[col].push(t);
  }
  return board;
}

/** Stable fingerprint of server state, to know when to re-sync local columns. */
function signature(tasks: TaskRow[]): string {
  return tasks
    .map((t) => `${t.id}:${t.status}:${t.orderIndex}`)
    .sort()
    .join("|");
}

function titleOf(raw: string): string {
  const sep = raw.indexOf("\n\n");
  const title = (sep === -1 ? raw : raw.slice(0, sep)).trim();
  return title || "Untitled request";
}

export function TaskBoard({ requestId }: { requestId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: request } = useQuery(
    trpc.featureRequest.getById.queryOptions({ id: requestId }),
  );

  // The PRD id is needed to create new tasks (and to invalidate the request
  // page's plan preview, which is keyed by PRD).
  const { data: prd } = useQuery(
    trpc.prd.getForRequest.queryOptions({ featureRequestId: requestId }),
  );
  const prdId = prd?.id ?? null;

  const { data: tasks, isLoading } = useQuery({
    ...trpc.task.list.queryOptions({ featureRequestId: requestId }),
    // Keep polling while the generation workflow hasn't produced tasks yet.
    refetchInterval: (q) =>
      q.state.data && q.state.data.length > 0 ? false : 2500,
  });

  const serverTasks = useMemo(() => (tasks ?? []) as TaskRow[], [tasks]);
  const serverById = useMemo(
    () => new Map(serverTasks.map((t) => [t.id, t])),
    [serverTasks],
  );
  // Task id → its display number, for resolving "blocked by" dependencies.
  const seqById = useMemo(
    () => new Map(serverTasks.map((t) => [t.id, t.seq])),
    [serverTasks],
  );

  const [board, setBoard] = useState<Board>(emptyBoard);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [detail, setDetail] = useState<TaskRow | null>(null);
  const lastSig = useRef<string>("");

  // Re-sync local board from the server whenever the persisted state changes
  // and we are not mid-drag (so an in-flight gesture is never yanked).
  useEffect(() => {
    if (activeId) return;
    const sig = signature(serverTasks);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    setBoard(groupTasks(serverTasks));
  }, [serverTasks, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function invalidateTasks() {
    queryClient.invalidateQueries({
      queryKey: trpc.task.list.queryKey({ featureRequestId: requestId }),
    });
    if (prdId) {
      queryClient.invalidateQueries({
        queryKey: trpc.task.list.queryKey({ prdId }),
      });
    }
  }

  const reorder = useMutation(
    trpc.task.reorder.mutationOptions({
      onError: (err) => {
        toast.error("Couldn't save the board", { description: err.message });
        invalidateTasks(); // reconcile back to server truth
      },
      onSettled: () => invalidateTasks(),
    }),
  );

  function findColumn(id: string): ColumnId | null {
    if (id in board) return id as ColumnId;
    const found = COLUMNS.find((c) => board[c.id].some((t) => t.id === id));
    return found?.id ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeCol = findColumn(String(active.id));
    const overCol = findColumn(String(over.id));
    if (!activeCol || !overCol || activeCol === overCol) return;

    setBoard((prev) => {
      const activeItems = prev[activeCol];
      const overItems = prev[overCol];
      const moved = activeItems.find((t) => t.id === active.id);
      if (!moved) return prev;
      const overIndex = overItems.findIndex((t) => t.id === over.id);
      // Dropping onto the column shell (id is a column) appends to the end.
      const insertAt =
        String(over.id) in prev
          ? overItems.length
          : overIndex >= 0
            ? overIndex
            : overItems.length;
      return {
        ...prev,
        [activeCol]: activeItems.filter((t) => t.id !== active.id),
        [overCol]: [
          ...overItems.slice(0, insertAt),
          moved,
          ...overItems.slice(insertAt),
        ],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const overCol = findColumn(String(over.id));
    if (!overCol) return;

    // Settle the destination column's order for a smooth landing.
    let next = board;
    const items = board[overCol];
    const oldIndex = items.findIndex((t) => t.id === active.id);
    const newIndex = items.findIndex((t) => t.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      next = { ...board, [overCol]: arrayMove(items, oldIndex, newIndex) };
      setBoard(next);
    }

    // Persist every task whose column or position changed from server truth.
    const changed: { id: string; status: ColumnId; orderIndex: number }[] = [];
    for (const col of COLUMNS) {
      next[col.id].forEach((t, i) => {
        const server = serverById.get(t.id);
        if (!server || server.status !== col.id || server.orderIndex !== i) {
          changed.push({ id: t.id, status: col.id, orderIndex: i });
        }
      });
    }
    if (changed.length > 0) reorder.mutate({ tasks: changed });
  }

  const activeTask = activeId
    ? COLUMNS.flatMap((c) => board[c.id]).find((t) => t.id === activeId)
    : null;

  const totalTasks = serverTasks.length;
  // Once the plan is approved it is locked: no add / edit / reorder. It stays
  // locked through development and review — the board is the committed plan, not
  // a live progress tracker (that lives on the feature's Development tab). The
  // fix loop (`fix-needed`, `changes-requested`) reopens it so fix tasks can be
  // worked, and shipping re-locks it permanently as a record of completed work.
  const locked =
    request?.status === "plan-approved" ||
    request?.status === "in-development" ||
    request?.status === "in-review" ||
    request?.status === "shipped";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/dashboard/requests/${requestId}`}
        className="inline-flex w-fit items-center gap-1.5 text-[0.8rem] transition-colors"
        style={{ color: "var(--text-3)" }}
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to request
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <p className="eyebrow">Task board</p>
          {request && <StatusBadge status={request.status} />}
        </div>
        <h1 className="h-section">
          {request ? titleOf(request.rawContent) : "Task board"}
        </h1>
        <p
          className="max-w-[480px] text-sm leading-relaxed"
          style={{ color: "var(--text-2)" }}
        >
          {locked
            ? "This plan is approved and locked. The board is read-only — a record of what the team committed to build."
            : "Drag a task between columns to move it through development. Order follows the plan; dependencies are shown on each card."}
        </p>
      </header>

      {locked && totalTasks > 0 && (
        <div
          className="flex items-center gap-2.5 rounded-[10px] px-4 py-2.5"
          style={{ background: "var(--green-bg)", border: "1px solid var(--border-hair)" }}
        >
          <LockIcon className="size-3.5 shrink-0" style={{ color: "var(--green)" }} />
          <span className="text-[0.78rem]" style={{ color: "var(--text-2)" }}>
            Plan approved — editing is locked.
          </span>
        </div>
      )}

      {isLoading || totalTasks === 0 ? (
        <BoardPlaceholder loading={isLoading || totalTasks === 0} />
      ) : locked ? (
        <LockedBoard board={board} seqById={seqById} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="grid grid-cols-3 gap-3">
            {COLUMNS.map((col) => (
              <Column
                key={col.id}
                id={col.id}
                label={col.label}
                dot={col.dot}
                tasks={board[col.id]}
                activeId={activeId}
                seqById={seqById}
                canAdd={!!prdId}
                onAdd={() =>
                  setEditor({
                    mode: "create",
                    status: col.id,
                    columnLabel: col.label,
                  })
                }
                onEdit={(task) =>
                  setEditor({
                    mode: "edit",
                    status: col.id,
                    task: {
                      id: task.id,
                      title: task.title,
                      description: task.description,
                    },
                  })
                }
                onView={(task) => setDetail(task)}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTask ? (
              <TaskCard task={activeTask} overlay seqById={seqById} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Full read-only task view for the unlocked board — the same dialog the
          locked board uses, so a planner can read everything a card truncates
          before the plan is approved. */}
      <TaskDetailDialog
        task={detail}
        seqById={seqById}
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />

      {editor && prdId && (
        <TaskEditorSheet
          key={
            editor.mode === "edit"
              ? `edit-${editor.task.id}`
              : `create-${editor.status}`
          }
          open
          onOpenChange={(next) => {
            if (!next) setEditor(null);
          }}
          target={editor}
          prdId={prdId}
          requestId={requestId}
        />
      )}
    </div>
  );
}

function Column({
  id,
  label,
  dot,
  tasks,
  activeId,
  seqById,
  canAdd,
  onAdd,
  onEdit,
  onView,
}: {
  id: ColumnId;
  label: string;
  dot: string;
  tasks: TaskRow[];
  activeId: string | null;
  seqById: Map<string, number>;
  canAdd: boolean;
  onAdd: () => void;
  onEdit: (task: TaskRow) => void;
  onView: (task: TaskRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className="flex max-h-[calc(100vh-260px)] min-h-[140px] flex-col rounded-[10px] transition-colors"
      style={{
        background: isOver ? "var(--peach-pale)" : "var(--surface)",
        border: `1px solid ${isOver ? "var(--peach-light)" : "var(--border-hair)"}`,
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3.5 pb-2.5 pt-3"
        style={{ borderBottom: "1px solid var(--border-hair)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="size-1.5 rounded-full"
            style={{ background: dot }}
          />
          <span
            className="text-[0.68rem] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-2)", letterSpacing: "0.1em" }}
          >
            {label}
          </span>
          <span
            className="text-[0.72rem] tabular-nums"
            style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
          >
            {tasks.length}
          </span>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Add task to ${label}`}
            className="grid size-6 place-items-center rounded-[6px] transition-colors"
            style={{ color: "var(--text-3)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--muted)";
              e.currentTarget.style.color = "var(--oxblood)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-3)";
            }}
          >
            <PlusIcon className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              seqById={seqById}
              dimmed={activeId === task.id}
              onEdit={() => onEdit(task)}
              onView={() => onView(task)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div
            className="flex flex-1 items-center justify-center rounded-[8px] px-3 py-8 text-center text-[0.72rem]"
            style={{
              border: "1px dashed var(--border-hair)",
              color: "var(--text-3)",
            }}
          >
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Read-only board shown once the plan is approved — no dnd, no editing. Cards
 * are still clickable: a click opens the full task detail in a dialog, so a
 * reviewer can read everything the locked card truncates.
 */
function LockedBoard({
  board,
  seqById,
}: {
  board: Board;
  seqById: Map<string, number>;
}) {
  const [detail, setDetail] = useState<TaskRow | null>(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            className="flex max-h-[calc(100vh-260px)] min-h-[140px] flex-col rounded-[10px]"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-hair)",
            }}
          >
            <div
              className="flex items-center gap-2 px-3.5 pb-2.5 pt-3"
              style={{ borderBottom: "1px solid var(--border-hair)" }}
            >
              <span className="size-1.5 rounded-full" style={{ background: col.dot }} />
              <span
                className="text-[0.68rem] font-semibold uppercase"
                style={{ color: "var(--text-2)", letterSpacing: "0.1em" }}
              >
                {col.label}
              </span>
              <span
                className="text-[0.72rem] tabular-nums"
                style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
              >
                {board[col.id].length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
              {board[col.id].map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  seqById={seqById}
                  readOnly
                  onView={() => setDetail(task)}
                />
              ))}
              {board[col.id].length === 0 && (
                <div
                  className="flex flex-1 items-center justify-center rounded-[8px] px-3 py-8 text-center text-[0.72rem]"
                  style={{ border: "1px dashed var(--border-hair)", color: "var(--text-3)" }}
                >
                  Empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <TaskDetailDialog
        task={detail}
        seqById={seqById}
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
    </>
  );
}

/** Full, read-only view of a task — for the locked board where cards truncate. */
function TaskDetailDialog({
  task,
  seqById,
  open,
  onOpenChange,
}: {
  task: TaskRow | null;
  seqById: Map<string, number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const col = COLUMNS.find((c) => c.id === task?.status);
  const blockers = task ? blockerNums(task.dependsOn, seqById) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {task && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: col?.dot ?? "var(--text-3)" }}
                />
                <span
                  className="text-[0.66rem] font-semibold uppercase"
                  style={{ color: "var(--text-3)", letterSpacing: "0.1em" }}
                >
                  {col?.label ?? task.status}
                </span>
              </div>
              <DialogTitle className="pr-8 leading-snug">
                <span
                  className="mr-1.5"
                  style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
                >
                  #{task.seq}
                </span>
                {task.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Full details for this task.
              </DialogDescription>
            </DialogHeader>

            {task.description && (
              <p
                className="text-[0.85rem] leading-relaxed whitespace-pre-wrap"
                style={{ color: "var(--text-2)" }}
              >
                {task.description}
              </p>
            )}

            {task.requirementRefs.length > 0 && (
              <section className="flex flex-col gap-2">
                <p className="eyebrow">Satisfies</p>
                <ul className="flex flex-col gap-1.5">
                  {task.requirementRefs.map((ref, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[0.82rem] leading-relaxed"
                      style={{ color: "var(--text-2)" }}
                    >
                      <ListChecksIcon
                        className="mt-0.5 size-3.5 shrink-0"
                        style={{ color: "var(--text-3)" }}
                      />
                      <span>{ref}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {blockers.length > 0 && (
              <span
                className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5"
                style={{
                  background: "var(--amber-bg)",
                  color: "var(--amber)",
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                <LinkIcon className="size-3" />
                Blocked by {blockedByLabel(blockers)}
              </span>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SortableTaskCard({
  task,
  seqById,
  dimmed,
  onEdit,
  onView,
}: {
  task: TaskRow;
  seqById: Map<string, number>;
  dimmed: boolean;
  onEdit: () => void;
  onView: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: dimmed ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} seqById={seqById} onEdit={onEdit} onView={onView} />
    </div>
  );
}

/** Presentational card — shared by the sortable items and the drag overlay. */
function TaskCard({
  task,
  seqById,
  overlay,
  onEdit,
  onView,
  readOnly,
}: {
  task: TaskRow;
  seqById: Map<string, number>;
  overlay?: boolean;
  onEdit?: () => void;
  onView?: () => void;
  readOnly?: boolean;
}) {
  // Locked cards open on a whole-card click; draggable cards expose a dedicated
  // expand button instead, so opening the detail never fights the drag gesture.
  const clickable = !!onView && !overlay && readOnly;
  const blockers = blockerNums(task.dependsOn, seqById);

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onView : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onView!();
              }
            }
          : undefined
      }
      className={cn(
        "group flex flex-col gap-2 rounded-[8px] p-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        clickable
          ? "cursor-pointer"
          : readOnly
            ? "cursor-default"
            : "cursor-grab active:cursor-grabbing",
      )}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-hair)",
        boxShadow: overlay ? "var(--shadow-lg)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!overlay) e.currentTarget.style.borderColor = "var(--peach-light)";
      }}
      onMouseLeave={(e) => {
        if (!overlay) e.currentTarget.style.borderColor = "var(--border-hair)";
      }}
    >
      <div className="flex items-start gap-1.5">
        <GripVerticalIcon
          className={cn(
            "mt-0.5 size-3.5 shrink-0 transition-opacity",
            readOnly ? "opacity-0" : "opacity-0 group-hover:opacity-100",
          )}
          style={{ color: "var(--text-3)" }}
        />
        <span
          className="mt-px shrink-0 text-[0.72rem] tabular-nums"
          style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
        >
          #{task.seq}
        </span>
        <h4
          className="flex-1 text-[0.82rem] font-medium leading-snug"
          style={{ color: "var(--text-1)" }}
        >
          {task.kind === "fix" && (
            <span
              className="mr-1.5 inline-flex items-center rounded-[3px] px-1 py-0.5 align-middle"
              style={{
                background: "var(--red-bg)",
                color: "var(--red-err)",
                fontSize: "0.56rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Fix
            </span>
          )}
          {task.title}
        </h4>
        {onEdit && (
          <button
            type="button"
            aria-label="Edit task"
            // Stop the pointer reaching the drag sensor so a click edits
            // instead of starting a drag.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="grid size-5 shrink-0 place-items-center rounded-[5px] opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: "var(--text-3)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--oxblood)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
          >
            <PencilIcon className="size-3" />
          </button>
        )}
        {onView && !readOnly && (
          <button
            type="button"
            aria-label="View task details"
            // Stop the pointer reaching the drag sensor so a click opens the
            // detail dialog instead of starting a drag.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="grid size-5 shrink-0 place-items-center rounded-[5px] opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: "var(--text-3)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--oxblood)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
          >
            <Maximize2Icon className="size-3" />
          </button>
        )}
        {clickable && (
          <Maximize2Icon
            aria-hidden
            className="mt-0.5 size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: "var(--text-3)" }}
          />
        )}
      </div>

      {task.description && (
        <p
          className="line-clamp-3 pl-5 text-[0.76rem] leading-relaxed"
          style={{ color: "var(--text-2)" }}
        >
          {task.description}
        </p>
      )}

      {blockers.length > 0 && (
        <div className="pl-5">
          <span
            className="inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5"
            style={{
              background: "var(--amber-bg)",
              color: "var(--amber)",
              fontSize: "0.6rem",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <LinkIcon className="size-2.5" />
            Blocked by {blockedByLabel(blockers)}
          </span>
        </div>
      )}
    </div>
  );
}

function BoardPlaceholder({ loading }: { loading: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {COLUMNS.map((col) => (
        <div
          key={col.id}
          className="flex min-h-[200px] flex-col rounded-[10px]"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-hair)",
          }}
        >
          <div
            className="flex items-center gap-2 px-3.5 pb-2.5 pt-3"
            style={{ borderBottom: "1px solid var(--border-hair)" }}
          >
            <span className="size-1.5 rounded-full" style={{ background: col.dot }} />
            <span
              className="text-[0.68rem] font-semibold uppercase"
              style={{ color: "var(--text-2)", letterSpacing: "0.1em" }}
            >
              {col.label}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            {loading && col.id === "todo" ? (
              <span
                className="inline-flex items-center gap-2 text-[0.76rem]"
                style={{ color: "var(--text-2)" }}
              >
                <span
                  className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow"
                  style={{ color: "var(--peach)" }}
                />
                Generating tasks…
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
