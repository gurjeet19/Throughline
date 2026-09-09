import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaBand() {
  return (
    <section
      id="cta"
      className="border-t border-[var(--border-hair)] bg-[var(--surface)] px-[5%] py-24 text-center"
    >
      <div className="mx-auto max-w-[var(--max-cta)]">
        <p className="eyebrow mb-3">Builder mode on</p>
        <h2 className="h-section">
          Ship your next feature <em>the deliberate way.</em>
        </h2>
        <p className="mx-auto mt-3.5 max-w-[440px] text-sm leading-7 text-[var(--text-2)]">
          Connect a repository, submit a request, and watch it move from
          idea to production with a human in the loop.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3.5">
          <Button size="lg" render={<Link href="/sign-up">Start free →</Link>} />
          <Button
            size="lg"
            variant="outline"
            render={<a href="#">Book a walkthrough</a>}
          />
        </div>
      </div>
    </section>
  );
}
