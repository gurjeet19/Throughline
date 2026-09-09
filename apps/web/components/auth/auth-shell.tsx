import Link from "next/link";

function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={className}>
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
  );
}

/** The intake channels, echoing the product's "request from anywhere" promise. */
const CHANNELS = ["Email", "Support ticket", "Customer call", "Manual"];

/**
 * Two-pane auth layout: an editorial brand panel (lg+) beside the form pane.
 * Follows DESIGN.md — warm bg, hairline divider, peach typographic accent,
 * serif italic headline punctuation, no decorative noise.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2" style={{ background: "var(--bg)" }}>
      {/* Brand panel */}
      <aside
        className="relative hidden flex-col justify-between p-12 lg:flex"
        style={{ borderRight: "1px solid var(--border-hair)" }}
      >
        <Logo />

        <div className="flex flex-col gap-5">
          <p className="eyebrow">Product delivery, end to end</p>
          <h1 className="h-display" style={{ fontSize: "clamp(2.4rem, 4vw, 3.4rem)" }}>
            From request
            <br />
            to <em>shipped.</em>
          </h1>
          <p
            className="max-w-[380px] text-sm leading-7"
            style={{ color: "var(--text-2)" }}
          >
            Capture a feature request from anywhere, let AI clarify and spec it,
            then carry it all the way through review to release.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {CHANNELS.map((c, i) => (
            <span
              key={c}
              className="text-[0.7rem]"
              style={{ color: "var(--text-3)", fontFamily: "var(--font-mono)" }}
            >
              {c}
              {i < CHANNELS.length - 1 && (
                <span style={{ color: "var(--peach)" }}> · </span>
              )}
            </span>
          ))}
        </div>
      </aside>

      {/* Form pane */}
      <div
        className="flex flex-col items-center justify-center px-6 py-12"
        style={{ background: "var(--surface)" }}
      >
        {/* Logo for mobile, where the brand panel is hidden */}
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-[360px]">{children}</div>
      </div>
    </main>
  );
}

/** A labelled hairline divider, e.g. "or" between social and email auth. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1" style={{ background: "var(--border-hair)" }} />
      <span
        className="text-[0.68rem] uppercase tracking-wider"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </span>
      <span className="h-px flex-1" style={{ background: "var(--border-hair)" }} />
    </div>
  );
}

/** Standard heading block for an auth form: eyebrow + serif title + subtitle. */
export function AuthHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="h-section" style={{ fontSize: "1.9rem" }}>
        {title}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
        {subtitle}
      </p>
    </div>
  );
}
