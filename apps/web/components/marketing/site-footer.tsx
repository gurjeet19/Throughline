const FOOTER_LINKS = [
  { href: "#how", label: "Workflow" },
  { href: "#features", label: "Features" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#cta", label: "Get started" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] px-[5%] py-12">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4">
        <div className="text-[0.95rem] font-semibold text-[var(--text-1)]">
          Through
          <span className="font-serif italic text-[var(--peach-bright)]">
            line
          </span>
        </div>

        <div className="flex flex-wrap gap-[1.6rem]">
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[0.78rem] text-[var(--text-2)] transition-colors hover:text-[var(--oxblood)]"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="font-mono text-[0.72rem] text-[var(--text-3)]">
          From request to shipped.
        </div>
      </div>
    </footer>
  );
}
