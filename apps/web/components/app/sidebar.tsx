"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  InboxIcon,
  FileTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  LogOutIcon,
  KanbanIcon,
  RocketIcon,
  CreditCardIcon,
  FolderKanbanIcon,
} from "lucide-react";
import { ProjectSwitcher } from "./project-switcher";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// The nav reads top-to-bottom as the throughline pipeline: a request becomes a
// spec, a plan, then code that's reviewed and shipped.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Pipeline",
    items: [
      { label: "Projects", href: "/dashboard/projects", icon: FolderKanbanIcon },
      { label: "Requests", href: "/dashboard/requests", icon: InboxIcon },
      { label: "PRDs", href: "/dashboard/prds", icon: FileTextIcon },
      { label: "Plan", href: "/dashboard/plans", icon: KanbanIcon },
      { label: "Reviews", href: "/dashboard/reviews", icon: ShieldCheckIcon },
      { label: "Releases", href: "/dashboard/releases", icon: RocketIcon },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Billing", href: "/dashboard/billing", icon: CreditCardIcon },
      { label: "Settings", href: "/dashboard/settings", icon: SettingsIcon },
    ],
  },
];

type AppSidebarProps = {
  userName: string;
  workspaceName: string;
};

export function AppSidebar({ userName, workspaceName }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const workspaceInitial = workspaceName.charAt(0).toUpperCase();
  const userInitial = userName.charAt(0).toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await authClient.signOut();
    if (error) {
      setSigningOut(false);
      toast.error("Couldn't sign out", { description: error.message });
      return;
    }
    router.push("/sign-in");
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo header + collapse toggle */}
      <SidebarHeader className="h-14 flex-row items-center justify-between px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <Link
          href="/dashboard/requests"
          className="flex items-center gap-0 group-data-[collapsible=icon]:hidden"
        >
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: "var(--text-1)" }}
          >
            Through
          </span>
          <span
            className="text-sm"
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              color: "var(--peach-bright)",
              fontWeight: 400,
            }}
          >
            line
          </span>
        </Link>
        <SidebarTrigger style={{ color: "var(--text-3)" }} />
      </SidebarHeader>

      <Separator />

      {/* Workspace chip */}
      <div className="px-3 py-3 group-data-[collapsible=icon]:px-1.5">
        <div
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          style={{ background: "var(--muted)" }}
        >
          <div
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-[0.65rem] font-semibold"
            style={{
              background: "var(--peach-pale)",
              color: "var(--oxblood)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {workspaceInitial}
          </div>
          <span
            className="truncate text-xs font-medium group-data-[collapsible=icon]:hidden"
            style={{ color: "var(--text-1)" }}
          >
            {workspaceName}
          </span>
        </div>
        <div className="mt-2">
          <ProjectSwitcher />
        </div>
      </div>

      {/* Nav */}
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="eyebrow px-2.5 py-0 mb-1">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        render={<Link href={item.href} />}
                        tooltip={item.label}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* User footer */}
      <SidebarFooter>
        <Separator className="mb-2" />
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1.5 group-data-[collapsible=icon]:px-0">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            style={{
              background: "var(--oxblood-pale)",
              color: "var(--oxblood)",
              border: "1.5px solid var(--peach-light)",
            }}
          >
            {userInitial}
          </div>
          <span
            className="truncate text-xs font-medium group-data-[collapsible=icon]:hidden"
            style={{ color: "var(--text-2)" }}
          >
            {userName}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            title="Sign out"
            aria-label="Sign out"
            className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:opacity-80 disabled:opacity-50 group-data-[collapsible=icon]:ml-0"
            style={{ color: "var(--text-3)" }}
          >
            {signingOut ? (
              <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
            ) : (
              <LogOutIcon className="size-4" />
            )}
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
