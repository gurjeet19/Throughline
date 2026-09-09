import { Button } from "@/components/ui/button";
import { HeroRotator } from "@/components/marketing/hero-rotator";
import { HeroDemoPanel } from "@/components/marketing/hero-demo-panel";

const STATS = [
  { num: "8", label: "tracked stages" },
  { num: "7", label: "review dimensions" },
  { num: "1", label: "human, always last" },
];

export function Hero() {
  return (
    <header className="px-[5%] pt-[8.5rem] pb-[5.5rem]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
        <div>
          <p className="hero-reveal eyebrow" style={{ "--d": "0.15s" } as React.CSSProperties}>
            AI-assisted product delivery
          </p>
          <h1
            className="hero-reveal h-display mt-3"
            style={{ "--d": "0.27s" } as React.CSSProperties}
          >
            Every feature,
            <br />
            from request to <em>shipped.</em>
          </h1>
          <p
            className="hero-reveal mt-6 max-w-[440px] text-[1.05rem] leading-[1.7] text-[var(--text-2)]"
            style={{ "--d": "0.39s" } as React.CSSProperties}
          >
            It starts with <HeroRotator />
            <br />
            Throughline turns it into a PRD, into tasks, into reviewed code
            — with a human signing off before anything ships.
          </p>
          <div
            className="hero-reveal mt-8 flex flex-wrap gap-3.5"
            style={{ "--d": "0.51s" } as React.CSSProperties}
          >
            <Button size="lg" render={<a href="#cta">Start free →</a>} />
            <Button
              size="lg"
              variant="outline"
              render={<a href="#how">See the workflow</a>}
            />
          </div>
          <div
            className="hero-reveal mt-12 flex items-center gap-7 border-t border-[var(--border-hair)] pt-7"
            style={{ "--d": "0.63s" } as React.CSSProperties}
          >
            {STATS.map((stat, i) => (
              <div key={stat.label} className="contents">
                {i > 0 && (
                  <div className="h-[38px] w-px bg-[var(--border-hair)]" />
                )}
                <div>
                  <div className="font-serif text-[1.7rem] leading-none text-[var(--text-1)] italic">
                    {stat.num}
                  </div>
                  <div className="mt-[0.35rem] text-[0.72rem] text-[var(--text-3)]">
                    {stat.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <HeroDemoPanel />
      </div>
    </header>
  );
}
