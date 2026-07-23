# StepCheck — Design System (Neobrutalism × FlyRank)

The active design language is neobrutalism (thick ink borders, hard
offset shadows, flat fills, boxy buttons — no gradients, no blurs)
executed in the FlyRank palette (mint accent, dark-teal ink, whitesmoke
canvas). The previous Mintlify system (pills, hairline-only borders,
hero gradient) is retired — do not reintroduce it.

## Tokens (`tailwind.config.ts`) — never raw hex in components

| Token | Value | Role |
|---|---|---|
| `bg-white` / `paper` | `#ffffff` | Card fill |
| `surface`, `surface-soft` | `#f8f8f8`, `#fcfcfc` | Page canvas / inner boxes |
| `hairline`, `hairline-soft` | `#e5e5e5`, `#ededed` | INNER dividers only — never outer borders |
| `ink`, `ink-muted`, `charcoal` | `#001820`, `#425153`, `#0c1b1b` | Text, outer borders, shadows / muted text / hover fill |
| `brand`, `brand-deep`, `brand-soft` | `#50e098`, `#2fbf7b`, `#a9efcb` | Mint accent: CTAs, focus ring, kicker washes, hero shadow |
| `mark-correct` | `#1ba673` | Tick / correct step |
| `mark-error` | `#e5484d` | Cross / incorrect step; the app's one red |
| `mark-flag` | `#c37d0d` | Low-confidence warning |
| `shadow-brut`, `shadow-brut-sm` | `4px 4px 0 #001820`, `2px 2px 0` | Hard offset shadows — cards / buttons |
| `shadow-brut-brand` | `6px 6px 0 #50e098` | Mint shadow — landing hero card only |

## Rules

1. Outer cards, sections, buttons, and inputs: `border-2 border-ink`
   plus a `shadow-brut*`. Inner sub-boxes keep 1px hairline borders.
   Never pure `#000` — ink `#001820` is the off-black.
2. Buttons are boxy (`rounded-lg`, 8px), `font-semibold`, bordered and
   hard-shadowed. Hover lifts (shadow grows); active presses
   (translate 2px toward the shadow, shadow collapses). Ghost/link are
   flat. Only tiny non-interactive status badges may be `rounded-full`.
3. Radius scale: 8px (`rounded-lg`) cards/buttons/inputs, 4px
   (`rounded-md`) inner boxes. Nothing else.
4. No gradients, no blurred shadows, no dark mode (light only for now).
5. `brand` mint is accent-only; `mark-*` colors are reserved for
   grading semantics; `mark-error` is the only red.
6. Inter for all prose/headings (400/500/600/700); Geist Mono for
   code/raw LaTeX only — plus the mono uppercase letter-spaced "caption
   voice" (`font-mono text-[10-11px] uppercase tracking-[0.12-0.2em]`)
   used for the landing ticker, card labels, stats captions, and wait
   status lines. No third typeface.

## Landing structure (MockClub-derived)

Announcement ticker (ink bar, mono caption voice) → nav row (wordmark
left, links + CTA right) → two-column `lg:` hero: pitch left (kicker
pill, display headline with a mint highlight bar behind the key phrase,
paragraph, CTA pair, 3-cell bordered stats strip), hero object right —
the "marked page" card (mono header row, StepMark step rows, rotated
verdict stamp badge, ink fine-print footer, carousel dots cycling
canned demo problems). Desktop screens use `lg:` grids: sticky photo
beside fields on confirm, 7/5 marked-page + guidance rail on results.
Mobile stays single-column.

## Motion (§5)

- Entry: fade + translateY(16px → 0), 420ms ease-out
  (`.screen-transition`); lists cascade with 80ms inline
  `animationDelay` increments (results steps, history entries).
- Hover: color/shadow shift over 200ms. Buttons press on active.
- Signature: StepMark `mark-in` tick/cross reveal, staggered 120ms —
  keep it the loudest motion on the page. During the analyze wait the
  same marks stream in live, one per step, as Gemma delivers them.
- The wait progress bar animates width only (1s linear ticks, capped
  at 92%).
- Only `transform`, `opacity`, and colors animate.
  `prefers-reduced-motion` disables entry animation.
