import { Badge } from "@/components/ui/badge";

const CODE_ROWS = [
  {
    line: 14,
    pointer: false,
    content: (
      <>
        <span className="text-[var(--blue)]">export function</span> rotate(token) {"{"}
      </>
    ),
  },
  {
    line: 15,
    pointer: false,
    content: (
      <>
        &nbsp;&nbsp;<span className="text-[var(--text-3)]">{"// store the new session"}</span>
      </>
    ),
  },
  {
    line: 16,
    pointer: true,
    highlighted: true,
    content: (
      <>
        &nbsp;&nbsp;db.set(<span className="text-[var(--green)]">&apos;session&apos;</span>,{" "}
        <span className="text-[var(--red-err)]">token</span>){" "}
        <span className="text-[var(--text-3)]">{"// plaintext"}</span>
      </>
    ),
  },
  {
    line: 17,
    pointer: false,
    content: (
      <>
        &nbsp;&nbsp;<span className="text-[var(--blue)]">return</span> ok()
      </>
    ),
  },
  { line: 18, pointer: false, content: <>{"}"}</> },
];

export function HeroDemoPanel() {
  return (
    <div
      id="demo"
      className="demo-reveal overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-hair)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border-hair)] bg-[var(--bg)] px-[0.9rem] py-[0.65rem]">
        <span className="size-[11px] rounded-full bg-[#e5573e]" />
        <span className="size-[11px] rounded-full bg-[#e8a93c]" />
        <span className="size-[11px] rounded-full bg-[#5bb36a]" />
        <span className="ml-2 font-mono text-[0.72rem] text-[var(--text-3)]">
          auth/session.ts
        </span>
      </div>

      <div className="border-b border-[var(--border-soft)] px-[1.2rem] pt-[1.1rem] pb-[0.9rem]">
        <p className="eyebrow">AI Review · PR #482</p>
        <div className="mt-[0.15rem] font-serif text-[1.25rem] text-[var(--text-1)]">
          Persist refresh tokens
        </div>
        <div className="mt-[0.35rem] font-mono text-[0.72rem] text-[var(--text-3)]">
          3 files changed · checked against PRD-118
        </div>
      </div>

      <div className="py-[0.7rem] font-mono text-[0.73rem] leading-[1.95]">
        {CODE_ROWS.map((row) => (
          <div
            key={row.line}
            className={`grid grid-cols-[30px_14px_1fr] items-baseline px-[1.1rem] text-[var(--text-2)] ${
              row.highlighted ? "bg-[var(--line-hi)]" : ""
            }`}
          >
            <span className="pr-2 text-right text-[var(--text-3)]">
              {row.line}
            </span>
            <span className="font-bold text-[var(--oxblood)]">
              {row.pointer ? "▸" : ""}
            </span>
            <span>{row.content}</span>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-[0.7rem] border-t border-[var(--border-soft)] px-[1.1rem] py-[0.85rem]">
        <Badge className="shrink-0 rounded-[3px] bg-[var(--red-bg)] px-[0.42rem] py-[0.12rem] text-[0.62rem] font-bold tracking-[0.06em] text-[var(--red-err)] uppercase">
          Blocking
        </Badge>
        <p className="text-[0.76rem] leading-[1.55] text-[var(--text-2)]">
          <b className="font-semibold text-[var(--text-1)]">
            Refresh token stored unencrypted.
          </b>{" "}
          PRD-118 acceptance criteria require tokens at rest to be hashed.
          Hash before persisting, then re-run review.
        </p>
      </div>

      <div className="flex items-center gap-[0.8rem] border-t border-[var(--border-hair)] bg-[var(--bg)] px-4 py-[0.6rem]">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--oxblood)]">
          <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true">
            <path d="M0 0l9 5-9 5z" fill="#fff" />
          </svg>
        </span>
        <span className="text-[0.85rem] text-[var(--text-3)]">‹‹</span>
        <div className="relative h-[3px] flex-1 rounded-[3px] bg-[var(--border-hair)]">
          <div className="absolute inset-y-0 left-0 w-[38%] rounded-[3px] bg-[var(--oxblood)]">
            <span className="absolute top-1/2 right-[-3px] size-[9px] -translate-y-1/2 rounded-full bg-[var(--oxblood)]" />
          </div>
        </div>
        <span className="font-mono text-[0.7rem] text-[var(--text-3)]">
          re-review
        </span>
      </div>
    </div>
  );
}
