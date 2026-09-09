"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircleIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AuthShell, AuthHeader, AuthDivider } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // An invite redirect to carry through the Google round-trip, the sign-in
  // link, and the post-signup push. Read after mount to avoid a hydration
  // mismatch.
  const [redirect, setRedirect] = useState<string | null>(null);

  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("redirect");
    // Read post-mount (not during render) so the redirect-bearing link and
    // Google callback don't differ between server and client HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (target && target.startsWith("/")) setRedirect(target);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signUpError } = await authClient.signUp.email({ name, email, password });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message ?? "Could not sign up.");
      return;
    }

    // The workspace created for this user (databaseHooks.user.create.after)
    // is queued to run after the user's own transaction, so it isn't
    // guaranteed to exist yet when the session for this signup was created.
    // Activate it explicitly now that signUp has resolved.
    const { data: organizations } = await authClient.organization.list();
    if (organizations?.[0]) {
      await authClient.organization.setActive({ organizationId: organizations[0].id });
    }

    setLoading(false);
    router.push(redirect ?? "/dashboard");
  }

  return (
    <AuthShell>
      <AuthHeader
        eyebrow="Get started"
        title={
          <>
            Create your <em>workspace</em>
          </>
        }
        subtitle="Spin up a workspace in seconds — no credit card required."
      />

      <GoogleButton
        label="Sign up with Google"
        callbackURL={redirect ?? "/welcome"}
      />
      <AuthDivider label="or" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            className="h-10 text-sm"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="h-10 text-sm"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            minLength={8}
            required
          />
          <p className="text-[0.7rem]" style={{ color: "var(--text-3)" }}>
            Use at least 8 characters.
          </p>
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-[0.8rem]"
            style={{ background: "var(--red-bg)", color: "var(--red-err)" }}
          >
            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" disabled={loading} className="mt-1 h-10 w-full gap-2">
          {loading ? (
            <>
              <span className="size-3.5 rounded-full border-2 border-current border-t-transparent spin-slow" />
              Creating…
            </>
          ) : (
            "Create workspace"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-[0.8rem]" style={{ color: "var(--text-3)" }}>
        Already have an account?{" "}
        <Link
          href={redirect ? `/sign-in?redirect=${encodeURIComponent(redirect)}` : "/sign-in"}
          className="font-medium transition-colors hover:underline"
          style={{ color: "var(--oxblood)" }}
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
