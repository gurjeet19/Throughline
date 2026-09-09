import { NextResponse } from "next/server";
import { auth } from "@throughline/api";
import {
  getWorkspaceMemberRole,
  upsertGithubInstallation,
} from "@throughline/db";
import { getInstallationAccount } from "@throughline/github";

/**
 * GitHub App post-install callback (the App's "Setup URL"). After a workspace
 * admin installs the App, GitHub redirects here with the new `installation_id`
 * (and our `state`, the workspace id we bound at connect time). We confirm the
 * caller is an owner/admin of that workspace, prove the installation token
 * works with a real API call, then persist the link — tenant-scoped.
 *
 *   GET /api/github/callback?installation_id=123&setup_action=install&state=<workspaceId>
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const installationIdRaw = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");

  const settings = (params: string) =>
    NextResponse.redirect(new URL(`/dashboard/settings?${params}`, req.url));

  if (!installationIdRaw || Number.isNaN(Number(installationIdRaw))) {
    return settings("github=error&reason=missing_installation");
  }

  // Must be signed in. If not, bounce through sign-in and come right back here
  // (preserving the install params) so the link still gets persisted.
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    const back = encodeURIComponent(url.pathname + url.search);
    return NextResponse.redirect(new URL(`/sign-in?redirect=${back}`, req.url));
  }

  // Bind to the workspace from `state` when present, else the active one. The
  // caller must be an owner/admin of it — this is the cross-tenant guard.
  const workspaceId = state || session.session.activeOrganizationId;
  if (!workspaceId) {
    return settings("github=error&reason=no_workspace");
  }
  const role = await getWorkspaceMemberRole(workspaceId, session.user.id);
  if (role !== "owner" && role !== "admin") {
    return settings("github=error&reason=forbidden");
  }

  const installationId = Number(installationIdRaw);
  try {
    const account = await getInstallationAccount(installationId);
    await upsertGithubInstallation(workspaceId, {
      installationId: String(installationId),
      accountLogin: account.accountLogin,
      accountType: account.accountType,
    });
  } catch {
    return settings("github=error&reason=token_failed");
  }

  return settings("github=connected");
}
