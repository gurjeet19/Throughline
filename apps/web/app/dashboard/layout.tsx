import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@throughline/api";
import { getWorkspaceById } from "@throughline/db";
import { AppSidebar } from "@/components/app/sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const workspaceId = session.session.activeOrganizationId;
  const workspace = workspaceId ? await getWorkspaceById(workspaceId) : null;
  const workspaceName = workspace?.name ?? "My Workspace";

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen overflow-hidden"
      style={
        {
          "--sidebar-width": "220px",
          "--sidebar-width-mobile": "260px",
        } as React.CSSProperties
      }
    >
      <AppSidebar userName={session.user.name} workspaceName={workspaceName} />
      <SidebarInset
        className="h-screen overflow-y-auto"
        style={{ background: "var(--bg)" }}
      >
        <main className="max-w-[860px] px-8 py-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
