# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StepCheck — a Next.js 14 App Router app where a student photographs a math
problem (with or without their own worked solution) and Gemma
(`gemma-4-26b-a4b-it`, via `@google/genai`) either grades their steps line by
line or solves the problem from scratch. LaTeX is edited/displayed via
MathLive.

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm run start    # run production build
npm run lint     # next lint
```

There is no automated test runner configured. `scripts/test-transcribe-batch.mjs`
is a manual batch script that runs `/api/transcribe` against the images in
`test-problems/` — run it directly with `node scripts/test-transcribe-batch.mjs`
against a running dev server, not via npm.

Setup: copy `.env.local.example` to `.env.local` and set `GEMINI_API_KEY`
(from Google AI Studio).

## Architecture

**Single-page, four-screen flow** (`app/page.tsx`), driven by one `screen`
state variable (`landing | upload | confirm | results`) plus an inferred
`stage` (1–3) used only for the progress label. All flow state (image,
transcription, confirmed problem/steps, analysis/solve result) lives in this
one client component — there is no router-based navigation between screens,
and no state is cleared by `goBack()` so moving backward and forward again
never re-fetches.

**Three Gemma calls, one per API route, each independently validated:**

- `POST /api/transcribe` — vision call: OCRs the photo into LaTeX and
  classifies whether it also contains a handwritten worked solution. Returns
  a discriminated union (`hasWorkedSolution: true | false`) that determines
  which of the next two routes gets used.
- `POST /api/analyze` — given a problem + the student's *confirmed* steps,
  Gemma solves the problem independently first, then compares step by step,
  returning `correct | incorrect | not_reached` per step (everything after
  the first break is `not_reached`, even if locally valid) plus a
  miscondescription and corrected continuation on failure.
- `POST /api/solve` — used instead of `/api/analyze` when transcribe found no
  worked solution in the photo; solves from scratch and is explicitly *not*
  framed as a verdict on the student's work (no correct/incorrect banner, no
  `StepMark` in the UI).

Each route: builds a single large instruction prompt, calls
`generateWithRetry` (in `lib/gemini.ts` — retries on 5xx/undefined status,
not on other errors), strips markdown fences with `stripFences`, `JSON.parse`s
the result, and runtime-validates the parsed shape with a hand-written type
guard (`isAnalysisResult`, `isTranscribeResult`, etc.) before trusting it —
Gemma's JSON is never trusted structurally, only after the guard passes. A
malformed/unparseable response returns HTTP 502 with the raw text attached so
the UI can show it in a "Raw model output" `<details>` block.

All three routes set `export const maxDuration = 180` — Gemma responses on
multi-step problems routinely take 60–150s+, well past typical serverless
defaults, so this must stay set on every route that calls Gemma or requests
will be killed mid-flight and surface as a 502.

**Prompt convention:** every instruction prompt requires prose/explanation
fields (`explanation`, `misconceptionSummary`, etc.) to be plain natural
language, never LaTeX — `correctContinuation` is the one exception, since
it's rendered into a math field. `warnIfLooksLikeLatex` in `lib/gemini.ts` is
a non-blocking dev-time signal for prompt regressions here, not a guarantee.

**LaTeX editing vs. display are different components** because MathLive
touches the DOM via custom elements on import and must be client-only
(`dynamic(..., { ssr: false })` in `app/page.tsx`):
- `components/MathInput.tsx` — editable, used on the confirm screen.
- `components/MathView.tsx` — read-only counterpart (MathLive's static
  `<math-div>`, no cursor/keyboard) used at all results-screen display sites.

**`components/StepMark.tsx`** draws the tick/cross marking-rail glyph next to
each graded step, staggered via a `delayMs` prop (`i * 120`ms) so results
reveal top-to-bottom like a marker's pen — the one deliberate animation in
the app (see DESIGN.md §5). Don't add hover/load/scroll animation elsewhere;
it's an explicit design constraint, not an oversight.

## Design system

See [DESIGN.md](DESIGN.md) for the full rationale. In short: the palette and
type choices are built around "exam paper + red pen" (an HSC marker's red
pen on ruled paper), not generic ed-tech blue or AI-chat purple — deliberate,
not arbitrary:

- Colors are semantic tokens (`paper`, `ink`, `ink-muted`, `mark-correct`,
  `mark-error`, `mark-flag`), defined in `tailwind.config.ts` /
  `app/globals.css` and used by name (`text-ink`, `border-mark-error/30`,
  etc.), never as raw hex or generic Tailwind palette colors (`text-blue-600`).
- Fonts: Fraunces (`font-display`) for headings/verdicts, IBM Plex Sans for
  body, Geist Mono (self-hosted in `app/fonts`) for raw LaTeX/JSON debug
  output only. Do not introduce Inter or `font-sans` defaults.
- `mark-correct`/`mark-error`/`mark-flag` are reserved for grading semantics
  (tick/cross/low-confidence) — don't repurpose them as generic UI accent
  colors.

## Import alias

`@/*` maps to the repo root (`tsconfig.json`), e.g. `@/components/Button`,
`@/lib/gemini`.
