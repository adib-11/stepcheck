# Landing Redesign, Desktop Layout & Waiting Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the landing page after the MockClub reference (structure only — current fonts and palette), split the transcribed problem statement into prose + math so it renders readably, use the full desktop width on the confirm/results screens, and turn the 60–300s Gemma wait into an active experience (streamed marked page, prediction game, honest progress, recent-slips review, done-notifications).

**Architecture:** All flow state stays in the single client component `app/page.tsx` (four-screen `screen` state — see CLAUDE.md). The schema split changes ONLY `/api/transcribe`'s output plus the confirm UI; every downstream route keeps its `problemStatementLatex: string` contract and receives a client-composed `"<prose>\n<latex>"` string, so no downstream prompt or guard changes. Waiting features are pure client work except one new `/api/solve-stream` route that mirrors the existing `/api/analyze-stream` (same single Gemma call, just streamed — zero extra API load).

**Tech Stack:** Next.js 14 App Router, Tailwind (semantic tokens), MathLive (`MathInput`/`MathView`), `@google/genai` streaming, localStorage.

## Global Constraints

- Fonts: Inter (`font-display`/`font-body`) and Geist Mono (`font-mono`) ONLY — no new typeface.
- Colors: existing tokens only (`ink`, `ink-muted`, `brand`, `brand-soft`, `brand-deep`, `surface`, `surface-soft`, `hairline`, `hairline-soft`, `mark-correct`, `mark-error`, `mark-flag`, `paper`, `charcoal`). Never raw hex in JSX/Tailwind classes (the one existing exception: MathLive host inline styles in `MathInput.tsx`).
- Shadows: `shadow-brut`, `shadow-brut-sm`, `shadow-brut-brand` only. Radius: `rounded-lg` (8px) cards/buttons, `rounded-md` inner boxes.
- No extra Gemma API calls and no extra output tokens. Streaming replaces (not augments) an existing call. Any new Gemma route MUST have `export const runtime = "nodejs"` and `export const maxDuration = 180`.
- Animations: reuse existing systems only (`mark-in`, `screen-in`/`.screen-transition`, StepMark's `delayMs` stagger). No new hover/scroll animation systems (DESIGN.md §5). CSS `transition-[width]` on the progress bar is allowed (it's a state transition, not decoration).
- Prose fields (explanations, `problemText`) are plain natural language, never LaTeX.
- There is NO automated test runner in this repo (see CLAUDE.md). Every task verifies with `npm run lint`, `npm run build`, and a described browser check against `npm run dev` on localhost:3000. Do not add a test framework.
- Mobile stays single-column: all multi-column layout is `lg:`-prefixed.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Phase 1 — Problem statement schema split

### Task 1: Transcribe route — prose/math split

**Files:**
- Modify: `app/api/transcribe/route.ts` (INSTRUCTION at lines 14–40, interfaces/guard at lines 42–87)
- Create: `lib/problem.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `/api/transcribe` now returns items shaped `{ hasWorkedSolution: false, problemText: string, problemLatex: string }` or `{ hasWorkedSolution: true, problemText: string, problemLatex: string, solutionSteps: string[] }`. `problemText` is non-empty prose; `problemLatex` is a (possibly empty) LaTeX string. Also produces `composeProblem(problemText: string, problemLatex: string): string` in `lib/problem.ts` — the ONE composition helper every downstream caller uses.

- [ ] **Step 1: Create `lib/problem.ts`**

```ts
/**
 * Joins the prose and math halves of a transcribed problem back into the
 * single string every downstream Gemma route ( /api/analyze, /api/solve,
 * /api/hints, … ) already accepts as `problemStatementLatex`. Keeping the
 * downstream contracts unchanged means the schema split touches only
 * /api/transcribe and the client.
 */
export function composeProblem(problemText: string, problemLatex: string): string {
  const text = problemText.trim();
  const latex = problemLatex.trim();
  if (!latex) return text;
  if (!text) return latex;
  return `${text}\n${latex}`;
}
```

- [ ] **Step 2: Replace the transcription INSTRUCTION**

In `app/api/transcribe/route.ts`, replace the numbered list and JSON shape inside `INSTRUCTION` (lines 20–40) with:

```ts
const INSTRUCTION = `You are reading a photo of math homework for a student.

The photo may contain ONE OR MORE problems. Each problem may appear as ONLY
a problem statement, or as a problem statement PLUS the student's own
handwritten attempt at solving it.

For EACH problem in the photo, in reading order (top to bottom, left column
before right):
1. Split the problem statement into two parts:
   - "problemText": the wording of the problem in plain natural language.
     No LaTeX commands, no math symbols beyond ordinary punctuation, and no
     problem number ("6." is layout, not content). Example: "Solve using the
     quadratic formula."
   - "problemLatex": ONLY the mathematical expression(s), as LaTeX, with no
     prose words mixed in. Example: "x^2 + 4x + 3 = 0". Use "" (empty
     string) if the problem contains no symbolic math.
2. Decide whether the photo also shows worked solution steps written by the
   student for THAT problem (not just the problem, and not a printed answer
   key) — if there is any handwritten attempt at solving it, however
   partial, treat it as a worked solution.
3. If there is a worked solution, transcribe each step of it into LaTeX, one
   step per array entry, in the order written. If a line is illegible,
   transcribe your best guess rather than skipping it.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape, with one entry per problem:

{
  "problems": [
    { "hasWorkedSolution": false, "problemText": string, "problemLatex": string }
    OR
    { "hasWorkedSolution": true, "problemText": string, "problemLatex": string, "solutionSteps": string[] }
  ]
}`;
```

- [ ] **Step 3: Update the route's interfaces and type guard**

Replace lines 42–74 (`NoSolutionItem` through `isTranscribeItem`) with:

```ts
interface NoSolutionItem {
  hasWorkedSolution: false;
  problemText: string;
  problemLatex: string;
}

interface WithSolutionItem {
  hasWorkedSolution: true;
  problemText: string;
  problemLatex: string;
  solutionSteps: string[];
}

type TranscribeItem = NoSolutionItem | WithSolutionItem;

interface TranscribeBatch {
  problems: TranscribeItem[];
}

function isTranscribeItem(value: unknown): value is TranscribeItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // problemText carries the statement, so it must be non-empty; problemLatex
  // is legitimately "" for prose-only problems.
  if (typeof v.problemText !== "string" || v.problemText.trim() === "") return false;
  if (typeof v.problemLatex !== "string") return false;
  if (v.hasWorkedSolution === false) return true;
  if (v.hasWorkedSolution === true) {
    return (
      Array.isArray(v.solutionSteps) &&
      v.solutionSteps.length > 0 &&
      v.solutionSteps.every((s) => typeof s === "string" && s.trim() !== "")
    );
  }
  return false;
}
```

`isTranscribeBatch` (lines 76–87) is unchanged.

- [ ] **Step 4: Verify it compiles — expect page.tsx/teacher errors NOT here**

Run: `npm run lint && npx tsc --noEmit 2>&1 | head -30`
Expected: `app/api/transcribe/route.ts` and `lib/problem.ts` are clean. `app/page.tsx` and `app/teacher/page.tsx` WILL now have type errors referencing `problemStatementLatex` — that is Task 2's job; do not fix them here, and do not commit a broken build. **Therefore Tasks 1 and 2 commit together at the end of Task 2.**

### Task 2: Client adoption of the split schema

**Files:**
- Modify: `app/page.tsx` (TranscribeItem type lines 68–70, state lines 107–110, `loadQueueItem` 180–202, `startTyped` 206–219, `runResult` 225–304, `runHints` 306–332, `fetchPractice` 416–440, `askFollowUp` 442–481, `checkExplanation` 483–513, confirm UI 719–722, `startOver` 524–548)
- Modify: `app/teacher/page.tsx:72`
- Modify: `lib/history.ts` (interface lines 1–8, guard lines 16–31)
- Modify: `components/HistoryList.tsx:68-70`

**Interfaces:**
- Consumes: `composeProblem` from `lib/problem.ts` (Task 1); the new `/api/transcribe` shape.
- Produces: `page.tsx` state `problemText: string`, `problemLatex: string`; `confirmed` becomes `{ text: string; latex: string; steps: string[] | null } | null`; `runResult(text: string, latex: string, stepsToUse: string[] | null)`; `runHints(text: string, latex: string)`. `HistoryEntry` gains optional `problemText?: string`. Later tasks (7, 9–14) build on these exact names.

- [ ] **Step 1: Update `page.tsx` types and state**

Replace the `TranscribeItem` type (lines 68–70) with:

```ts
type TranscribeItem =
  | { hasWorkedSolution: false; problemText: string; problemLatex: string }
  | {
      hasWorkedSolution: true;
      problemText: string;
      problemLatex: string;
      solutionSteps: string[];
    };
```

Replace the `problem` state (line 107) and `confirmed` state (lines 110–112) with:

```ts
const [problemText, setProblemText] = useState("");
const [problemLatex, setProblemLatex] = useState("");

const [confirmed, setConfirmed] = useState<{
  text: string;
  latex: string;
  steps: string[] | null;
} | null>(null);
```

Add the import: `import { composeProblem } from "@/lib/problem";`

- [ ] **Step 2: Update the flow functions**

In `loadQueueItem` replace `setProblem(item.problemStatementLatex);` with:

```ts
setProblemText(item.problemText);
setProblemLatex(item.problemLatex);
```

In `startTyped` replace the seeded transcription + `setProblem("")` with:

```ts
setTranscribeResult({ hasWorkedSolution: false, problemText: "", problemLatex: "" });
setProblemText("");
setProblemLatex("");
```

Change `runResult`'s signature and first line to:

```ts
async function runResult(text: string, latex: string, stepsToUse: string[] | null) {
  const problemToUse = composeProblem(text, latex);
  setConfirmed({ text, latex, steps: stepsToUse });
```

(the rest of the body keeps using `problemToUse` exactly as before). Both `saveHistoryEntry` calls inside `runResult` change `problemLatex: problemToUse` to:

```ts
problemLatex: latex,
problemText: text,
```

Change `runHints` the same way:

```ts
async function runHints(text: string, latex: string) {
  const problemToUse = composeProblem(text, latex);
  setConfirmed({ text, latex, steps: null });
```

In `fetchPractice`, `askFollowUp`, and `checkExplanation`, replace every `confirmed.problem` with `composeProblem(confirmed.text, confirmed.latex)`.

In `startOver`, replace `setProblem("")` with `setProblemText(""); setProblemLatex("");`.

Update every call site:
- Confirm button: `onClick={() => runResult(problemText, problemLatex, cleanedSteps)}` and `disabled={isWorking || !problemText.trim() && !problemLatex.trim()}` — write it as `disabled={isWorking || (!problemText.trim() && !problemLatex.trim())}`.
- Hint button: `onClick={() => runHints(problemText, problemLatex)}`, same disabled logic plus `isHinting`.
- Results retry button: `onClick={() => confirmed && runResult(confirmed.text, confirmed.latex, confirmed.steps)}`.
- Hints "full solution" button: `onClick={() => confirmed && runResult(confirmed.text, confirmed.latex, null)}`.
- "Re-check my fix" button: `runResult(confirmed.text, confirmed.latex, next)`.

- [ ] **Step 3: Replace the confirm screen's problem field with a prose + math pair**

Replace the single problem-statement block (lines 719–722) with:

```tsx
<div className="flex flex-col gap-1">
  <label className="text-sm font-medium text-ink">What does the problem ask?</label>
  <textarea
    value={problemText}
    onChange={(e) => setProblemText(e.target.value)}
    rows={2}
    placeholder="e.g. Solve using the quadratic formula."
    className="w-full resize-y rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  />
</div>

<div className="flex flex-col gap-1">
  <label className="text-sm font-medium text-ink">The math</label>
  <MathInput
    key={`problem-${queueIndex}`}
    defaultValue={problemLatex}
    onChange={setProblemLatex}
    placeholder="e.g. x^2+4x+3=0"
  />
</div>
```

(The `key` forces a remount when the worksheet queue advances, since `MathInput` only reads `defaultValue` once.)

- [ ] **Step 4: Teacher page**

In `app/teacher/page.tsx`, add `import { composeProblem } from "@/lib/problem";` and change line 72 to:

```ts
problemStatementLatex: composeProblem(item.problemText, item.problemLatex),
```

- [ ] **Step 5: History storage + display**

In `lib/history.ts` add to the interface after `problemLatex`:

```ts
// Prose half of the split problem statement. Optional: entries saved
// before the prose/math split don't have it.
problemText?: string;
```

(the load guard needs no change — the field is optional.)

In `components/HistoryList.tsx`, replace the problem box (lines 68–70) with:

```tsx
<div className="mt-2 rounded-md border border-hairline-soft bg-surface px-3 py-2">
  {entry.problemText && <p className="text-sm text-ink">{entry.problemText}</p>}
  {entry.problemLatex.trim() !== "" && <MathView latex={entry.problemLatex} />}
</div>
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run build`
Expected: both pass with zero errors.

Browser check (`npm run dev`, or the preview tools): landing → "No photo? Type the problem instead" → confirm screen shows the textarea + math field; type "Solve for x" and `2x+4=10`, Confirm, and the results screen solves it. The prose never appears italic-mashed inside the math field.

- [ ] **Step 7: Commit (Tasks 1+2 together)**

```bash
git add app/api/transcribe/route.ts lib/problem.ts app/page.tsx app/teacher/page.tsx lib/history.ts components/HistoryList.tsx
git commit -m "feat: split transcribed problem into prose + math halves"
```

### Task 3: MathInput hugs its content

**Files:**
- Modify: `components/MathInput.tsx:76-84`

**Interfaces:**
- Consumes/Produces: no API change — `MathInputProps` untouched.

- [ ] **Step 1: Let the field size to its content**

Replace the inline `style` object with:

```ts
style={{
  width: "100%",
  fontSize: "1.25rem",
  padding: "0.65rem 1rem",
  borderRadius: "0.5rem", // 8px — neobrutalist base radius
  border: "2px solid #001820", // {colors.ink} — raw hex: MathLive host style can't use Tailwind
  backgroundColor: "#ffffff",
}}
```

(Only change: the `minHeight: "3.5rem"` line is removed — padding alone sets the empty height, and tall content like stacked fractions grows the box instead of overflowing it. Long single-line expressions still scroll horizontally inside the field, which is correct for an equation.)

- [ ] **Step 2: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check: confirm screen — an empty math field is a comfortable single-line height; pasting `\frac{-b\pm\sqrt{b^2-4ac}}{2a}` grows the box vertically with no clipping.

```bash
git add components/MathInput.tsx
git commit -m "fix: MathInput height hugs content instead of fixed min-height"
```

---

## Phase 2 — Landing redesign & desktop layout

### Task 4: Landing hero restructure (MockClub structure, StepCheck skin)

**Files:**
- Modify: `components/LandingHero.tsx` (full rewrite)
- Modify: `app/page.tsx:617-631` (landing branch — pass the second CTA)

**Interfaces:**
- Consumes: `Button`, `StepMark` (existing), `startTyped` from `page.tsx` (Task 2).
- Produces: `LandingHero({ onStart, onStartTyped }: { onStart: () => void; onStartTyped: () => void })`.

- [ ] **Step 1: Rewrite `components/LandingHero.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import StepMark from "@/components/StepMark";

/**
 * Canned examples for the landing-screen demo card — deliberately hardcoded,
 * not fetched, so the concept is legible in seconds and the screen never
 * depends on API health (see LOCKS). One entry per carousel dot.
 */
const DEMO_PROBLEMS: {
  label: string;
  steps: { latex: string; status: "correct" | "incorrect" }[];
  stamp: string;
  stampTone: "correct" | "error";
}[] = [
  {
    label: "LINEAR EQUATION",
    steps: [
      { latex: "2x + 4 = 10", status: "correct" },
      { latex: "2x = 6", status: "correct" },
      { latex: "x = 3 + 1", status: "incorrect" },
    ],
    stamp: "FIRST SLIP: STEP 3",
    stampTone: "error",
  },
  {
    label: "DIFFERENTIATION",
    steps: [
      { latex: "y = x^2 + 3x", status: "correct" },
      { latex: "y' = 2x + 3", status: "correct" },
    ],
    stamp: "ALL CORRECT",
    stampTone: "correct",
  },
  {
    label: "FRACTIONS",
    steps: [
      { latex: "1/2 + 1/3", status: "correct" },
      { latex: "= 2/5", status: "incorrect" },
    ],
    stamp: "FIRST SLIP: STEP 2",
    stampTone: "error",
  },
];

/** Advances the demo card through DEMO_PROBLEMS on a loop. */
function useDemoCarousel(length: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % length), intervalMs);
    return () => clearInterval(id);
  }, [length, intervalMs]);
  return [index, setIndex] as const;
}

const STATS: { figure: string; caption: string }[] = [
  { figure: "✓✗", caption: "EVERY LINE, MARKED" },
  { figure: "1", caption: "PHOTO IS ALL IT TAKES" },
  { figure: "∞", caption: "RE-CHECKS AFTER YOU FIX" },
];

export default function LandingHero({
  onStart,
  onStartTyped,
}: {
  onStart: () => void;
  onStartTyped: () => void;
}) {
  const [demoIndex, setDemoIndex] = useDemoCarousel(DEMO_PROBLEMS.length, 5200);
  const demo = DEMO_PROBLEMS[demoIndex];

  return (
    <div className="flex w-full flex-col bg-surface">
      {/* Announcement ticker — MockClub-style full-width ink bar. */}
      <div className="w-full bg-ink px-4 py-2 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white">
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle" aria-hidden />
        Powered by Gemma · A full check takes a few minutes — every step gets read
      </div>

      {/* Nav row: wordmark left, links + CTA right. */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <span className="font-display text-xl font-bold tracking-tight text-ink">StepCheck</span>
        <nav className="flex items-center gap-4">
          <a
            href="/teacher"
            className="hidden font-mono text-xs uppercase tracking-[0.15em] text-ink-muted hover:text-ink sm:inline"
          >
            For teachers
          </a>
          <Button size="sm" onClick={onStart}>
            Check my work
          </Button>
        </nav>
      </header>

      {/* Two-column hero: pitch left, marked-page artifact right. */}
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div className="flex flex-col items-start gap-6 text-left">
          <span className="rounded-full border-2 border-ink bg-brand-soft/40 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink">
            Made for students, marked like a teacher
          </span>

          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
            Marked{" "}
            <span className="relative inline-block">
              <span className="relative z-10">line by line</span>
              <span
                className="absolute inset-x-0 bottom-1 h-3 bg-brand"
                aria-hidden
              />
            </span>
            , like a marker would.
          </h1>

          <p className="max-w-md text-lg text-ink-muted">
            Photograph your working and get a tick or a cross on{" "}
            <strong className="text-ink">every step</strong> — not just a
            final grade. When something slips, you see exactly where, why,
            and how to fix it.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="accent" size="lg" onClick={onStart} className="px-8">
              Check my work
            </Button>
            <Button variant="outline" size="lg" onClick={onStartTyped}>
              Type a problem instead
            </Button>
          </div>

          {/* Stats strip: one bordered 3-cell table, MockClub-style. */}
          <div className="grid w-full max-w-md grid-cols-3 divide-x-2 divide-ink border-2 border-ink bg-white shadow-brut">
            {STATS.map((stat) => (
              <div key={stat.caption} className="flex flex-col gap-1 p-4">
                <span className="font-display text-2xl font-bold text-ink sm:text-3xl">
                  {stat.figure}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                  {stat.caption}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* The hero object: a marked page, dramatized as a physical artifact. */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full max-w-sm rounded-lg border-2 border-ink bg-white shadow-brut-brand" aria-hidden>
            {/* Card header — mono label row. */}
            <div className="flex items-center justify-between border-b-2 border-ink px-5 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink">
                Marked work
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted">
                {demo.label}
              </span>
            </div>

            {/* Steps with the marking rail — remounted per demoIndex so the
                mark-in draw replays; no second animation system. */}
            <div className="flex flex-col gap-3 p-5">
              {demo.steps.map((step, i) => (
                <div
                  key={`${demoIndex}-${i}`}
                  className="flex items-center gap-3 rounded-md border border-hairline-soft bg-surface-soft p-3 text-sm"
                >
                  <div className="flex w-5 flex-shrink-0 justify-center border-r border-hairline pr-3">
                    <StepMark status={step.status} delayMs={i * 350} />
                  </div>
                  <code className="font-mono text-sm text-ink">{step.latex}</code>
                </div>
              ))}
            </div>

            {/* Verdict stamp — rotated rubber-stamp badge. */}
            <span
              key={`stamp-${demoIndex}`}
              className={`absolute -right-3 bottom-14 rotate-[-8deg] rounded-md border-2 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
                demo.stampTone === "correct"
                  ? "border-mark-correct bg-white text-mark-correct"
                  : "border-mark-error bg-white text-mark-error"
              }`}
            >
              {demo.stamp}
            </span>

            {/* Fine-print footer strip. */}
            <div className="rounded-b-[6px] bg-ink px-5 py-2 font-mono text-[9px] uppercase tracking-[0.15em] text-white">
              Every step checked · Not just the answer
            </div>
          </div>

          {/* Carousel dots. */}
          <div className="flex items-center gap-2">
            {DEMO_PROBLEMS.map((p, i) => (
              <button
                key={p.label}
                type="button"
                aria-label={`Show ${p.label.toLowerCase()} example`}
                onClick={() => setDemoIndex(i)}
                className={
                  i === demoIndex
                    ? "h-1.5 w-6 rounded-full bg-ink"
                    : "h-1.5 w-1.5 rounded-full bg-ink/30 hover:bg-ink/60"
                }
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Pass the second CTA from `page.tsx`**

In the landing branch (line 620), change:

```tsx
<LandingHero onStart={() => setScreen("upload")} onStartTyped={startTyped} />
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build` — pass.
Browser check at desktop width (1280px): ticker bar, nav row, two-column hero with the marked-page card right, stats strip left, dots cycling every ~5s and clickable, stamp swapping between red/green. At mobile width (375px): single column, pitch above card, nothing overflows horizontally. HistoryList and the teacher link still render below the hero.

- [ ] **Step 4: Commit**

```bash
git add components/LandingHero.tsx app/page.tsx
git commit -m "feat: two-column landing hero with marked-page artifact, ticker, stats strip"
```

### Task 5: Wider shell + horizontal header bar

**Files:**
- Modify: `app/page.tsx` (`header` const lines 566–615; `<main>` wrappers at lines 636, 687, 801)

**Interfaces:**
- Consumes: nothing new. Produces: all inner screens render inside `max-w-6xl`; upload keeps a narrow centered card.

- [ ] **Step 1: Make the header one horizontal bar**

Replace the `header` const's outer structure (keep the back button, title block, and chips exactly as they are — only the wrappers change):

```tsx
const header = (
  <header className="flex flex-wrap items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      {/* …existing back button unchanged… */}
      {/* …existing title + tagline div unchanged… */}
    </div>

    {/* …existing <nav aria-label="Progress"> chips unchanged… */}
  </header>
);
```

(i.e. the outer `flex flex-col gap-4` becomes `flex flex-wrap items-center justify-between gap-4`; on narrow screens the chips wrap below the title naturally.)

- [ ] **Step 2: Widen the three screen shells**

- Upload `<main>` (line 636): `className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6"` and wrap the upload `<section>` card in `<div className="mx-auto w-full max-w-3xl">…</div>` so the dropzone stays a comfortable reading width inside the wide shell.
- Confirm `<main>` (line 687): `max-w-2xl` → `max-w-6xl`, `py-10 sm:py-16` → `py-8`.
- Results `<main>` (line 801): same change.

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check: on desktop, upload/confirm/results screens now span ~1152px with the header title left and progress chips right; ~140px of vertical space reclaimed. Mobile unchanged.

```bash
git add app/page.tsx
git commit -m "style: widen screen shells to max-w-6xl with horizontal header bar"
```

### Task 6: Confirm screen — sticky photo beside the fields

**Files:**
- Modify: `app/page.tsx` confirm branch (lines 684–796)

**Interfaces:**
- Consumes: Task 5's wide shell. Produces: two-column confirm layout; photo `lg:sticky`.

- [ ] **Step 1: Restructure the confirm branch**

The screen's job is "compare each field against your photo", so the photo gets its own sticky column instead of a scrolled-away thumbnail. Replace the single `<section>` with:

```tsx
{transcribeResult && (
  <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
    {/* Photo column — sticky on desktop so it stays visible while the
        student scrolls the step fields against it. */}
    {image && (
      <div className="lg:sticky lg:top-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.previewUrl}
          alt="Your uploaded photo"
          className="w-full rounded-lg border-2 border-ink bg-white object-contain shadow-brut"
        />
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
          Your photo — compare each field against it
        </p>
      </div>
    )}

    <section className={`flex flex-col gap-5 rounded-lg border-2 border-ink bg-white shadow-brut p-6 ${image ? "" : "lg:col-span-2 lg:mx-auto lg:w-full lg:max-w-3xl"}`}>
      {/* …everything currently inside the section EXCEPT the old inline
          <img> block (lines 710–717), which is deleted: the heading div,
          shaky-transcription warning, prose+math fields (Task 2), step
          fields, add/remove buttons, Confirm/hint buttons, timing note,
          LoadingNote — all unchanged, in the same order… */}
    </section>
  </div>
)}
```

Key points: the old `max-h-40` thumbnail is deleted; the typed-path (no image) case spans/centers via the conditional classes; mobile order is photo-then-fields (photo div first).

- [ ] **Step 2: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check: upload a multi-step photo → confirm screen on desktop shows the photo large on the left, staying pinned while scrolling the fields; on mobile it stacks. Typed path (no photo) shows one centered column.

```bash
git add app/page.tsx
git commit -m "feat: confirm screen splits into sticky photo + fields columns on desktop"
```

### Task 7: Results screen — marked page left, guidance rail right

**Files:**
- Modify: `app/page.tsx` results branch (lines 798–1217)

**Interfaces:**
- Consumes: Tasks 5–6. Produces: results content in a `lg:` 7/5 grid; the analysis `<section>` is split into a left "marked page" section and right-rail cards. Waiting-experience tasks (9–14) mount into these named slots.

- [ ] **Step 1: Introduce the grid and relocate existing blocks**

Directly under `{header}` in the results branch, wrap ALL existing sections in:

```tsx
<div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8">
  <div className="flex min-w-0 flex-col gap-8">
    {/* LEFT COLUMN */}
  </div>
  <div className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-6">
    {/* RIGHT RAIL */}
  </div>
</div>
```

Distribute the existing JSX blocks **unchanged internally**:

- LEFT: the loading section (`{(isWorking || isHinting) && …}`), the error section (`{resultError && …}`), the solved section (`{solved && …}`), the hints section (`{hints && …}`), and — from the analysis section — the verdict banner + marked-steps list + the bottom "Next problem / Check another problem" button row, kept together as one `<section className="flex flex-col gap-4 rounded-lg border-2 border-ink bg-white shadow-brut p-6">`.
- RIGHT RAIL: from the analysis section, the misconception/fix-it card (`{!analysis.isCorrect && (<div className="flex flex-col gap-3 rounded-md border-2 border-mark-flag …">…)}`) and the practice card (`{!analysis.isCorrect && analysis.misconceptionSummary && …}`) — each promoted from `rounded-md` inner divs to standalone `<section className="… rounded-lg border-2 border-ink bg-white shadow-brut p-6">` cards wrapping their existing inner content, gated with `{analysis && confirmed?.steps && !analysis.isCorrect && …}` since they leave the parent's scope — plus the follow-up chat section (`{(analysis || solved) && …}`, unchanged).

- [ ] **Step 2: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check: run an analyze with a wrong step. Desktop: verdict + marked steps left; misconception/fix, practice, chat right, rail sticky while the left column scrolls. All interactions still work: fix-and-recheck, explain box, practice fetch, chat, retry-on-error, hints path, solve path. Mobile: single column in the order left-then-rail.

```bash
git add app/page.tsx
git commit -m "feat: results screen 7/5 desktop grid — marked page left, guidance rail right"
```

---

## Phase 3 — Waiting experience

### Task 8: Honest progress — duration samples + WaitProgress bar

**Files:**
- Create: `lib/durations.ts`
- Create: `components/WaitProgress.tsx`
- Modify: `app/page.tsx` (`runResult`, loading section)

**Interfaces:**
- Consumes: loading section slot (Task 7 LEFT column).
- Produces: `saveDuration(sample: { kind: "analyze" | "solve"; stepCount: number; ms: number }): void` and `estimateMs(kind: "analyze" | "solve", stepCount: number): number` in `lib/durations.ts`; `<WaitProgress kind stepCount />` component.

- [ ] **Step 1: Create `lib/durations.ts`**

```ts
export type WorkKind = "analyze" | "solve";

export interface DurationSample {
  kind: WorkKind;
  stepCount: number;
  ms: number;
}

const KEY = "stepcheck-durations";
const MAX_SAMPLES = 24;
// Before any local samples exist, assume a long check — overestimating and
// finishing "early" always feels better than a bar that stalls at 100%.
const FALLBACK_MS = 150_000;

function load(): DurationSample[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is DurationSample =>
        typeof s === "object" &&
        s !== null &&
        ((s as DurationSample).kind === "analyze" || (s as DurationSample).kind === "solve") &&
        typeof (s as DurationSample).stepCount === "number" &&
        typeof (s as DurationSample).ms === "number" &&
        (s as DurationSample).ms > 0
    );
  } catch {
    return [];
  }
}

export function saveDuration(sample: DurationSample): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([sample, ...load()].slice(0, MAX_SAMPLES)));
  } catch {
    // Quota failures just mean no calibration — never break the flow.
  }
}

/** Median of past same-kind checks on this device; FALLBACK_MS when unknown. */
export function estimateMs(kind: WorkKind, stepCount: number): number {
  const same = load().filter((s) => s.kind === kind);
  if (same.length === 0) return FALLBACK_MS;
  const sorted = same.map((s) => s.ms).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
```

- [ ] **Step 2: Create `components/WaitProgress.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { estimateMs, type WorkKind } from "@/lib/durations";

function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Elapsed timer + progress bar against a device-calibrated estimate of how
 * long this kind of check usually takes. The bar caps at 92% — we genuinely
 * don't know the remaining time, and a full-looking stalled bar reads as a
 * hang (the exact failure this component exists to prevent).
 */
export default function WaitProgress({ kind, stepCount }: { kind: WorkKind; stepCount: number }) {
  const [elapsed, setElapsed] = useState(0);
  const estimate = useMemo(() => estimateMs(kind, stepCount), [kind, stepCount]);

  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [kind]);

  const pct = Math.min(92, ((elapsed * 1000) / estimate) * 100);
  const estimateMin = Math.max(1, Math.round(estimate / 60_000));

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="h-2 w-full overflow-hidden rounded-full border border-ink bg-surface">
        <div
          className="h-full bg-brand transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
        {fmt(elapsed)} elapsed · usually ~{estimateMin} min on this device
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Wire measurement + render**

In `page.tsx`:
- Import `WaitProgress` and `saveDuration`.
- In `runResult`, add `const startedAt = Date.now();` before the `try`, and after each success (`setAnalysis(streamed)`, `setAnalysis(data)`, `setSolved(data)`) add respectively:

```ts
saveDuration({ kind: "analyze", stepCount: stepsToUse?.length ?? 0, ms: Date.now() - startedAt });
```

(or `kind: "solve"` in the solve branch).
- In the loading section, replace `<LoadingNote label="This usually takes under a minute, but can take longer." />` with:

```tsx
<WaitProgress
  kind={confirmed?.steps ? "analyze" : "solve"}
  stepCount={confirmed?.steps?.length ?? 0}
/>
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check: start a check → loading card shows a ticking `0:07 elapsed · usually ~3 min` line and a slowly filling mint bar that never passes ~92%. After one completed check, localStorage `stepcheck-durations` has a sample and the next estimate reflects it.

```bash
git add lib/durations.ts components/WaitProgress.tsx app/page.tsx
git commit -m "feat: honest wait progress — elapsed timer against device-calibrated estimate"
```

### Task 9: Streamed marked page — extract MarkedStep, promote the live view

**Files:**
- Create: `components/MarkedStep.tsx`
- Modify: `app/page.tsx` (results analysis map lines 1004–1029; loading live-feedback block lines 833–853)

**Interfaces:**
- Consumes: `StepFeedback` shape, `liveFeedback` state, `MathView`, `StepMark`.
- Produces: `MarkedStep({ index, latex, status?, explanation?, delayMs = 0 })` — used by BOTH the final results list and the streaming loading view, so the wait shows the real marked page assembling itself.

- [ ] **Step 1: Create `components/MarkedStep.tsx`**

```tsx
"use client";

import dynamic from "next/dynamic";
import StepMark from "@/components/StepMark";

const MathView = dynamic(() => import("@/components/MathView"), { ssr: false });

interface MarkedStepProps {
  index: number;
  latex: string;
  /** Undefined while the marker hasn't reached this step yet (streaming). */
  status?: "correct" | "incorrect" | "not_reached";
  explanation?: string;
  delayMs?: number;
}

/**
 * One step of the student's work with its marking-rail tick/cross — the
 * single "your work, marked" unit shared by the final results list and the
 * live streaming view, so marks arriving mid-wait look identical to the
 * finished page.
 */
export default function MarkedStep({ index, latex, status, explanation, delayMs = 0 }: MarkedStepProps) {
  return (
    <div className="flex gap-3 rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm">
      <div className="flex w-5 flex-shrink-0 justify-center border-r border-hairline pr-3">
        {status && <StepMark status={status} delayMs={delayMs} />}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-ink">
          Step {index + 1}
          {status ? ` — ${status.replace("_", " ")}` : " — being checked…"}
        </p>
        <div className="rounded-md border border-hairline-soft bg-white px-3 py-2 text-ink">
          <MathView latex={latex} />
        </div>
        {explanation && <p className="text-ink-muted">{explanation}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Use it in the final results list**

Replace the body of the `confirmed.steps.map` in the analysis section (lines 1005–1028) with:

```tsx
{confirmed.steps.map((stepLatex, i) => {
  const fb = analysis.stepByStepFeedback.find((f) => f.stepIndex === i);
  return (
    <div key={i} className="screen-transition" style={{ animationDelay: `${i * 80}ms` }}>
      <MarkedStep
        index={i}
        latex={stepLatex}
        status={fb?.status}
        explanation={fb?.explanation}
        delayMs={i * 120}
      />
    </div>
  );
})}
```

- [ ] **Step 3: Promote the loading card's live view**

Replace the thin live-feedback list (lines 833–853, the `{confirmed?.steps && liveFeedback.length > 0 && …}` block) with the full marked page assembling in place — shown as soon as steps exist, not only after the first mark:

```tsx
{confirmed?.steps && (
  <div className="flex w-full flex-col gap-3 text-left">
    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
      Marking your page — {liveFeedback.length} of {confirmed.steps.length} steps checked
    </p>
    {confirmed.steps.map((stepLatex, i) => {
      const fb = liveFeedback.find((f) => f.stepIndex === i);
      return (
        <MarkedStep
          key={i}
          index={i}
          latex={stepLatex}
          status={fb?.status}
          explanation={fb?.explanation}
          delayMs={0}
        />
      );
    })}
  </div>
)}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check (analyze path with 3+ steps): during the wait the loading card shows every step's actual math immediately, each flipping from "being checked…" to a drawn tick/cross with its explanation as the stream delivers it; the final results list looks visually identical to the streamed one.

```bash
git add components/MarkedStep.tsx app/page.tsx
git commit -m "feat: stream the marked page itself during the analyze wait"
```

### Task 10: Solve-path streaming

**Files:**
- Create: `app/api/solve-stream/route.ts`
- Modify: `app/page.tsx` (`runResult` solve branch; `SolveResult`/`SolveStep` already defined at lines 47–56; loading card)

**Interfaces:**
- Consumes: `PLAIN_LANGUAGE_RULE` from `lib/prompts` (already used by analyze-stream), `MODEL` from `lib/gemini`; `MarkedStep` is NOT used here (solve steps aren't marks — no verdict framing, per LOCKS).
- Produces: `POST /api/solve-stream` emitting NDJSON lines `{"stepIndex": number, "workLatex": string, "explanation": string}` then `{"final": true, "finalAnswerLatex": string}`; client `streamSolve(text, latex): Promise<SolveResult | null>`; `liveSolveSteps: SolveStep[]` state.

- [ ] **Step 1: Create `app/api/solve-stream/route.ts`**

Model it directly on `app/api/analyze-stream/route.ts` (same no-retry rationale — the client falls back to classic `/api/solve`, which has retries and salvage):

```ts
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { MODEL } from "@/lib/gemini";
import { PLAIN_LANGUAGE_RULE } from "@/lib/prompts";

export const runtime = "nodejs";
// Same rationale as /api/solve — the stream stays open just as long.
export const maxDuration = 180;

// ponytail: no retries and no JSON salvage here — a broken stream makes the
// client silently fall back to the classic /api/solve, which has both.
const INSTRUCTION = `You are a careful math tutor. Solve the problem below
from scratch, showing your work as a sequence of clear steps a student could
follow. Keep steps small — one algebraic move per step.

${PLAIN_LANGUAGE_RULE}

Output NDJSON: one complete JSON object PER LINE, no commentary, no markdown
fences, no blank lines, in exactly this order:

1. For each solution step, in order, 0-based stepIndex, one line:
{"stepIndex": number, "workLatex": string, "explanation": string}

"workLatex" is the math for that step in LaTeX. "explanation" is plain
natural language, never LaTeX.

2. Then exactly one final line:
{"final": true, "finalAnswerLatex": string}`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  const { problemStatementLatex } = await request.json();

  if (!problemStatementLatex || typeof problemStatementLatex !== "string") {
    return NextResponse.json(
      { error: "problemStatementLatex is required." },
      { status: 400 }
    );
  }

  const prompt = `${INSTRUCTION}\n\nProblem statement:\n${problemStatementLatex}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContentStream({
      model: MODEL,
      contents: prompt,
      config: { temperature: 0 },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Client `streamSolve` + live state**

In `page.tsx`, add state next to `liveFeedback`:

```ts
// Solve steps that have arrived so far over the solve stream.
const [liveSolveSteps, setLiveSolveSteps] = useState<SolveStep[]>([]);
```

Add `setLiveSolveSteps([])` alongside every existing `setLiveFeedback([])` reset (in `loadQueueItem`, `runResult`, `startOver`).

Add `streamSolve`, mirroring `streamAnalyze`'s reader loop and end-of-stream flush exactly:

```ts
// Returns a full SolveResult if the stream produced a complete, valid
// solution; null on ANY shortfall — the caller then falls back to the
// classic /api/solve, which has retries and JSON salvage.
async function streamSolve(problemToUse: string): Promise<SolveResult | null> {
  const res = await fetch("/api/solve-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ problemStatementLatex: problemToUse }),
  });
  if (!res.ok || !res.body) return null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const steps: SolveStep[] = [];
  let finalLine: Record<string, unknown> | null = null;

  const handleLine = (line: string) => {
    const t = line.trim().replace(/^```(?:json)?|```$/g, "").trim();
    if (!t) return;
    try {
      const obj = JSON.parse(t);
      if (
        obj &&
        typeof obj.stepIndex === "number" &&
        typeof obj.workLatex === "string" &&
        typeof obj.explanation === "string"
      ) {
        steps.push(obj);
        setLiveSolveSteps([...steps]);
      } else if (obj && obj.final === true) {
        finalLine = obj;
      }
    } catch {
      // Partial or junk line — ignore; completeness is checked at the end.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handleLine);
  }
  // The stream usually ends WITHOUT a trailing newline — flush the buffer.
  handleLine(buffer + decoder.decode());

  const fin = finalLine as Record<string, unknown> | null;
  if (!fin || steps.length === 0 || typeof fin.finalAnswerLatex !== "string") return null;

  return { steps, finalAnswerLatex: fin.finalAnswerLatex as string };
}
```

In `runResult`'s solve branch, mirror the analyze branch's stream-then-fallback shape:

```ts
} else {
  const streamed = await streamSolve(problemToUse).catch(() => null);
  if (streamed) {
    setSolved(streamed);
    saveDuration({ kind: "solve", stepCount: 0, ms: Date.now() - startedAt });
    saveHistoryEntry({
      at: Date.now(),
      problemLatex: latex,
      problemText: text,
      outcome: "solved",
      misconceptionSummary: null,
    });
  } else {
    setLiveSolveSteps([]);
    // …existing classic /api/solve fetch + handling, unchanged…
  }
}
```

- [ ] **Step 3: Show arriving solve steps in the loading card**

In the loading section, after the streamed-marked-page block (Task 9), add:

```tsx
{!confirmed?.steps && liveSolveSteps.length > 0 && (
  <div className="flex w-full flex-col gap-3 text-left">
    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
      Working the solution — {liveSolveSteps.length} steps so far
    </p>
    {liveSolveSteps.map((step) => (
      <div key={step.stepIndex} className="rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm">
        <p className="font-medium text-ink">Step {step.stepIndex + 1}</p>
        <div className="mt-1 rounded-md border border-hairline-soft bg-white px-3 py-2">
          <MathView latex={step.workLatex} />
        </div>
        <p className="mt-1 text-ink-muted">{step.explanation}</p>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check (typed path, no steps): confirm a problem → solve steps appear one by one during the wait, then the final solved card renders. Kill the dev server's network mid-stream (devtools offline) → the classic fallback error path still works.

```bash
git add app/api/solve-stream/route.ts app/page.tsx
git commit -m "feat: stream solve steps live with automatic fallback to classic /api/solve"
```

### Task 11: Prediction game — call the slip before the marker does

**Files:**
- Modify: `app/page.tsx` (new state; loading section; analysis verdict banner)

**Interfaces:**
- Consumes: `confirmed.steps`, `analysis.firstErrorStepIndex`, loading card slot.
- Produces: `prediction: number | "all" | null` state (a 0-based step index, "all correct", or no bet).

- [ ] **Step 1: Add state and reset**

```ts
// The student's pre-result bet on where the first slip is: a 0-based step
// index, "all" for "I think it's all correct", or null for no bet placed.
const [prediction, setPrediction] = useState<number | "all" | null>(null);
```

Add `setPrediction(null)` in `loadQueueItem`, at the top of `runResult`, and in `startOver`.

- [ ] **Step 2: The bet UI in the loading card**

In the loading section, above the streamed marked page (analyze mode only), add:

```tsx
{confirmed?.steps && prediction === null && (
  <div className="flex w-full flex-col gap-2 rounded-md border-2 border-ink bg-brand-soft/20 p-4 text-left">
    <p className="text-sm font-medium text-ink">
      While the marker works — where do you think the first slip is?
    </p>
    <div className="flex flex-wrap gap-2">
      {confirmed.steps.map((_, i) => (
        <Button key={i} variant="outline" size="sm" onClick={() => setPrediction(i)}>
          Step {i + 1}
        </Button>
      ))}
      <Button variant="secondary" size="sm" onClick={() => setPrediction("all")}>
        All correct
      </Button>
    </div>
  </div>
)}
{confirmed?.steps && prediction !== null && !analysis && (
  <p className="w-full text-left text-sm text-ink-muted">
    Your call:{" "}
    <strong className="text-ink">
      {prediction === "all" ? "all correct" : `first slip at step ${prediction + 1}`}
    </strong>
    {" — let's see what the marker says."}
  </p>
)}
```

- [ ] **Step 3: The reveal on the results verdict**

Directly under the verdict banner div in the analysis section, add:

```tsx
{prediction !== null && (
  <p className="rounded-md border border-hairline-soft bg-surface-soft px-4 py-2 text-sm">
    {(prediction === "all" ? analysis.isCorrect : analysis.firstErrorStepIndex === prediction) ? (
      <span className="font-medium text-mark-correct">
        You called it — your self-check instincts are sharp.
      </span>
    ) : (
      <span className="text-ink-muted">
        You guessed{" "}
        {prediction === "all" ? "all correct" : `step ${(prediction as number) + 1}`}
        {analysis.isCorrect
          ? " — but every step actually holds up."
          : ` — the marker found the first slip at step ${(analysis.firstErrorStepIndex ?? 0) + 1}. Compare the two: that gap is worth understanding.`}
      </span>
    )}
  </p>
)}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check: analyze path → bet chips appear during the wait, picking one swaps to the "your call" line, and the results verdict shows the right/wrong-call comparison. Solve path shows no bet UI.

```bash
git add app/page.tsx
git commit -m "feat: prediction game — bet on the first slip while Gemma marks"
```

### Task 12: Recent-slips review card during the wait

**Files:**
- Create: `components/WaitReview.tsx`
- Modify: `app/page.tsx` (results RIGHT RAIL, loading state)

**Interfaces:**
- Consumes: `loadHistory` from `lib/history.ts`; Task 7's right rail.
- Produces: `<WaitReview />` — self-contained, renders `null` when there's nothing to show.

- [ ] **Step 1: Create `components/WaitReview.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { loadHistory, type HistoryEntry } from "@/lib/history";

/**
 * "While you wait" card: the student's own recent slips from localStorage,
 * surfaced during the long Gemma wait so the dead time becomes a short,
 * personally relevant review. Zero API cost. Renders nothing for students
 * with no recorded misconceptions yet.
 */
export default function WaitReview() {
  const [slips, setSlips] = useState<HistoryEntry[]>([]);

  // Loaded in an effect (not at render) so the server and first client
  // render agree — localStorage doesn't exist during SSR.
  useEffect(() => {
    setSlips(loadHistory().filter((e) => e.misconceptionSummary).slice(0, 3));
  }, []);

  if (slips.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-white p-6 text-sm shadow-brut">
      <div>
        <p className="font-medium text-ink">While you wait — your recent slips</p>
        <p className="mt-1 text-ink-muted">
          A quick re-read now is the cheapest revision you&apos;ll do today.
        </p>
      </div>
      {slips.map((entry) => (
        <div key={entry.at} className="rounded-md border border-hairline-soft bg-surface-soft p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
            {new Date(entry.at).toLocaleDateString()}
          </p>
          <p className="mt-1 text-ink-muted">{entry.misconceptionSummary}</p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Mount it in the right rail during the wait**

In the results branch's RIGHT RAIL column (Task 7), add as the first entry:

```tsx
{(isWorking || isHinting) && !analysis && !solved && !hints && !resultError && <WaitReview />}
```

with `import WaitReview from "@/components/WaitReview";` at the top.

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check: after at least one incorrect-outcome check exists in history, start a new check → the rail shows up to 3 recent misconception summaries during the wait and hides once results arrive. With empty history, nothing renders.

```bash
git add components/WaitReview.tsx app/page.tsx
git commit -m "feat: recent-slips review card fills the wait from local history"
```

### Task 13: Done-notifications + tab title

**Files:**
- Modify: `app/page.tsx` (notify ref + helpers, loading card button, `runResult`/`runHints` completions)

**Interfaces:**
- Consumes: loading card slot; result arrival points in `runResult`.
- Produces: `notifyRef: React.MutableRefObject<boolean>`, `enableNotify()`, `announceDone(body: string)`.

- [ ] **Step 1: Add the plumbing**

In `page.tsx` (add `useRef`, `useEffect` to the react import):

```ts
// Ref, not state: runResult's closure must see the value set by the
// "ping me" button mid-flight, after the closure was created.
const notifyRef = useRef(false);
const [notifyStatus, setNotifyStatus] = useState<"idle" | "on" | "denied">("idle");

async function enableNotify() {
  if (!("Notification" in window)) return;
  const permission = await Notification.requestPermission();
  notifyRef.current = permission === "granted";
  setNotifyStatus(permission === "granted" ? "on" : "denied");
}

// Browser notification + tab title flip for students who tabbed away
// during the multi-minute wait. Title resets when they return.
function announceDone(body: string) {
  document.title = "✓ Marked — StepCheck";
  const reset = () => {
    if (document.visibilityState === "visible") {
      document.title = "StepCheck";
      document.removeEventListener("visibilitychange", reset);
    }
  };
  document.addEventListener("visibilitychange", reset);
  if (document.visibilityState === "visible") document.title = "StepCheck";
  if (
    notifyRef.current &&
    document.visibilityState === "hidden" &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    new Notification("StepCheck", { body });
  }
}
```

Add a title effect near the other state:

```ts
useEffect(() => {
  if (isWorking || isHinting) document.title = "Marking… — StepCheck";
}, [isWorking, isHinting]);
```

- [ ] **Step 2: Call it at every completion point**

In `runResult`, after each success path:
- analyze (both streamed and classic): `announceDone(result.isCorrect ? "Marked: every step holds up." : \`Marked: first slip at step ${(result.firstErrorStepIndex ?? 0) + 1}.\`);` (using the local `streamed`/`data` variable as `result`)
- solve (both streamed and classic): `announceDone("Solved — your worked solution is ready.");`
- both error paths (`setResultError(...)`): `announceDone("StepCheck hit a problem — tap to retry.");`

In `runHints`' success path: `announceDone("Your hints are ready.");`

- [ ] **Step 3: The opt-in button in the loading card**

In the loading section, under `WaitProgress`, add:

```tsx
{"Notification" in globalThis && notifyStatus === "idle" && (
  <Button variant="ghost" size="sm" onClick={enableNotify}>
    Ping me when it&apos;s done — feel free to switch tabs
  </Button>
)}
{notifyStatus === "on" && (
  <p className="text-xs text-ink-muted">
    You&apos;ll get a notification when the marking is done.
  </p>
)}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run build` — pass.
Browser check: start a check, click the ping button, accept the permission prompt, switch tabs → tab title reads "Marking… — StepCheck", and on completion a notification fires and the title shows "✓ Marked — StepCheck" until the tab is refocused. With the tab focused, no notification fires and the title just resets.

```bash
git add app/page.tsx
git commit -m "feat: done-notifications and tab-title status for tabbed-away waits"
```

### Task 14: Final sweep — docs and full-flow verification

**Files:**
- Modify: `CLAUDE.md` (architecture notes), `DESIGN.md` (if the landing structure section exists there)

**Interfaces:** none — documentation + verification only.

- [ ] **Step 1: Update CLAUDE.md**

Amend the architecture section: `/api/transcribe` now returns `problemText` + `problemLatex` per problem (prose/math split; downstream routes still take one composed `problemStatementLatex` string via `composeProblem` in `lib/problem.ts`); add `/api/solve-stream` to the streaming note alongside `/api/analyze-stream`; note the desktop `lg:` grid layouts on confirm/results and that mobile remains single-column.

- [ ] **Step 2: Full-flow browser pass**

With `npm run dev`: (a) photo path with worked solution → confirm (sticky photo) → analyze with streaming marks, bet placed, progress bar, notification; (b) typed path → solve streaming; (c) hints path; (d) fix-and-recheck loop; (e) teacher page batch on one image; (f) mobile width for every screen; (g) landing carousel + both CTAs. Fix anything broken before committing.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md DESIGN.md
git commit -m "docs: record prose/math split, solve streaming, and desktop grid layouts"
```

---

## Self-Review Notes

- **Spec coverage:** landing structure (Task 4), current fonts/palette (Global Constraints), schema fix without extra Gemma output (Tasks 1–3 — downstream contracts untouched), desktop width (Tasks 5–7), all five waiting ideas: streamed marked page (9), solve streaming (10), prediction game (11), honest progress (8), recent-slips review (12), notifications (13).
- **Type consistency:** `runResult(text, latex, stepsToUse)` and `confirmed: { text, latex, steps }` are defined in Task 2 and consumed by Tasks 6–13 under those exact names; `SolveStep`/`SolveResult` reuse the existing page.tsx interfaces; `WorkKind` is exported from `lib/durations.ts` and consumed by `WaitProgress`.
- **Known judgment calls:** `estimateMs` ignores `stepCount` for now (median-only — the parameter is kept so callers don't churn when calibration by step count lands); prediction game intentionally has no persistence; old history entries render their legacy mashed `problemLatex` unchanged.
