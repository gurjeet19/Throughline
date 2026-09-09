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

/**
 * Where to land after auth: an internal `?redirect=` path (e.g. an invitation
 * accept page) when present, otherwise the dashboard. Only same-origin
 * relative paths are honored, so the param can't bounce users off-site.
 */
function redirectTarget() {
  if (typeof window === "undefined") return "/dashboard";
  const target = new URLSearchParams(window.location.search).get("redirect");
  return target && target.startsWith("/") ? target : "/dashboard";
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Preserve an invite (or other) redirect through the Google round-trip and
  // the sign-up link. Read after mount to avoid a hydration mismatch.
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

    const { error: signInError } = await authClient.signIn.email({ email, password });

    setLoading(false);

    if (signInError) {
      setError(signInError.message ?? "Could not sign in.");
      return;
    }

    router.push(redirectTarget());
  }

  return (
    <AuthShell>
      <AuthHeader
        eyebrow="Welcome back"
        title={
          <>
            Sign in to <em>Throughline</em>
          </>
        }
        subtitle="Pick up where your team left off."
      />

      <GoogleButton
        label="Continue with Google"
        callbackURL={redirect ?? "/welcome"}
      />
      <AuthDivider label="or" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
          />
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
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-[0.8rem]" style={{ color: "var(--text-3)" }}>
        New to Throughline?{" "}
        <Link
          href={redirect ? `/sign-up?redirect=${encodeURIComponent(redirect)}` : "/sign-up"}
          className="font-medium transition-colors hover:underline"
          style={{ color: "var(--oxblood)" }}
        >
          Create a workspace
        </Link>
      </p>
    </AuthShell>
  );
}
