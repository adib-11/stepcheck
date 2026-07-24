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

**Core Gemma calls, one per API route, each independently validated:**

- `POST /api/transcribe` — vision call: OCRs the photo and classifies
  whether it also contains a handwritten worked solution. Each problem comes
  back SPLIT into `problemText` (plain prose, no LaTeX, no problem number)
  and `problemLatex` (math only, may be `""`), as a discriminated union on
  `hasWorkedSolution: true | false` that determines which of the next two
  routes gets used. Downstream routes still take ONE composed
  `problemStatementLatex` string — the client joins the halves with
  `composeProblem` (`lib/problem.ts`), so the split never ripples past the
  transcribe route and the confirm UI (textarea + MathInput pair).
- `POST /api/analyze` — given a problem + the student's *confirmed* steps,
  Gemma solves the problem independently first, then compares step by step,
  returning `correct | incorrect | not_reached` per step (everything after
  the first break is `not_reached`, even if locally valid) plus a
  miscondescription and corrected continuation on failure.
- `POST /api/solve` — used instead of `/api/analyze` when transcribe found no
  worked solution in the photo; solves from scratch and is explicitly *not*
  framed as a verdict on the student's work (no correct/incorrect banner, no
  `StepMark` in the UI).

**Streaming variants:** `/api/analyze-stream` and `/api/solve-stream` emit
NDJSON (one step object per line, then a `{"final": true, …}` line) so the
loading card can assemble the marked page / worked solution live during the
wait. `/api/analyze-stream` is a FAN-OUT: one small Gemma call per step
(`generateBounded`, concurrency 2, results emitted in index order, early
abort after the first error, plus one follow-up call for the
misconception/continuation) — small per-step prompts stay out of the runaway
mode below, and they retry individually. `/api/solve-stream` can't be split
(the steps don't exist until Gemma writes them) so it is one call with
in-response retries, safe because the runaway produces zero output before
the watchdog trips. The client (`streamAnalyze` / `streamSolve` in
`app/page.tsx`) salvages repairable streams (deduped/missing step lines
rebuilt from a valid final line), logs every failure reason to the console
AND to the error card's "What went wrong (technical)" block via
`streamDebugRef`, and returns null on genuine shortfall — falling back to
the classic route (always in dev; in prod only within the 240s give-up).

**Gemma-4 is a thinking model with a stochastic runaway mode.** Hidden
reasoning (`thoughtsTokenCount` in `usageMetadata`) precedes any visible
output — the long silent first-token wait IS the thinking, generated at
~48 tok/s. Successful grading runs think ~7k tokens; failed runs loop until
the entire 32,768-token output budget is thoughts and the stream ends with
`finishReason: MAX_TOKENS` and ZERO visible text after ~11 minutes. The same
prompt at temperature 0 can succeed or run away at different times (it's
server-side nondeterminism, not prompt-triggered), so retrying is genuinely
effective. Small focused prompts (single-step checks) think ~300 tokens and
were reliable even while the full grading prompt ran away 100% of the time —
that observation is why analyze-stream fans out per step. Consequences baked
into the code: never set `maxOutputTokens` on these calls (thoughts consume
it → guaranteed-empty output), `thinkingBudget` is rejected for this model,
and all streaming Gemma calls watch `thoughtsTokenCount` per chunk
(`generateBounded` in `lib/gemini.ts` for small calls; solve-stream inline
at >10k thoughts), aborting doomed calls early for a retry instead of
waiting ~11 min for the inevitable empty end.

**Waiting experience** (all client-side, zero extra Gemma calls): live
streamed step marks (`MarkedStep`), a first-slip prediction bet placed during
the wait, `WaitProgress` (elapsed timer vs. a device-calibrated median from
`lib/durations.ts`, bar capped at 92%), `WaitReview` (recent slips from
localStorage history), and opt-in done-notifications + tab-title status.

Each route: builds a single large instruction prompt, calls
`generateWithRetry` (in `lib/gemini.ts` — retries on 5xx/undefined status,
not on other errors), strips markdown fences with `stripFences`, `JSON.parse`s
the result, and runtime-validates the parsed shape with a hand-written type
guard (`isAnalysisResult`, `isTranscribeResult`, etc.) before trusting it —
Gemma's JSON is never trusted structurally, only after the guard passes. A
malformed/unparseable response returns HTTP 502 with the raw text attached so
the UI can show it in a "Raw model output" `<details>` block.

All Gemma-calling routes (including both stream routes) set
`export const maxDuration = 300` (the Vercel Hobby + Fluid Compute ceiling) — Gemma responses on
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
reveal top-to-bottom like a marker's pen — the signature animation. General
motion (entry, cascades, hover, button press) follows DESIGN.md §5; don't
add motion outside those patterns.

## Design system

See [DESIGN.md](DESIGN.md). The app uses a neobrutalist system in the
FlyRank palette: white cards on whitesmoke canvas, 2px dark-teal ink
borders (`#001820` — never pure black), hard offset shadows
(`shadow-brut*`, no blur), boxy `rounded-lg` buttons, mint-green accent.

- Colors are semantic tokens (`surface`, `hairline`, `ink`, `ink-muted`,
  `brand`, `mark-correct`, `mark-error`, `mark-flag`) defined in
  `tailwind.config.ts` / `app/globals.css` and used by name, never as raw
  hex or generic Tailwind palette colors (`text-blue-600`).
- Fonts: Inter for all UI prose and headings (`font-display` and
  `font-body` both resolve to it), Geist Mono (self-hosted in
  `app/fonts`) for code/raw LaTeX/JSON — and for the uppercase
  letter-spaced caption voice (ticker, card labels, stats captions, wait
  status lines). No third typeface.
- Buttons are boxy (`rounded-lg`) with `border-2 border-ink` and a hard
  offset shadow; cards 8px radius + `shadow-brut`; inner boxes 4px with
  hairline borders. No gradients. Light mode only.
- `brand` mint is accent-only (CTAs, focus ring, kicker washes);
  `mark-correct`/`mark-error`/`mark-flag` are reserved for grading
  semantics — don't repurpose either as generic UI colors. `mark-error`
  is the app's only red.
- Desktop layout: screens live in a `max-w-6xl` shell with `lg:` grids
  (sticky photo beside fields on confirm; 7/5 marked-page + guidance
  rail on results). Mobile stays single-column.

## Import alias

`@/*` maps to the repo root (`tsconfig.json`), e.g. `@/components/Button`,
`@/lib/gemini`.
