"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AuthShell, AuthHeader } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

type State =
  | { kind: "loading" }
  | { kind: "needs-auth" }
  | { kind: "accepting" }
  | { kind: "accepted" }
  | { kind: "error"; message: string };

/**
 * Invitation acceptance landing. An invite link points here with the
 * invitation id in the path. If the visitor isn't signed in we route them
 * through sign in / sign up (carrying a redirect back here); once signed in we
 * accept the invitation and make the newly joined workspace active, mirroring
 * the welcome / sign-up setActive pattern.
 */
export default function AcceptInvitationPage() {
  const router = useRouter();
  const params = useParams<{ invitationId: string }>();
  const invitationId = params.invitationId;
  const [state, setState] = useState<State>({ kind: "loading" });
  // The email of the currently signed-in account, shown if acceptance fails
  // because it doesn't match the invited address.
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  // React 19 runs effects twice in dev StrictMode; guard the one-shot accept.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const { data: session } = await authClient.getSession();
      if (!session) {
        setState({ kind: "needs-auth" });
        return;
      }
      setSignedInAs(session.user.email);

      setState({ kind: "accepting" });
      const { data, error } = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (error || !data) {
        setState({
          kind: "error",
          message:
            error?.message ??
            "This invitation is no longer valid. Ask for a new one.",
        });
        return;
      }

      // Make the joined workspace the active organization so the dashboard
      // opens on it (Better Auth doesn't switch the active org on accept).
      const organizationId =
        data.member?.organizationId ?? data.invitation?.organizationId;
      if (organizationId) {
        await authClient.organization.setActive({ organizationId });
      }

      setState({ kind: "accepted" });
      router.replace("/dashboard");
    })();
  }, [invitationId, router]);

  // Let someone who's signed in as the wrong account drop that session and
  // come back to the invite as the intended recipient.
  async function signOutAndSwitch() {
    setState({ kind: "loading" });
    await authClient.signOut();
    setSignedInAs(null);
    setState({ kind: "needs-auth" });
  }

  const redirectBack = `/accept-invitation/${invitationId}`;

  return (
    <AuthShell>
      {state.kind === "needs-auth" ? (
        <>
          <AuthHeader
            eyebrow="You're invited"
            title={
              <>
                Join a <em>workspace</em>
              </>
            }
            subtitle="Sign in or create an account to accept your invitation."
          />
          <div className="flex flex-col gap-3">
            <Button
              render={
                <Link
                  href={`/sign-in?redirect=${encodeURIComponent(redirectBack)}`}
                />
              }
              className="h-10 w-full"
            >
              Sign in to accept
            </Button>
            <Button
              variant="outline"
              render={
                <Link
                  href={`/sign-up?redirect=${encodeURIComponent(redirectBack)}`}
                />
              }
              className="h-10 w-full"
            >
              Create an account
            </Button>
          </div>
        </>
      ) : state.kind === "error" ? (
        <>
          <AuthHeader
            eyebrow="Invitation"
            title={
              <>
                Something <em>went wrong</em>
              </>
            }
            subtitle="We couldn't accept this invitation."
          />
          <div
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-[0.8rem]"
            style={{ background: "var(--red-bg)", color: "var(--red-err)" }}
          >
            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>{state.message}</span>
          </div>
          {signedInAs && /recipient/i.test(state.message) && (
            <p
              className="mt-3 text-[0.8rem] leading-relaxed"
              style={{ color: "var(--text-2)" }}
            >
              You&apos;re signed in as{" "}
              <span style={{ color: "var(--text-1)", fontWeight: 600 }}>
                {signedInAs}
              </span>
              . This invitation was sent to a different address — sign out and
              continue with the invited account.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-3">
            {signedInAs && /recipient/i.test(state.message) && (
              <Button onClick={signOutAndSwitch} className="h-10 w-full">
                Sign out & use another account
              </Button>
            )}
            <Button
              render={<Link href="/dashboard" />}
              variant="outline"
              className="h-10 w-full"
            >
              Go to dashboard
            </Button>
          </div>
        </>
      ) : state.kind === "accepted" ? (
        <Status
          icon={<CheckCircle2Icon className="size-4" style={{ color: "var(--green)" }} />}
          label="Joined — taking you in…"
        />
      ) : (
        <Status
          icon={
            <span className="size-4 rounded-full border-2 border-current border-t-transparent spin-slow" />
          }
          label={
            state.kind === "accepting"
              ? "Accepting your invitation…"
              : "Checking your invitation…"
          }
        />
      )}
    </AuthShell>
  );
}

function Status({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className="flex items-center justify-center gap-3"
      style={{ color: "var(--text-3)" }}
    >
      {icon}
      <span className="text-sm">{label}</span>
    </div>
  );
}
