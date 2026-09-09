"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#features", label: "Features" },
  { href: "#voices", label: "Teams" },
  { href: "#pricing", label: "Pricing" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-[100] flex h-14 items-center bg-background/[0.86] backdrop-blur-md transition-[border-color,box-shadow] duration-200 ${
        scrolled
          ? "border-b border-[var(--border-hair)] shadow-[0_1px_0_var(--border-hair)]"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-[5%]">
        <Link
          href="/"
          className="font-sans text-[1.05rem] font-semibold tracking-[-0.01em] text-[var(--text-1)]"
        >
          Through
          <span className="font-serif italic text-[var(--peach-bright)]">
            line
          </span>
        </Link>

        <div className="hidden items-center gap-8 sm:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[0.82rem] font-medium text-[var(--text-2)] transition-colors hover:text-[var(--oxblood)]"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3.5">
          <Link
            href="/sign-in"
            className="hidden text-[0.82rem] font-medium text-[var(--text-2)] transition-colors hover:text-[var(--text-1)] sm:inline"
          >
            Sign in
          </Link>
          <Button size="sm" render={<a href="#cta">Start free</a>} />
        </div>
      </div>
    </nav>
  );
}
