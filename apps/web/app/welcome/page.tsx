"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Post-OAuth landing page. A workspace is created for new users by a Better
 * Auth after-hook that runs async, so a first Google login can land without an
 * active organization on the session. Ensure one is active here before sending
 * the user into the dashboard (mirrors the email sign-up flow's setActive).
 */
export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: session } = await authClient.getSession();
        if (!session) {
          if (!cancelled) router.replace("/sign-in");
          return;
        }
        if (!session.session.activeOrganizationId) {
          const { data: orgs } = await authClient.organization.list();
          if (orgs?.[0]) {
            await authClient.organization.setActive({
              organizationId: orgs[0].id,
            });
          }
        }
      } finally {
        if (!cancelled) router.replace("/dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main
      className="flex min-h-dvh items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      <div className="flex items-center gap-3" style={{ color: "var(--text-3)" }}>
        <span className="size-4 rounded-full border-2 border-current border-t-transparent spin-slow" />
        <span className="text-sm">Setting up your workspace…</span>
      </div>
    </main>
  );
}
