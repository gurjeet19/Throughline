"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDownIcon, FolderIcon, SettingsIcon } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { useActiveProject } from "@/lib/active-project";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ALL = "__all__";

/**
 * Active-project switcher for the app shell. Picks which project the
 * feature-request views are scoped to ("All projects" clears the filter).
 * Reads the live project list — nothing hardcoded — and links through to the
 * Projects surface for create/rename. Collapses to just the folder icon when the
 * sidebar is in icon mode.
 */
export function ProjectSwitcher() {
  const trpc = useTRPC();
  const { activeProjectId, setActiveProjectId } = useActiveProject();
  const { data: projects } = useQuery(trpc.project.list.queryOptions());

  const active = projects?.find((p) => p.id === activeProjectId) ?? null;
  const label = active?.name ?? "All projects";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:opacity-90 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        style={{ background: "var(--surface)", border: "1px solid var(--border-hair)" }}
      >
        <FolderIcon className="size-4 shrink-0" style={{ color: "var(--oxblood)" }} />
        <span
          className="flex-1 truncate text-xs font-medium group-data-[collapsible=icon]:hidden"
          style={{ color: "var(--text-1)" }}
        >
          {label}
        </span>
        <ChevronsUpDownIcon
          className="size-3.5 shrink-0 group-data-[collapsible=icon]:hidden"
          style={{ color: "var(--text-3)" }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Active project</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={activeProjectId ?? ALL}
          onValueChange={(value) =>
            setActiveProjectId(value === ALL ? null : value)
          }
        >
          <DropdownMenuRadioItem value={ALL}>All projects</DropdownMenuRadioItem>
          {projects?.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id}>
              <span className="truncate">{p.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/dashboard/projects" />}>
          <SettingsIcon className="size-4" />
          Manage projects
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
