# StepCheck — Design System (Mintlify)

The active design language is the Mintlify system. Canonical token
reference: `DESIGN-mintlify.md` (source: user-provided design analysis).
The previous "exam paper + red pen" system (Fraunces, paper/grid palette)
is retired — do not reintroduce it.

## Tokens in this codebase

Semantic Tailwind tokens (`tailwind.config.ts`), never raw hex in
components:

| Token | Value | Role |
|---|---|---|
| `paper` / `bg-white` | `#ffffff` | Canvas |
| `surface`, `surface-soft` | `#f7f7f7`, `#fafafa` | Section/card fills |
| `hairline`, `hairline-soft` | `#e5e5e5`, `#ededed` | Borders/dividers |
| `ink`, `ink-muted`, `charcoal` | `#0a0a0a`, `#5a5a5c`, `#1c1c1e` | Text |
| `brand`, `brand-deep`, `brand-soft` | `#00d4a4`, `#00b48a`, `#7cebcb` | Accent CTAs, focus ring, active states ONLY |
| `mark-correct` | `#1ba673` | Tick / correct step |
| `mark-error` | `#d45656` | Cross / incorrect step |
| `mark-flag` | `#c37d0d` | Low-confidence warning |
| `hero-from` → `hero-to` | `#87a8c8` → `#f5e9d8` | Landing hero gradient only |

## Rules

- Inter for all prose/headings (weights 400/500/600, tight tracking on
  headings); Geist Mono for code/LaTeX-source only. No third typeface,
  no italics.
- Every button is a pill (`rounded-full`). Cards are 12px
  (`rounded-lg`), inputs/code 8px (`rounded-md`) — nothing in between.
- `brand` mint never appears on body text or large fills.
- `mark-*` colors are reserved for grading semantics.
- Flat surfaces with hairline borders; the only deep shadow is the
  landing demo card (hero-product-mockup treatment). The only gradient
  is the landing hero band.
- Motion: `mark-in` (staggered tick/cross reveal, 120ms apart) and
  `screen-in` (screen transitions) are the only animations. Both respect
  `prefers-reduced-motion`.
