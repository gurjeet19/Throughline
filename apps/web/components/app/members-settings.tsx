"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  CopyIcon,
  MailIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type Role = "owner" | "admin" | "member";
const ROLES: Role[] = ["owner", "admin", "member"];

/**
 * Unwrap a Better Auth client response, throwing on error so React Query
 * routes it into the query/mutation error state.
 */
function unwrap<T>(res: { data: T; error: { message?: string } | null }): T {
  if (res.error) throw new Error(res.error.message ?? "Something went wrong");
  return res.data;
}

export function MembersSettings() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  // The active workspace's members, pending invitations, and the current
  // user's own membership (for role gating). All scoped server-side by Better
  // Auth to the active organization — no workspace can read another's.
  const membersQuery = useQuery({
    queryKey: ["org", "members"],
    queryFn: () => authClient.organization.listMembers().then(unwrap),
  });
  const invitationsQuery = useQuery({
    queryKey: ["org", "invitations"],
    queryFn: () => authClient.organization.listInvitations().then(unwrap),
  });
  const activeMemberQuery = useQuery({
    queryKey: ["org", "active-member"],
    queryFn: () => authClient.organization.getActiveMember().then(unwrap),
  });

  const myRole = activeMemberQuery.data?.role as Role | undefined;
  const canManage = myRole === "owner" || myRole === "admin";

  function invalidateMembers() {
    queryClient.invalidateQueries({ queryKey: ["org", "members"] });
  }
  function invalidateInvites() {
    queryClient.invalidateQueries({ queryKey: ["org", "invitations"] });
  }

  const invite = useMutation({
    mutationFn: (vars: { email: string; role: Role }) =>
      authClient.organization
        .inviteMember({ email: vars.email, role: vars.role })
        .then(unwrap),
    onSuccess: () => {
      setEmail("");
      setRole("member");
      invalidateInvites();
      toast.success("Invitation sent", {
        description: "Copy the invite link below to share it.",
      });
    },
    onError: (err) =>
      toast.error("Couldn't invite", { description: err.message }),
  });

  const cancelInvite = useMutation({
    mutationFn: (invitationId: string) =>
      authClient.organization.cancelInvitation({ invitationId }).then(unwrap),
    onSuccess: () => {
      invalidateInvites();
      toast.success("Invitation revoked");
    },
    onError: (err) =>
      toast.error("Couldn't revoke", { description: err.message }),
  });

  const changeRole = useMutation({
    mutationFn: (vars: { memberId: string; role: Role }) =>
      authClient.organization
        .updateMemberRole({ memberId: vars.memberId, role: vars.role })
        .then(unwrap),
    onSuccess: () => {
      invalidateMembers();
      toast.success("Role updated");
    },
    onError: (err) =>
      toast.error("Couldn't update role", { description: err.message }),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      authClient.organization
        .removeMember({ memberIdOrEmail: memberId })
        .then(unwrap),
    onSuccess: () => {
      invalidateMembers();
      toast.success("Member removed");
    },
    onError: (err) =>
      toast.error("Couldn't remove member", { description: err.message }),
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    invite.mutate({ email: trimmed, role });
  }

  const members = membersQuery.data?.members ?? [];
  const pending =
    invitationsQuery.data?.filter((inv) => inv.status === "pending") ?? [];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="h-section">Members</h1>
        <p className="text-sm max-w-prose" style={{ color: "var(--text-2)" }}>
          Everyone here shares this workspace — its requests, PRDs, and plans.
          {canManage
            ? " Invite teammates by email and manage their roles below."
            : " Only an owner or admin can invite or manage members."}
        </p>
      </div>

      <Separator />

      {/* Invite form — owner/admin only. The server enforces this too. */}
      {canManage && (
        <form onSubmit={handleInvite} className="flex flex-col gap-2">
          <label className="eyebrow">Invite a teammate</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <MailIcon
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                style={{ color: "var(--text-3)" }}
              />
              <Input
                type="email"
                required
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={invite.isPending}
                className="h-9 pl-9 text-sm"
              />
            </div>
            <RoleSelect
              value={role}
              onChange={setRole}
              disabled={invite.isPending}
            />
            <Button
              type="submit"
              size="sm"
              disabled={invite.isPending || !email.trim()}
              className="h-9"
            >
              {invite.isPending ? (
                <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
              ) : (
                "Send invite"
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Current members */}
      <div className="flex flex-col gap-2">
        <label className="eyebrow">
          Members{members.length ? ` · ${members.length}` : ""}
        </label>
        {membersQuery.isLoading ? (
          <RowSkeleton />
        ) : (
          <ul
            className="flex flex-col rounded-lg"
            style={{ border: "1px solid var(--border-hair)" }}
          >
            {members.map((m, i) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-3 py-2.5"
                style={
                  i > 0
                    ? { borderTop: "1px solid var(--border-hair)" }
                    : undefined
                }
              >
                <Avatar name={m.user.name || m.user.email} />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-medium"
                    style={{ color: "var(--text-1)" }}
                  >
                    {m.user.name || m.user.email}
                    {activeMemberQuery.data?.id === m.id && (
                      <span style={{ color: "var(--text-3)" }}> (you)</span>
                    )}
                  </div>
                  <div
                    className="truncate text-[0.75rem]"
                    style={{ color: "var(--text-3)" }}
                  >
                    {m.user.email}
                  </div>
                </div>
                {canManage &&
                m.role !== "owner" &&
                activeMemberQuery.data?.id !== m.id ? (
                  <RoleSelect
                    value={m.role as Role}
                    onChange={(r) =>
                      changeRole.mutate({ memberId: m.id, role: r })
                    }
                    disabled={changeRole.isPending}
                    compact
                  />
                ) : (
                  <RoleBadge role={m.role as Role} />
                )}
                {canManage &&
                  m.role !== "owner" &&
                  activeMemberQuery.data?.id !== m.id && (
                    <button
                      type="button"
                      onClick={() => removeMember.mutate(m.id)}
                      disabled={removeMember.isPending}
                      title="Remove member"
                      aria-label={`Remove ${m.user.name || m.user.email}`}
                      className="shrink-0 transition-colors hover:opacity-80 disabled:opacity-50"
                      style={{ color: "var(--text-3)" }}
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pending invitations */}
      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="eyebrow">Pending invitations · {pending.length}</label>
          <ul
            className="flex flex-col rounded-lg"
            style={{ border: "1px solid var(--border-hair)" }}
          >
            {pending.map((inv, i) => (
              <li
                key={inv.id}
                className="flex items-center gap-3 px-3 py-2.5"
                style={
                  i > 0
                    ? { borderTop: "1px solid var(--border-hair)" }
                    : undefined
                }
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-medium"
                    style={{ color: "var(--text-1)" }}
                  >
                    {inv.email}
                  </div>
                  <div
                    className="truncate text-[0.75rem]"
                    style={{ color: "var(--text-3)" }}
                  >
                    Invited as {inv.role ?? "member"}
                  </div>
                </div>
                <CopyInviteLink invitationId={inv.id} />
                {canManage && (
                  <button
                    type="button"
                    onClick={() => cancelInvite.mutate(inv.id)}
                    disabled={cancelInvite.isPending}
                    title="Revoke invitation"
                    aria-label={`Revoke invitation for ${inv.email}`}
                    className="shrink-0 transition-colors hover:opacity-80 disabled:opacity-50"
                    style={{ color: "var(--text-3)" }}
                  >
                    <XIcon className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RoleSelect({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Role)}
      disabled={disabled}
      className={`rounded-md text-sm capitalize outline-none disabled:opacity-50 ${
        compact ? "h-8 px-2 text-[0.78rem]" : "h-9 px-3"
      }`}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-hair)",
        color: "var(--text-1)",
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide"
      style={{
        background: role === "owner" ? "var(--oxblood-pale)" : "var(--muted)",
        color: role === "owner" ? "var(--oxblood)" : "var(--text-2)",
      }}
    >
      {role}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{
        background: "var(--oxblood-pale)",
        color: "var(--oxblood)",
        border: "1.5px solid var(--peach-light)",
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function CopyInviteLink({ invitationId }: { invitationId: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    navigator.clipboard
      .writeText(`${origin}/accept-invitation/${invitationId}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy invite link"
      aria-label="Copy invite link"
      className="shrink-0 transition-colors hover:opacity-80"
      style={{ color: copied ? "var(--green)" : "var(--text-3)" }}
    >
      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
    </button>
  );
}

function RowSkeleton() {
  return (
    <div
      className="flex flex-col rounded-lg"
      style={{ border: "1px solid var(--border-hair)" }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 py-2.5"
          style={i > 0 ? { borderTop: "1px solid var(--border-hair)" } : undefined}
        >
          <div
            className="size-8 shrink-0 rounded-full"
            style={{ background: "var(--muted)" }}
          />
          <div className="flex flex-1 flex-col gap-1.5">
            <div
              className="h-3 w-32 rounded"
              style={{ background: "var(--muted)" }}
            />
            <div
              className="h-2.5 w-44 rounded"
              style={{ background: "var(--muted)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
