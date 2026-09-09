# Throughline — Claude Code Instructions

See [AGENTS.md](./AGENTS.md) for full project context, stack, commands,
and conventions. This file contains only Claude Code-specific additions.

---

## Skills

- Use the `vercel:shadcn` skill when adding or modifying shadcn components.
- Always cross-check generated UI against `docs/DESIGN.md` — the skill
  provides correct API syntax; design decisions (colors, spacing, radius,
  typography) are governed by the design system, not shadcn defaults.

## Commit Style

- No `Co-Authored-By` trailer.
- Wrap commit message body lines to 80 characters.
