# StepCheck — Design Plan (Phase 4)

## 1. Palette — "exam paper + red pen"

StepCheck's whole job is what an HSC marker does with a red pen on a
student's working: read it line by line, tick what holds, cross what
doesn't, note the misconception in the margin. The palette is built from
that object — ruled exercise paper and ink — not from generic ed-tech
blue or AI-chat purple.

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F7F8F4` | Base background — cool near-white, not cream. Reads as page, not parchment. |
| `grid` | `#C9DAE3` | Faint graph-paper rule lines, used at low opacity as a background texture only. |
| `ink` | `#1E3A5F` | Primary text, headings, borders — a deep fountain-pen blue instead of near-black. |
| `ink-muted` | `#5B6B7A` | Secondary text (labels, helper copy). |
| `mark-correct` | `#2F6B4F` | Tick marks, correct-step state — muted forest ink, not a bright UI green. |
| `mark-error` | `#B23A2E` | Cross marks, incorrect-step state — brick red pen, not alert-red. |
| `mark-flag` | `#C98A2C` | The one warm accent: low-confidence warnings and the margin-rail highlight. Used sparingly. |

Six functional tokens plus one accent. `mark-flag` is the only warm note
in an otherwise cool, papery palette, so it stays legible as "pay
attention" instead of blending into decoration.

## 2. Typography

- **Display — Fraunces** (variable serif, `next/font/google`). Used for
  the wordmark, stage headings, and the big correct/incorrect verdict.
  Fraunces has ink-trap-like curves at high optical size that feel
  handwritten-adjacent without being a script font — appropriate for a
  tool about handwriting, without pretending to be handwriting.
- **Body — IBM Plex Sans** (`next/font/google`). Neutral, highly legible
  at small sizes for labels, buttons, and feedback text. Plex has a
  technical/exam-paper register (it was designed for IBM's internal
  documentation) that sits comfortably next to a math tool without
  reading as generic chat-UI sans.
- **Mono — Geist Mono** (already self-hosted in `app/fonts`, kept as-is)
  for raw LaTeX/JSON debug output. Reusing what's already in the repo
  rather than adding a fourth typeface.

Inter and system-ui are not used anywhere.

## 3. Layout concept

The four stages (input → upload → transcribe/confirm → analyze/results)
read as consecutive pages the app turns for you: each stage is a single
numbered "page" ("Page 1 of 4" in the margin) with the previous stage's
key artifact — the typed problem, the photo thumbnail — pinned as a
small running header, so the student always sees the thread connecting
what they're doing now to what came before.

## 4. Signature element — the marking rail

Each transcribed step gets a narrow vertical rail to its left, styled
like a marker's margin. Once analysis completes, a hand-drawn-style
tick (`mark-correct`) or cross (`mark-error`) — a single small inline
SVG stroke, not an icon-font glyph — draws into that rail next to its
step. This is the one visual a viewer will remember: it's the app
grading your working the way a real marker would, in the margin, next
to the exact line responsible.

## 5. Motion — the one orchestrated moment

When analysis results arrive, the marking-rail ticks/crosses reveal one
step at a time, top to bottom, ~120ms apart (a single staggered
`animation-delay` sequence, no JS animation loop) — as if a marker's pen
is moving down the page. No other hover, load, or scroll animation is
added anywhere else in the app.

---

## Self-critique

Read back against: "would this be the same generic answer for any math
ed-tech app?" The first draft leaned on a warm cream background
(`#F5F0E6`-ish) with the Fraunces serif, which — reread side by side with
the three named defaults — was drifting straight into "warm cream +
terracotta serif," just with blue ink instead of terracotta. That's still
a default with the accent swapped, not a different concept. Two things
changed as a result: the paper token was pulled cooler and greyer
(`#F7F8F4`, with a faint blue-grid texture) so the identity reads as
*ruled exercise paper*, not *artisanal warm paper*; and the ink navy was
made the dominant, most-repeated color (borders, headings, the rail
itself) rather than a secondary accent on top of a cream field, so the
"exam paper + red pen" concept is legible even with the serif and the
near-white background in the frame. The marking-rail signature element
and the red/green *marker's* pen (not alert-UI red/green) are what keep
this tied to HSC exam-marking specifically rather than "math app,
generic blue theme" — that concept doesn't transfer unchanged to a
generic ed-tech or AI-chat product, which is the bar this was checked
against.
