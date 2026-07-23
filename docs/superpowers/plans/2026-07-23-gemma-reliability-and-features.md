# Gemma Reliability + Full Learning-Loop Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Gemma calls stop failing on retryable errors and bad JSON, make the 60–150s wait feel alive, and add the full feature set: fix-and-recheck, practice generation, history with misconception tracking, type-it-in, hint mode, follow-up chat, worksheet (multi-problem) mode, mobile camera + PWA manifest, explain-back check, teacher mode, and streaming step-by-step reveal.

**Architecture:** All reliability work lands in `lib/gemini.ts` (shared by every route) so routes shrink rather than grow. Features reuse the existing four screens and routes wherever possible; each new Gemma capability is one new App Router route following the existing pattern (single instruction prompt → `generateJson` → hand-written guard → 502-with-raw on failure). History is localStorage only. Streaming is a fallback-safe enhancement layered on last.

**Tech Stack:** Next.js 14 App Router, `@google/genai` (Gemma `gemma-4-26b-a4b-it`), MathLive via existing `MathInput`/`MathView`, Tailwind with the project's semantic tokens.

## Global Constraints

- No new npm dependencies. No test framework — this repo has none (CLAUDE.md); verification per task is `npm run lint`, `npm run build`, and a live check against `npm run dev` with the exact command/expected output given in the step.
- Every route that calls Gemma MUST keep/set `export const runtime = "nodejs"` and `export const maxDuration = 180` (CLAUDE.md: serverless timeout kills long Gemma calls otherwise).
- Prose fields in prompts (`explanation`, `hint`, `misconceptionSummary`, `answer`, `feedback`, …) must demand plain natural language, never LaTeX; only fields rendered in math views may be LaTeX. Run `warnIfLooksLikeLatex` on new prose fields.
- Colors only via semantic tokens (`surface`, `hairline`, `ink`, `ink-muted`, `brand`, `mark-correct`, `mark-error`, `mark-flag`); buttons are pills; cards 12px radius (`rounded-lg`), inputs 8px (`rounded-md`).
- No new animation anywhere — `StepMark`'s staggered reveal is the app's one deliberate animation (DESIGN.md §5). Loading states may reuse the existing dot pulse only.
- MathLive components stay client-only: import `MathInput`/`MathView` only via `dynamic(..., { ssr: false })`.
- Import alias `@/*` maps to repo root.
- Ponytail (full) governs implementation: reuse existing helpers/patterns, shortest working diff, mark deliberate ceilings with `// ponytail:` comments.
- Do not change: the four-screen state machine, `goBack()` semantics (never clears state), the transcribe→analyze/solve branching, or the solved-from-scratch screen's "not a verdict" framing.
- Task dependencies: 2 needs 1; 7 needs 6; 13 needs 4; 14 needs 11; 15 needs 2 and 6. Everything else is order-independent but written assuming numerical order.

---

### Task 1: Harden `generateWithRetry` (429s + real backoff + deterministic output)

**Files:**
- Modify: `lib/gemini.ts:5-6` (constants), `lib/gemini.ts:51-76` (`generateWithRetry`)

**Interfaces:**
- Consumes: existing `statusOf`, `sleep`, `MODEL` in the same file.
- Produces: `generateWithRetry(ai, contents): Promise<string>` — signature unchanged; every existing route keeps working with zero edits.

Why: today only 5xx/undefined-status errors retry, twice, with a fixed 1.5s delay. 429 (rate limiting — the most common free-tier AI Studio failure) throws immediately, and 1.5s is too short for an overloaded backend. Also, grading should be deterministic, so pin `temperature: 0`.

- [ ] **Step 1: Replace the retry constants and loop**

In `lib/gemini.ts`, replace lines 5–6:

```ts
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
```

with:

```ts
const MAX_RETRIES = 3;
// ponytail: fixed backoff schedule + jitter, no Retry-After header parsing —
// parse the header if 429s still surface after this lands.
const RETRY_DELAYS_MS = [2000, 6000, 15000];
```

Then replace the whole `generateWithRetry` function (lines 51–76) with:

```ts
export async function generateWithRetry(
  ai: GoogleGenAI,
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"]
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        // Grading must be repeatable, and temperature 0 also reduces
        // JSON-format drift in responses.
        config: { temperature: 0 },
      });
      const durationMs = Date.now() - start;
      if (durationMs > 60_000) {
        console.warn(`[gemini-timing] generateContent took ${durationMs}ms (attempt ${attempt})`);
      }
      const text = response.text;
      if (!text) throw new Error("Gemma returned an empty response.");
      return text;
    } catch (error) {
      lastError = error;
      const status = statusOf(error);
      // Retry server errors, network/unknown errors, and rate limiting.
      const isRetryable = status === undefined || status >= 500 || status === 429;
      if (!isRetryable || attempt === MAX_RETRIES) throw error;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      await sleep(delay + Math.random() * 1000);
    }
  }
  throw lastError;
}
```

- [ ] **Step 2: Verify lint and types**

Run: `npm run lint && npm run build`
Expected: lint passes; build completes with no type errors.

- [ ] **Step 3: Live smoke test one route**

With `npm run dev` running and `GEMINI_API_KEY` set in `.env.local`:

```bash
curl -s -X POST localhost:3000/api/solve \
  -H 'Content-Type: application/json' \
  -d '{"problemStatementLatex": "2x + 3 = 11"}'
```

Expected: after a wait (can be 60s+), JSON with `"steps": [...]` and `"finalAnswerLatex"` containing `4` (e.g. `x = 4`). No error field.

- [ ] **Step 4: Commit**

```bash
git add lib/gemini.ts
git commit -m "fix: retry Gemma calls on 429 with exponential backoff, pin temperature 0"
```

---

### Task 2: JSON salvage + one regeneration on invalid output, shared by all three routes

**Files:**
- Modify: `lib/gemini.ts` (add `extractJsonObject`, `JsonOutcome`, `generateJson`)
- Modify: `app/api/analyze/route.ts:148-179`
- Modify: `app/api/solve/route.ts:103-128`
- Modify: `app/api/transcribe/route.ts:85-113`

**Interfaces:**
- Consumes: `generateWithRetry` from Task 1 (unchanged signature), each route's existing type guard (`isAnalysisResult`, `isSolveResult`, `isTranscribeResult`).
- Produces:
  - `extractJsonObject(raw: string): string` — best-effort outermost `{...}` slice after `stripFences`.
  - `type JsonOutcome<T> = { ok: true; value: T } | { ok: false; raw: string }`
  - `generateJson<T>(ai: GoogleGenAI, contents, guard: (v: unknown) => v is T): Promise<JsonOutcome<T>>` — throws only on API-level failure (routes keep their existing 500 path); returns `{ ok: false, raw }` only after salvage + one full regeneration both fail (routes' 502 path). Tasks 5, 9, 10, 13, 14 also consume this.

Why: today a successful API call whose text is slightly malformed (JSON wrapped in a sentence, trailing commentary, guard mismatch) is an instant dead-end 502. Salvaging the `{...}` substring plus one regeneration converts most of these into successes.

- [ ] **Step 1: Add the helpers to `lib/gemini.ts`**

Append after `generateWithRetry`:

```ts
/**
 * Best-effort recovery of a JSON object from a response that may wrap it in
 * prose or fences ("Sure! Here is the JSON: { ... } Hope that helps").
 * Returns the cleaned input unchanged when no outer braces are found, so
 * JSON.parse still produces the natural error.
 */
export function extractJsonObject(raw: string): string {
  const cleaned = stripFences(raw);
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last <= first) return cleaned;
  return cleaned.slice(first, last + 1);
}

export type JsonOutcome<T> = { ok: true; value: T } | { ok: false; raw: string };

/**
 * generateWithRetry + salvage + parse + shape-guard, with ONE full
 * regeneration if the first response is unparseable or fails the guard.
 * Throws on API-level failure (network/4xx/5xx after retries) — callers keep
 * their existing 500 handling. Returns { ok: false } only when Gemma
 * answered twice and both answers were structurally unusable (callers' 502).
 *
 * ponytail: regeneration, not a cheaper "repair this JSON" second prompt —
 * add the repair prompt if double-generation latency shows up in practice.
 */
export async function generateJson<T>(
  ai: GoogleGenAI,
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
  guard: (value: unknown) => value is T
): Promise<JsonOutcome<T>> {
  let raw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    raw = await generateWithRetry(ai, contents);
    try {
      const parsed: unknown = JSON.parse(extractJsonObject(raw));
      if (guard(parsed)) return { ok: true, value: parsed };
      console.warn(`[gemini-json] response failed shape guard (attempt ${attempt})`);
    } catch {
      console.warn(`[gemini-json] response was not parseable JSON (attempt ${attempt})`);
    }
  }
  return { ok: false, raw };
}
```

- [ ] **Step 2: Rewire `app/api/analyze/route.ts`**

Change the import (line 3) to:

```ts
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";
```

Replace lines 148–179 (from `let raw: string;` through the `isAnalysisResult` 502 block, inclusive) with:

```ts
  let outcome;
  try {
    const ai = new GoogleGenAI({ apiKey });
    outcome = await generateJson(ai, prompt, (v): v is AnalysisResult =>
      isAnalysisResult(v, confirmedSteps.length)
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "Gemma's response wasn't valid analysis JSON, even after retrying.",
        raw: outcome.raw,
      },
      { status: 502 }
    );
  }
  const parsed = outcome.value;
```

The `warnIfLooksLikeLatex` calls and final `return NextResponse.json(parsed)` below stay exactly as they are. `stripFences` is no longer imported (it's used inside `extractJsonObject` now).

- [ ] **Step 3: Rewire `app/api/solve/route.ts` the same way**

Change the import (line 3) to:

```ts
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";
```

Replace lines 103–128 (from `let raw: string;` through the `isSolveResult` 502 block, inclusive) with:

```ts
  let outcome;
  try {
    const ai = new GoogleGenAI({ apiKey });
    outcome = await generateJson(ai, prompt, isSolveResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "Gemma's response wasn't valid solve JSON, even after retrying.",
        raw: outcome.raw,
      },
      { status: 502 }
    );
  }
  const parsed = outcome.value;
```

- [ ] **Step 4: Rewire `app/api/transcribe/route.ts` the same way**

Change the import (line 3) to:

```ts
import { generateJson } from "@/lib/gemini";
```

Replace lines 85–113 (from `let raw: string;` through the `isTranscribeResult` 502 block, inclusive) with:

```ts
  let outcome;
  try {
    const ai = new GoogleGenAI({ apiKey });
    outcome = await generateJson(
      ai,
      createUserContent([createPartFromBase64(imageBase64, mimeType), INSTRUCTION]),
      isTranscribeResult
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "Gemma's response wasn't valid transcription JSON, even after retrying.",
        raw: outcome.raw,
      },
      { status: 502 }
    );
  }
  return NextResponse.json(outcome.value);
```

- [ ] **Step 5: Verify lint, types, and salvage behavior end-to-end**

Run: `npm run lint && npm run build`
Expected: both pass; no unused-import warnings for `stripFences`/`generateWithRetry` in the routes.

With `npm run dev` running, re-run the Task 1 curl for `/api/solve` (expect same success) and:

```bash
curl -s -X POST localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"problemStatementLatex": "2x + 3 = 11", "confirmedSteps": ["2x = 8", "x = 4"]}'
```

Expected: JSON with `"isCorrect": true` and two `stepByStepFeedback` entries. Then regression-check transcribe (script defaults to port 3001 — override):

```bash
STEPCHECK_BASE_URL=http://localhost:3000 node scripts/test-transcribe-batch.mjs
```

Expected: same pass behavior as before this change (no new failures in `test-results.json`).

- [ ] **Step 6: Commit**

```bash
git add lib/gemini.ts app/api/analyze/route.ts app/api/solve/route.ts app/api/transcribe/route.ts
git commit -m "fix: salvage JSON from prose-wrapped responses and regenerate once on invalid output"
```

---

### Task 3: Staged waiting copy + upfront time expectation

**Files:**
- Create: `components/StagedStatus.tsx`
- Modify: `app/page.tsx:370-381` (confirm-screen button area), `app/page.tsx:401-427` (results loading card)

**Interfaces:**
- Consumes: nothing new — sibling of `components/LoadingNote.tsx` (same elapsed-seconds pattern).
- Produces: `<StagedStatus mode="analyze" | "solve" />` — renders the loading card's headline, advancing through honest stage messages by elapsed time. Task 9 reuses `mode="solve"`.

Why: the loading card currently shows one static headline for up to 150s. Messages that change over time read as progress; a known wait ("about 1–2 minutes") is tolerated far better than an unknown one. Honest copy only — never claim a specific step is being compared.

- [ ] **Step 1: Create `components/StagedStatus.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

const STAGES: Record<"analyze" | "solve", Array<[atSeconds: number, label: string]>> = {
  analyze: [
    [0, "Solving the problem independently…"],
    [45, "Comparing against your steps, line by line…"],
    [95, "Still working — longer solutions take longer to mark…"],
  ],
  solve: [
    [0, "Working through the problem from scratch…"],
    [95, "Still working — longer problems take longer…"],
  ],
};

/**
 * Headline for the long results-screen wait. Advances through honest,
 * time-based stage messages so a 60-150s Gemma call reads as progress
 * rather than a hang. Copy is deliberately vague about which step is being
 * processed — we genuinely don't know, and must not pretend to.
 */
export default function StagedStatus({ mode }: { mode: "analyze" | "solve" }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [mode]);

  const current = STAGES[mode].filter(([at]) => seconds >= at).at(-1)!;

  return (
    <p className="font-display text-xl font-semibold tracking-tight text-ink" aria-live="polite">
      {current[1]}
    </p>
  );
}
```

- [ ] **Step 2: Use it on the results loading card**

In `app/page.tsx`, add to the imports near `LoadingNote`:

```tsx
import StagedStatus from "@/components/StagedStatus";
```

In the results-screen loading section (currently lines 415–424), replace the inner `<div>` containing the static `<p className="font-display ...">` headline and its subline with:

```tsx
            <div>
              <StagedStatus mode={confirmed?.steps ? "analyze" : "solve"} />
              <p className="mt-1 text-sm text-ink-muted">
                {confirmed?.steps
                  ? "Gemma is working through your steps line by line, like a marker would."
                  : "Gemma is working through this problem from scratch."}
              </p>
            </div>
```

The pulsing dots above and the `LoadingNote` below stay unchanged.

- [ ] **Step 3: Set the expectation before the wait starts**

In the confirm screen, directly under the `Confirm` button (currently line 370–372), add:

```tsx
              <p className="text-xs text-ink-muted">
                Checking usually takes 1–2 minutes — Gemma solves the whole
                problem itself before marking anything.
              </p>
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run lint && npm run build`
Expected: both pass.

With the dev server running, walk the flow: upload a photo from `test-problems/`, confirm, and watch the results loading card. Expected: headline starts at "Solving the problem independently…", changes at ~45s, dots and seconds counter still present, and the confirm screen shows the 1–2 minutes note before clicking Confirm.

- [ ] **Step 5: Commit**

```bash
git add components/StagedStatus.tsx app/page.tsx
git commit -m "feat: staged waiting copy and upfront time expectation for long Gemma calls"
```

---

### Task 4: Fix-and-recheck — edit the first wrong step on the results screen

**Files:**
- Modify: `app/page.tsx` (state near line 98, `runResult` near line 141, misconception panel near lines 555–576)

**Interfaces:**
- Consumes: existing `runResult(problem, steps)` (unchanged), existing `MathInput` dynamic binding, `analysis.firstErrorStepIndex`, `confirmed.steps`.
- Produces: no new exports — a "Fix it and re-check" block inside the misconception panel. Task 13 appends its explain-back UI to this block. `fixLatex` state is also read by Task 13.

Why: the confirm-screen edit → re-run loop already exists; this surfaces it where the student is looking, prefilled with the exact step that broke. Client-only, zero backend changes — `/api/analyze` re-grades the whole corrected solution, so all marks update consistently. (Skipped: a dedicated cheap "re-check just this step" route — add if the full re-grade wait proves annoying in practice.)

- [ ] **Step 1: Add fix state and clear it on each run**

In `app/page.tsx`, next to the other result state (after line 98):

```tsx
  // Latest edit of the first wrong step, results-screen fix box. Null =
  // untouched, fall back to the step's confirmed LaTeX.
  const [fixLatex, setFixLatex] = useState<string | null>(null);
```

In `runResult`, alongside `setAnalysis(null); setSolved(null);` add:

```tsx
    setFixLatex(null);
```

Add the same line to `startOver()`.

- [ ] **Step 2: Add the fix box to the misconception panel**

Inside the `{!analysis.isCorrect && (...)}` panel, after the "Why" block (currently ends line 574), add a fourth block:

```tsx
                <div>
                  <p className="font-medium text-ink">Fix it and re-check</p>
                  <p className="mt-1 text-ink-muted">
                    Edit step {(analysis.firstErrorStepIndex ?? 0) + 1} below and
                    Gemma will mark your whole solution again.
                  </p>
                  <div className="mt-2 rounded-md border border-hairline-soft bg-white px-3 py-2">
                    <MathInput
                      key={`fix-${analysis.firstErrorStepIndex}`}
                      defaultValue={confirmed.steps[analysis.firstErrorStepIndex ?? 0]}
                      onChange={setFixLatex}
                    />
                  </div>
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={isWorking}
                    onClick={() => {
                      const idx = analysis.firstErrorStepIndex ?? 0;
                      const next = [...confirmed.steps!];
                      next[idx] = fixLatex ?? next[idx];
                      // Keep the confirm screen's editable copies in sync so
                      // goBack() shows the fixed step, not the stale one.
                      setSteps(next);
                      runResult(confirmed.problem, next);
                    }}
                  >
                    Re-check my fix
                  </Button>
                </div>
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run lint && npm run build`
Expected: both pass.

With the dev server running, submit a problem with a deliberately wrong step (on the confirm screen, edit a middle step to something wrong, e.g. change `2x = 8` to `2x = 9`). Expected: results show the cross at that step and the misconception panel now ends with the "Fix it and re-check" box prefilled with the wrong step. Correct it, click "Re-check my fix". Expected: loading card appears, then a fresh result with every step ticked and the green "Correct" banner. Press the back arrow: the confirm screen shows the corrected step.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: fix-and-recheck box on the results screen for the first wrong step"
```

---

### Task 5: Practice generation — `/api/practice` + results-screen section

**Files:**
- Create: `app/api/practice/route.ts`
- Modify: `app/page.tsx` (types near line 47, state near line 98, clearing in `runResult`/`startOver`, new section after the misconception panel)

**Interfaces:**
- Consumes: `generateJson`, `warnIfLooksLikeLatex` from `lib/gemini.ts` (Task 2); `analysis.misconceptionSummary`; existing `MathView`, `LoadingNote`, `Button`.
- Produces: `POST /api/practice` accepting `{ problemStatementLatex: string, misconceptionSummary: string }`, returning `{ problems: [{ problemLatex: string, hint: string }] }` (2–4 entries) or the standard `{ error, raw? }` shapes with 400/500/502.

Why: this is the feature that closes the learning loop — after "here's your misconception", generate fresh problems that drill exactly that skill. Display-only: the student works them on paper and can photograph an attempt like any other problem. (Skipped: piping a practice problem back into the check flow — add when asked.)

- [ ] **Step 1: Create `app/api/practice/route.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";

export const runtime = "nodejs";
// Same rationale as the other Gemma routes: without this, platform default
// serverless timeouts kill long generations mid-flight as gateway 502s.
export const maxDuration = 180;

const INSTRUCTION = `You are a math tutor. A student just got a problem wrong.
You will be given the original problem (LaTeX) and a plain-language summary
of the misconception behind their mistake.

Write exactly 3 NEW practice problems that each exercise the same skill the
misconception describes, at similar difficulty to the original. Do not reuse
the original problem or its numbers. Order them easiest first.

For each problem give:
- problemLatex: the problem statement, in LaTeX.
- hint: ONE sentence nudging the student past their specific misconception.

CRITICAL formatting rule for hint: write it in plain, natural human language,
as if speaking to a student out loud. Never use LaTeX syntax, dollar-sign
math delimiters, or raw markup commands like \\frac{}, \\cdot, ^{}, or _{}
inside hint. If you need to mention a piece of math, describe it in words or
write it as plain readable text.

This rule does NOT apply to problemLatex, which must remain real LaTeX since
it is rendered in a math view.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape:

{
  "problems": [
    { "problemLatex": string, "hint": string }
  ]
}`;

interface PracticeProblem {
  problemLatex: string;
  hint: string;
}

interface PracticeResult {
  problems: PracticeProblem[];
}

function isPracticeProblem(value: unknown): value is PracticeProblem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.problemLatex === "string" &&
    v.problemLatex.trim() !== "" &&
    typeof v.hint === "string" &&
    v.hint.trim() !== ""
  );
}

/** Validates the parsed JSON matches the PracticeResult shape. */
function isPracticeResult(value: unknown): value is PracticeResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // ponytail: accept 2-4 problems even though the prompt asks for exactly 3 —
  // an off-by-one from the model is still a perfectly usable practice set.
  return (
    Array.isArray(v.problems) &&
    v.problems.length >= 2 &&
    v.problems.length <= 4 &&
    v.problems.every(isPracticeProblem)
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  const { problemStatementLatex, misconceptionSummary } = await request.json();

  if (
    !problemStatementLatex ||
    typeof problemStatementLatex !== "string" ||
    !misconceptionSummary ||
    typeof misconceptionSummary !== "string"
  ) {
    return NextResponse.json(
      { error: "problemStatementLatex and misconceptionSummary are required." },
      { status: 400 }
    );
  }

  const prompt = `${INSTRUCTION}

Original problem (LaTeX):
${problemStatementLatex}

The student's misconception:
${misconceptionSummary}`;

  let outcome;
  try {
    const ai = new GoogleGenAI({ apiKey });
    outcome = await generateJson(ai, prompt, isPracticeResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "Gemma's response wasn't valid practice JSON, even after retrying.",
        raw: outcome.raw,
      },
      { status: 502 }
    );
  }

  outcome.value.problems.forEach((p, i) => warnIfLooksLikeLatex(`problems[${i}].hint`, p.hint));

  return NextResponse.json(outcome.value);
}
```

- [ ] **Step 2: Verify the route in isolation**

Run: `npm run lint && npm run build` (expected: pass). With the dev server running:

```bash
curl -s -X POST localhost:3000/api/practice \
  -H 'Content-Type: application/json' \
  -d '{"problemStatementLatex": "2x + 3 = 11", "misconceptionSummary": "The student subtracted 3 from the left side but added it on the right, flipping the sign when moving a term across the equals sign."}'
```

Expected: JSON with a `problems` array of 2–4 entries, each with non-empty `problemLatex` and a plain-English `hint` (no `\frac`/`$` markup in hints).

- [ ] **Step 3: Add the practice section to the results screen**

In `app/page.tsx`, add types next to `AnalysisResult` (after line 47):

```tsx
interface PracticeProblem {
  problemLatex: string;
  hint: string;
}
```

Add state next to the other result state:

```tsx
  const [practice, setPractice] = useState<PracticeProblem[] | null>(null);
  const [isPracticeLoading, setIsPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
```

In `runResult` (with the other resets) and in `startOver()`, add:

```tsx
    setPractice(null);
    setPracticeError(null);
```

Add the fetch function after `runResult`:

```tsx
  async function fetchPractice() {
    if (!confirmed || !analysis?.misconceptionSummary) return;
    setIsPracticeLoading(true);
    setPracticeError(null);
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemStatementLatex: confirmed.problem,
          misconceptionSummary: analysis.misconceptionSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPracticeError(data.error ?? "Couldn't generate practice problems.");
        return;
      }
      setPractice(data.problems);
    } catch {
      setPracticeError("Network error: could not reach the practice API.");
    } finally {
      setIsPracticeLoading(false);
    }
  }
```

Then, inside the analysis results `<section>`, immediately after the closing of the `{!analysis.isCorrect && (...)}` misconception panel (currently line 576) and before the "Check another problem" button, add:

```tsx
            {!analysis.isCorrect && analysis.misconceptionSummary && (
              <div className="flex flex-col gap-3 rounded-md border border-hairline-soft bg-surface-soft p-5 text-sm">
                <div>
                  <p className="font-medium text-ink">Practice this</p>
                  <p className="mt-1 text-ink-muted">
                    Fresh problems that drill exactly the skill this slip came
                    from. Work them on paper, then photograph your attempt to
                    get it checked.
                  </p>
                </div>

                {!practice && (
                  <Button
                    size="sm"
                    className="self-start"
                    onClick={fetchPractice}
                    disabled={isPracticeLoading}
                  >
                    {isPracticeLoading ? "Writing problems…" : "Give me practice problems"}
                  </Button>
                )}
                {isPracticeLoading && (
                  <LoadingNote label="Gemma is writing problems aimed at this misconception." />
                )}
                {practiceError && <p className="text-mark-error">{practiceError}</p>}

                {practice &&
                  practice.map((p, i) => (
                    <div key={i} className="rounded-md border border-hairline-soft bg-white p-4">
                      <p className="font-medium text-ink">Problem {i + 1}</p>
                      <div className="mt-1 rounded-md border border-hairline-soft bg-surface px-3 py-2">
                        <MathView latex={p.problemLatex} />
                      </div>
                      <details className="mt-2 text-ink-muted">
                        <summary className="cursor-pointer font-medium text-ink">Hint</summary>
                        <p className="mt-1">{p.hint}</p>
                      </details>
                    </div>
                  ))}
              </div>
            )}
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run lint && npm run build` (expected: pass). In the dev server, produce an incorrect-result analysis (same wrong-step trick as Task 4). Expected: below the misconception panel a "Practice this" card with a pill button; clicking it shows the loading note, then 2–4 problems rendered as math with collapsible plain-English hints. Hints stay collapsed by default.

- [ ] **Step 5: Commit**

```bash
git add app/api/practice/route.ts app/page.tsx
git commit -m "feat: generate practice problems targeting the detected misconception"
```

---

### Task 6: Local history on the landing screen

**Files:**
- Create: `lib/history.ts`
- Create: `components/HistoryList.tsx`
- Modify: `app/page.tsx` (record on success in `runResult`; render list on the landing screen, lines 267–273)

**Interfaces:**
- Consumes: `analysis`/`solved` result data inside `runResult`; `HistoryList` does its own `dynamic` import of `components/MathView` with `ssr: false` (same pattern as `page.tsx:19-21`).
- Produces:
  - `lib/history.ts`: `interface HistoryEntry { at: number; problemLatex: string; outcome: "correct" | "incorrect" | "solved"; misconceptionSummary: string | null }`, `saveHistoryEntry(entry: HistoryEntry): void`, `loadHistory(): HistoryEntry[]`. Task 7 extends `HistoryEntry` with an optional `misconceptionTag`.
  - `components/HistoryList.tsx`: `<HistoryList />`, renders nothing when history is empty.

Why: makes return visits useful. localStorage only; no accounts, no backend. (Skipped: cross-device sync — add only if someone asks for accounts.)

- [ ] **Step 1: Create `lib/history.ts`**

```ts
export interface HistoryEntry {
  at: number; // Date.now()
  problemLatex: string;
  outcome: "correct" | "incorrect" | "solved";
  misconceptionSummary: string | null;
}

const KEY = "stepcheck-history";
const MAX_ENTRIES = 20;

// ponytail: localStorage, newest-first, capped at 20 — a real store (accounts,
// sync, analytics) only when someone asks for cross-device history.

export function loadHistory(): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is HistoryEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as HistoryEntry).at === "number" &&
        typeof (e as HistoryEntry).problemLatex === "string" &&
        ["correct", "incorrect", "solved"].includes((e as HistoryEntry).outcome)
    );
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...loadHistory()].slice(0, MAX_ENTRIES)));
  } catch {
    // Quota/serialization failures just mean no history — never break the flow.
  }
}
```

- [ ] **Step 2: Record entries on success**

In `app/page.tsx`, import:

```tsx
import { saveHistoryEntry } from "@/lib/history";
```

In `runResult`, after `setAnalysis(data);` add:

```tsx
        saveHistoryEntry({
          at: Date.now(),
          problemLatex: problemToUse,
          outcome: data.isCorrect ? "correct" : "incorrect",
          misconceptionSummary: data.misconceptionSummary,
        });
```

After `setSolved(data);` add:

```tsx
        saveHistoryEntry({
          at: Date.now(),
          problemLatex: problemToUse,
          outcome: "solved",
          misconceptionSummary: null,
        });
```

- [ ] **Step 3: Create `components/HistoryList.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { loadHistory, type HistoryEntry } from "@/lib/history";

// Same MathLive constraint as app/page.tsx: custom elements touch the DOM on
// import, so the view must only ever render on the client.
const MathView = dynamic(() => import("@/components/MathView"), { ssr: false });

const OUTCOME_LABEL: Record<HistoryEntry["outcome"], { text: string; className: string }> = {
  correct: { text: "Correct", className: "text-mark-correct" },
  incorrect: { text: "First slip found", className: "text-mark-error" },
  solved: { text: "Solved for you", className: "text-ink-muted" },
};

/** Recent checks from localStorage, shown on the landing screen. */
export default function HistoryList() {
  // Loaded in an effect (not at render) so the server and first client
  // render agree — localStorage doesn't exist during SSR.
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setEntries(loadHistory().slice(0, 5));
  }, []);

  if (entries.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-16 sm:px-6">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
        Recent checks
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        {entries.map((entry) => (
          <div key={entry.at} className="rounded-lg border border-hairline bg-white p-4 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <p className={`font-medium ${OUTCOME_LABEL[entry.outcome].className}`}>
                {OUTCOME_LABEL[entry.outcome].text}
              </p>
              <p className="text-xs text-ink-muted">
                {new Date(entry.at).toLocaleDateString()}
              </p>
            </div>
            <div className="mt-2 rounded-md border border-hairline-soft bg-surface px-3 py-2">
              <MathView latex={entry.problemLatex} />
            </div>
            {entry.misconceptionSummary && (
              <p className="mt-2 text-ink-muted">{entry.misconceptionSummary}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Render it on the landing screen**

In `app/page.tsx`, import `HistoryList` and change the landing return (lines 267–273) to:

```tsx
  if (screen === "landing") {
    return (
      <Screen screenKey="landing">
        <LandingHero onStart={() => setScreen("upload")} />
        <HistoryList />
      </Screen>
    );
  }
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run lint && npm run build` (expected: pass). In the dev server: complete one full check (any outcome), then click "Check another problem" to return to the landing screen. Expected: a "Recent checks" section with the problem rendered as math, an outcome label in the correct semantic color, and — for an incorrect result — the misconception sentence. Reload the page: the list persists. In a private/incognito window: no "Recent checks" section at all.

- [ ] **Step 6: Commit**

```bash
git add lib/history.ts components/HistoryList.tsx app/page.tsx
git commit -m "feat: local recent-checks history on the landing screen"
```

---

### Task 7: Misconception tagging + repeat-pattern banner

**Files:**
- Modify: `app/api/analyze/route.ts` (INSTRUCTION output shape, `AnalysisResult` interface, `isAnalysisResult`)
- Modify: `app/page.tsx` (`AnalysisResult` interface, history save call)
- Modify: `lib/history.ts` (`HistoryEntry`)
- Modify: `components/HistoryList.tsx` (repeat banner)

**Interfaces:**
- Consumes: Task 6's history plumbing.
- Produces: `AnalysisResult.misconceptionTag: string | null` (route + client), `HistoryEntry.misconceptionTag?: string | null` (optional — old stored entries lack it and must keep loading).

Why: "you've slipped on sign distribution 3 times" is the feedback that makes people return. One extra field on the existing analyze call — no extra Gemma round-trip. (Skipped: a fixed taxonomy — free-form lowercase labels from a temperature-0 model are consistent enough to count; revisit if labels fragment.)

- [ ] **Step 1: Extend the analyze prompt and types**

In `app/api/analyze/route.ts`, in `INSTRUCTION`, replace the JSON shape block:

```
{
  "isCorrect": boolean,
  "firstErrorStepIndex": number | null,
  "stepByStepFeedback": [
    { "stepIndex": number, "status": "correct" | "incorrect" | "not_reached", "explanation": string }
  ],
  "misconceptionSummary": string | null,
  "correctContinuation": string | null,
  "correctContinuationExplanation": string | null
}
```

with:

```
{
  "isCorrect": boolean,
  "firstErrorStepIndex": number | null,
  "stepByStepFeedback": [
    { "stepIndex": number, "status": "correct" | "incorrect" | "not_reached", "explanation": string }
  ],
  "misconceptionSummary": string | null,
  "misconceptionTag": string | null,
  "correctContinuation": string | null,
  "correctContinuationExplanation": string | null
}

misconceptionTag is a SHORT lowercase label of 2-4 plain words naming the
skill behind the error, reusable across problems — like "sign distribution",
"fraction addition", or "chain rule". No LaTeX, no punctuation.
```

And change the final line of the instruction from:

```
misconceptionSummary, correctContinuation, and correctContinuationExplanation
must be null when isCorrect is true.
```

to:

```
misconceptionSummary, misconceptionTag, correctContinuation, and
correctContinuationExplanation must be null when isCorrect is true.
```

In the same file, add to the `AnalysisResult` interface after `misconceptionSummary`:

```ts
  misconceptionTag: string | null;
```

and add to `isAnalysisResult`, after the `misconceptionSummary` check:

```ts
    (v.misconceptionTag === null || typeof v.misconceptionTag === "string") &&
```

- [ ] **Step 2: Carry the tag through the client and history**

In `app/page.tsx`, add the same field to the client `AnalysisResult` interface (after line 33):

```tsx
  misconceptionTag: string | null;
```

In `lib/history.ts`, add to `HistoryEntry`:

```ts
  // Optional: entries saved before tagging existed don't have it.
  misconceptionTag?: string | null;
```

In `runResult`'s analyze-success `saveHistoryEntry` call (Task 6 Step 2), add:

```tsx
          misconceptionTag: data.misconceptionTag ?? null,
```

- [ ] **Step 3: Show the repeat-pattern banner**

In `components/HistoryList.tsx`, extend the state and effect:

```tsx
  const [repeated, setRepeated] = useState<[string, number] | null>(null);

  useEffect(() => {
    const all = loadHistory();
    setEntries(all.slice(0, 5));
    const counts = new Map<string, number>();
    for (const e of all) {
      if (e.misconceptionTag) counts.set(e.misconceptionTag, (counts.get(e.misconceptionTag) ?? 0) + 1);
    }
    const top = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
    setRepeated(top ?? null);
  }, []);
```

And render, directly under the `<h2>`:

```tsx
      {repeated && (
        <div className="mt-3 rounded-md border border-mark-flag/40 bg-mark-flag/5 p-4 text-sm">
          <p className="font-medium text-ink">Pattern spotted</p>
          <p className="mt-1 text-ink-muted">
            You&apos;ve slipped on {repeated[0]} {repeated[1]} times recently —
            worth a focused review before your next attempt.
          </p>
        </div>
      )}
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run build` (expected: pass). Re-run the Task 2 analyze curl but with a wrong step:

```bash
curl -s -X POST localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"problemStatementLatex": "2x + 3 = 11", "confirmedSteps": ["2x = 14", "x = 7"]}'
```

Expected: `"isCorrect": false` and a lowercase 2–4 word `"misconceptionTag"`. In the browser, get the same *kind* of problem wrong twice, return to landing. Expected: "Pattern spotted" banner naming the tag with count 2. Old history entries from Task 6 still render (no crash on missing tag).

- [ ] **Step 5: Commit**

```bash
git add app/api/analyze/route.ts app/page.tsx lib/history.ts components/HistoryList.tsx
git commit -m "feat: tag misconceptions in analyze and surface repeat patterns in history"
```

---

### Task 8: Type-it-in path (no photo required)

**Files:**
- Modify: `app/page.tsx` (upload screen ~line 281–312, confirm screen ~line 324–383, new `startTyped` helper)

**Interfaces:**
- Consumes: existing `MathInput`, `runResult`, `setScreen`, `transcriptionLooksShaky`.
- Produces: no new exports — "type it instead" entry point plus add/remove-step controls on the confirm screen (which also benefit the photo flow when transcription missed a line).

Why: not everyone has a photo. The confirm screen already does all the editing work — this skips `/api/transcribe` entirely by seeding it with an empty synthetic transcription.

- [x] **Step 1: Add the `startTyped` entry point**

In `app/page.tsx`, after `transcribe()`:

```tsx
  // Type-it-in path: skip /api/transcribe entirely by seeding the confirm
  // screen with an empty synthetic "no worked solution" transcription.
  function startTyped() {
    setImage(null);
    setTranscribeError(null);
    setTranscribeResult({ hasWorkedSolution: false, problemStatementLatex: "" });
    setProblem("");
    setSteps(null);
    setConfirmed(null);
    setAnalysis(null);
    setSolved(null);
    setResultError(null);
    setScreen("confirm");
  }
```

On the upload screen, after the `{transcribeError && (...)}` block inside the section, add:

```tsx
            <button
              type="button"
              onClick={startTyped}
              className="self-center text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              No photo? Type the problem instead
            </button>
```

- [x] **Step 2: Adapt confirm-screen copy and add step controls**

In the confirm screen, change the heading/copy block (lines 327–335) to:

```tsx
              <div>
                <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                  {image ? "Page 2 — Confirm what was read" : "Type your problem"}
                </h2>
                <p className="text-sm text-ink-muted">
                  {image
                    ? steps
                      ? "Check the problem and each step against the photo and fix anything the model got wrong."
                      : "No worked solution was found in this photo — just confirm the problem statement, and Gemma will solve it for you."
                    : "Enter the problem statement, and optionally your own working — Gemma will mark it step by step, or solve it if you leave the steps out."}
                </p>
              </div>
```

Change the shaky-warning condition (line 351) from `{steps && transcriptionLooksShaky(steps) && (` to:

```tsx
              {image && steps && transcriptionLooksShaky(steps) && (
```

After the `steps.map(...)` block (ends line 368), add step controls:

```tsx
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSteps((prev) => [...(prev ?? []), ""])}
                >
                  {steps ? "Add another step" : "Add my working"}
                </Button>
                {steps && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSteps((prev) => (prev && prev.length > 1 ? prev.slice(0, -1) : null))
                    }
                  >
                    Remove last step
                  </Button>
                )}
              </div>
```

- [x] **Step 3: Never send empty steps**

Define once at component scope, just before the `header` const:

```tsx
  // Steps stripped of blank entries; null when nothing meaningful remains,
  // which routes the confirm into the solve-from-scratch path.
  const cleanedSteps = (() => {
    const filtered = steps?.filter((s) => s.trim() !== "") ?? [];
    return filtered.length > 0 ? filtered : null;
  })();
```

Change the Confirm button's `onClick` (line 370) from `() => runResult(problem, steps)` to:

```tsx
onClick={() => runResult(problem, cleanedSteps)}
```

- [x] **Step 4: Verify in the browser**

Run: `npm run lint && npm run build` (expected: pass). In the dev server:
1. Upload screen → "No photo? Type the problem instead" → confirm screen shows "Type your problem", no photo, no shaky warning.
2. Type a problem, click "Add my working", enter two steps, Confirm. Expected: analyze flow runs and marks the typed steps.
3. Type a problem, add a step, leave it empty, Confirm. Expected: solve-from-scratch flow (empty step stripped → null).
4. Photo flow regression: upload a photo as before — heading still says "Page 2 — Confirm what was read" and everything behaves as before.

- [x] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: type-it-in path with add/remove step controls on the confirm screen"
```

---

### Task 9: Hint mode — nudges instead of the full solution

**Files:**
- Create: `app/api/hints/route.ts`
- Modify: `app/page.tsx` (state, `runHints`, confirm-screen secondary button, results-screen hints card, `stage` calc, loading condition)

**Interfaces:**
- Consumes: `generateJson`, `warnIfLooksLikeLatex` (Task 2); `StagedStatus` (Task 3); `cleanedSteps` (Task 8).
- Produces: `POST /api/hints` accepting `{ problemStatementLatex: string }`, returning `{ hints: string[] }` (2–4 progressively stronger plain-language hints).

Why: students who haven't attempted the problem shouldn't be forced to choose between nothing and the full answer. Progressive reveal keeps the productive struggle.

- [x] **Step 1: Create `app/api/hints/route.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";

export const runtime = "nodejs";
// Same rationale as the other Gemma routes: extended duration or the
// platform kills long generations as gateway 502s.
export const maxDuration = 180;

const INSTRUCTION = `You are a math tutor. You will be given a problem
statement in LaTeX. The student has NOT attempted it yet and wants nudges,
not the answer.

Give exactly 3 hints, each strictly stronger than the last:
1. A reminder of the relevant concept or rule, with no reference to this
   problem's specific numbers.
2. What to do first in this specific problem, without doing it.
3. The first step actually carried out, described in words, stopping there.

Never reveal the final answer in any hint.

CRITICAL formatting rule for every hint: write it in plain, natural human
language, as if speaking to a student out loud. Never use LaTeX syntax,
dollar-sign math delimiters, or raw markup commands like \\frac{}, \\cdot,
^{}, or _{}. If you need to mention a piece of math, describe it in words or
write it as plain readable text.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape:

{ "hints": [string, string, string] }`;

interface HintsResult {
  hints: string[];
}

function isHintsResult(value: unknown): value is HintsResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // ponytail: accept 2-4 hints even though the prompt asks for exactly 3.
  return (
    Array.isArray(v.hints) &&
    v.hints.length >= 2 &&
    v.hints.length <= 4 &&
    v.hints.every((h) => typeof h === "string" && h.trim() !== "")
  );
}

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

  const prompt = `${INSTRUCTION}\n\nProblem statement (LaTeX):\n${problemStatementLatex}`;

  let outcome;
  try {
    const ai = new GoogleGenAI({ apiKey });
    outcome = await generateJson(ai, prompt, isHintsResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "Gemma's response wasn't valid hints JSON, even after retrying.",
        raw: outcome.raw,
      },
      { status: 502 }
    );
  }

  outcome.value.hints.forEach((h, i) => warnIfLooksLikeLatex(`hints[${i}]`, h));

  return NextResponse.json(outcome.value);
}
```

- [x] **Step 2: Verify the route in isolation**

Run: `npm run lint && npm run build` (expected: pass). Then:

```bash
curl -s -X POST localhost:3000/api/hints \
  -H 'Content-Type: application/json' \
  -d '{"problemStatementLatex": "\\int x e^{x} dx"}'
```

Expected: `{ "hints": [...] }` with 2–4 plain-English strings, none containing the final answer, none containing LaTeX markup.

- [x] **Step 3: Wire hints into the flow**

In `app/page.tsx`, add state next to the other result state:

```tsx
  const [hints, setHints] = useState<string[] | null>(null);
  const [hintsShown, setHintsShown] = useState(1);
  const [isHinting, setIsHinting] = useState(false);
```

Add `setHints(null); setHintsShown(1);` to the reset lists in both `runResult` and `startOver()`.

Update the `stage` calc (line 100) to include hints as a result:

```tsx
  const stage = analysis || solved || resultError || hints ? 3 : transcribeResult ? 2 : 1;
```

Add `runHints` after `runResult`:

```tsx
  async function runHints(problemToUse: string) {
    setConfirmed({ problem: problemToUse, steps: null });
    setIsHinting(true);
    setResultError(null);
    setAnalysis(null);
    setSolved(null);
    setHints(null);
    setHintsShown(1);
    setScreen("results");
    try {
      const res = await fetch("/api/hints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemStatementLatex: problemToUse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultError({ message: data.error ?? "Couldn't get hints.", raw: data.raw });
        return;
      }
      setHints(data.hints);
    } catch {
      setResultError({ message: "Network error: could not reach the hints API." });
    } finally {
      setIsHinting(false);
    }
  }
```

On the confirm screen, next to the Confirm button (make them siblings in a flex row), when there are no steps:

```tsx
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => runResult(problem, cleanedSteps)} disabled={isWorking || !problem}>
                  {isWorking ? "Working…" : "Confirm"}
                </Button>
                {!cleanedSteps && (
                  <Button
                    variant="outline"
                    onClick={() => runHints(problem)}
                    disabled={isWorking || isHinting || !problem}
                  >
                    {isHinting ? "Thinking…" : "Just give me a hint"}
                  </Button>
                )}
              </div>
```

(This replaces the single Confirm `<Button>` from Task 8 Step 3.)

- [x] **Step 4: Render the hints card on the results screen**

Extend the loading-card condition (line 401) from `{isWorking && !resultError && !solved && !analysis && (` to:

```tsx
        {(isWorking || isHinting) && !resultError && !solved && !analysis && !hints && (
```

and inside it, change the `StagedStatus` line to handle hinting:

```tsx
              <StagedStatus mode={confirmed?.steps ? "analyze" : "solve"} />
```

(unchanged — hints use the "solve" copy; acceptable.)

After the `{solved && (...)}` section, add:

```tsx
        {hints && (
          <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-white p-6">
            <div className="rounded-md bg-surface p-5">
              <p className="font-display text-xl font-semibold tracking-tight text-ink">
                Nudges, not answers
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Each hint is a little stronger than the last. Reveal only as
                many as you need, then try it on paper.
              </p>
            </div>

            {hints.slice(0, hintsShown).map((hint, i) => (
              <div key={i} className="rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm">
                <p className="font-medium text-ink">Hint {i + 1}</p>
                <p className="mt-1 text-ink-muted">{hint}</p>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              {hintsShown < hints.length && (
                <Button variant="outline" size="sm" onClick={() => setHintsShown((n) => n + 1)}>
                  Stronger hint
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => confirmed && runResult(confirmed.problem, null)}
                disabled={isWorking}
              >
                Just show me the full solution
              </Button>
              <Button variant="outline" size="sm" onClick={startOver}>
                Check another problem
              </Button>
            </div>
          </section>
        )}
```

- [x] **Step 5: Verify in the browser**

Run: `npm run lint && npm run build` (expected: pass). In the dev server: type a problem (Task 8 path), leave steps empty, click "Just give me a hint". Expected: results screen shows the loading card, then the hints card with Hint 1 only; "Stronger hint" reveals 2 then 3 then disappears; "Just show me the full solution" runs the solve flow and replaces the hints card with the worked solution.

- [x] **Step 6: Commit**

```bash
git add app/api/hints/route.ts app/page.tsx
git commit -m "feat: progressive hint mode for problems with no attempt"
```

---

### Task 10: Ask-a-follow-up — problem-scoped Socratic chat on the results screen

**Files:**
- Create: `app/api/followup/route.ts`
- Modify: `app/page.tsx` (chat state, `askFollowUp`, chat section after the results sections)

**Interfaces:**
- Consumes: `generateJson`, `warnIfLooksLikeLatex` (Task 2); `confirmed`, `analysis`, `solved` state.
- Produces: `POST /api/followup` accepting `{ contextSummary: string, transcript: [{ role: "student" | "tutor", text: string }], question: string }`, returning `{ answer: string }`.

Why: "why can't I cancel here?" is the question every marked page provokes. Scoping the chat to the problem + its marking (stuffed into context) and prompting Socratically differentiates this from photo → generic chatbot.

- [x] **Step 1: Create `app/api/followup/route.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";

export const runtime = "nodejs";
// Same rationale as the other Gemma routes.
export const maxDuration = 180;

const INSTRUCTION = `You are a patient math tutor answering a student's
follow-up question about a problem that was just marked for them.

Ground every answer in the marking context provided below. Be Socratic:
prefer guiding reminders and pointed questions over handing out results —
but never be evasive. If the student asks why a step is wrong, explain the
misconception plainly. Never solve unrelated problems. Keep answers to 2-5
sentences.

CRITICAL formatting rule: write the answer in plain, natural human language,
as if speaking to a student out loud. Never use LaTeX syntax, dollar-sign
math delimiters, or raw markup commands like \\frac{}, \\cdot, ^{}, or _{}.
If you need to mention a piece of math, describe it in words or write it as
plain readable text.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape:

{ "answer": string }`;

interface FollowupResult {
  answer: string;
}

function isFollowupResult(value: unknown): value is FollowupResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.answer === "string" && v.answer.trim() !== "";
}

interface ChatTurn {
  role: "student" | "tutor";
  text: string;
}

function isChatTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.role === "student" || v.role === "tutor") && typeof v.text === "string";
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  const { contextSummary, transcript, question } = await request.json();

  if (
    !contextSummary ||
    typeof contextSummary !== "string" ||
    !question ||
    typeof question !== "string" ||
    !Array.isArray(transcript) ||
    !transcript.every(isChatTurn)
  ) {
    return NextResponse.json(
      { error: "contextSummary, transcript, and question are required." },
      { status: 400 }
    );
  }

  const prompt = `${INSTRUCTION}

Marking context:
${contextSummary}

Conversation so far:
${(transcript as ChatTurn[]).map((t) => `${t.role === "student" ? "Student" : "Tutor"}: ${t.text}`).join("\n") || "(none yet)"}

Student's new question:
${question}`;

  let outcome;
  try {
    const ai = new GoogleGenAI({ apiKey });
    outcome = await generateJson(ai, prompt, isFollowupResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "Gemma's response wasn't valid follow-up JSON, even after retrying.",
        raw: outcome.raw,
      },
      { status: 502 }
    );
  }

  warnIfLooksLikeLatex("answer", outcome.value.answer);

  return NextResponse.json(outcome.value);
}
```

- [x] **Step 2: Verify the route in isolation**

Run: `npm run lint && npm run build` (expected: pass). Then:

```bash
curl -s -X POST localhost:3000/api/followup \
  -H 'Content-Type: application/json' \
  -d '{"contextSummary": "Problem: 2x + 3 = 11. Student steps: 2x = 14 | x = 7. Marking: step 1 incorrect, the student added 3 to the right side instead of subtracting it.", "transcript": [], "question": "Why is my first step wrong?"}'
```

Expected: `{ "answer": "..." }` — a short plain-English explanation about subtracting 3 from both sides.

- [x] **Step 3: Add the chat section to the results screen**

In `app/page.tsx`, add the type next to the other interfaces:

```tsx
interface ChatTurn {
  role: "student" | "tutor";
  text: string;
}
```

Add state next to the other result state:

```tsx
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
```

Add `setChat([]); setChatInput(""); setChatError(null);` to the reset lists in `runResult` and `startOver()`.

Add the ask function after `fetchPractice`:

```tsx
  async function askFollowUp() {
    const question = chatInput.trim();
    if (!question || !confirmed) return;
    setIsAsking(true);
    setChatError(null);
    const contextSummary = [
      `Problem (LaTeX): ${confirmed.problem}`,
      confirmed.steps
        ? `Student steps (LaTeX): ${confirmed.steps.join(" | ")}`
        : "The student submitted no steps of their own.",
      analysis ? `Marking result JSON: ${JSON.stringify(analysis)}` : "",
      solved ? `Worked solution JSON: ${JSON.stringify(solved)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ponytail: transcript capped at the last 6 turns — summarize older
        // turns only if students genuinely hold long conversations here.
        body: JSON.stringify({ contextSummary, transcript: chat.slice(-6), question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error ?? "Couldn't answer that.");
        return;
      }
      setChat((prev) => [
        ...prev,
        { role: "student", text: question },
        { role: "tutor", text: data.answer },
      ]);
      setChatInput("");
    } catch {
      setChatError("Network error: could not reach the follow-up API.");
    } finally {
      setIsAsking(false);
    }
  }
```

At the end of the results screen, after the `{analysis && confirmed?.steps && (...)}` section closes, add:

```tsx
        {(analysis || solved) && (
          <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-white p-6 text-sm">
            <div>
              <p className="font-medium text-ink">Ask a follow-up</p>
              <p className="mt-1 text-ink-muted">
                Scoped to this problem and its marking — ask why a step is
                wrong, or what to review next.
              </p>
            </div>

            {chat.map((turn, i) => (
              <div
                key={i}
                className={
                  turn.role === "student"
                    ? "rounded-md bg-surface px-3 py-2 text-ink"
                    : "rounded-md border border-hairline-soft bg-surface-soft px-3 py-2 text-ink-muted"
                }
              >
                <span className="font-medium text-ink">
                  {turn.role === "student" ? "You: " : "Gemma: "}
                </span>
                {turn.text}
              </div>
            ))}
            {chatError && <p className="text-mark-error">{chatError}</p>}

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") askFollowUp();
                }}
                placeholder="Why is that step wrong?"
                className="w-full rounded-md border border-hairline bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button size="sm" onClick={askFollowUp} disabled={isAsking || !chatInput.trim()}>
                {isAsking ? "Thinking…" : "Ask"}
              </Button>
            </div>
            {isAsking && <LoadingNote label="Gemma is thinking about your question." />}
          </section>
        )}
```

- [x] **Step 4: Verify in the browser**

Run: `npm run lint && npm run build` (expected: pass). In the dev server: complete an analyze run with a wrong step, then in "Ask a follow-up" type "Why is that step wrong?" and press Enter. Expected: the question and a short plain-English tutor answer appear as chat turns; a second question keeps the thread; the section also appears (and works) after a solve-from-scratch result.

- [x] **Step 5: Commit**

```bash
git add app/api/followup/route.ts app/page.tsx
git commit -m "feat: problem-scoped socratic follow-up chat on the results screen"
```

---

### Task 11: Worksheet mode — multiple problems per photo

**Files:**
- Modify: `app/api/transcribe/route.ts` (INSTRUCTION, types, guard, response shape)
- Modify: `app/page.tsx` (queue state, `loadQueueItem`, transcribe handler, confirm chip, "Next problem" buttons)
- Modify: `scripts/test-transcribe-batch.mjs:61-68` (new response shape)

**Interfaces:**
- Consumes: `generateJson` (Task 2).
- Produces: `POST /api/transcribe` now returns `{ problems: TranscribeItem[] }` (1–6 items) where `TranscribeItem` is the previous discriminated union unchanged. **Breaking change for consumers of the old flat shape** — this task updates both consumers (page.tsx, batch script). Task 14's teacher page consumes `data.problems[0]`.

Why: one photo of a homework page → the whole page marked, one problem at a time, is a far stronger pitch than one problem per photo. Single-problem photos still work — they come back as a one-element array and the UI shows no queue chrome.

- [x] **Step 1: Rework the transcribe route**

In `app/api/transcribe/route.ts`, replace `INSTRUCTION` with:

```ts
const INSTRUCTION = `You are reading a photo of math homework for a student.

The photo may contain ONE OR MORE problems. Each problem may appear as ONLY
a problem statement, or as a problem statement PLUS the student's own
handwritten attempt at solving it.

For EACH problem in the photo, in reading order (top to bottom, left column
before right):
1. Transcribe the problem statement into LaTeX.
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
    { "hasWorkedSolution": false, "problemStatementLatex": string }
    OR
    { "hasWorkedSolution": true, "problemStatementLatex": string, "solutionSteps": string[] }
  ]
}`;
```

Rename the union and add the batch wrapper — replace the existing `NoSolutionResult`/`WithSolutionResult`/`TranscribeResult`/`isTranscribeResult` block with:

```ts
interface NoSolutionItem {
  hasWorkedSolution: false;
  problemStatementLatex: string;
}

interface WithSolutionItem {
  hasWorkedSolution: true;
  problemStatementLatex: string;
  solutionSteps: string[];
}

type TranscribeItem = NoSolutionItem | WithSolutionItem;

interface TranscribeBatch {
  problems: TranscribeItem[];
}

function isTranscribeItem(value: unknown): value is TranscribeItem {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.problemStatementLatex !== "string" || v.problemStatementLatex.trim() === "") {
    return false;
  }
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

function isTranscribeBatch(value: unknown): value is TranscribeBatch {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // ponytail: 6-problem cap — a denser worksheet needs cropping into two
  // photos; raise when a real page busts it.
  return (
    Array.isArray(v.problems) &&
    v.problems.length >= 1 &&
    v.problems.length <= 6 &&
    v.problems.every(isTranscribeItem)
  );
}
```

In the `POST` handler, change the guard passed to `generateJson` from `isTranscribeResult` to `isTranscribeBatch`. The rest of the handler is unchanged (it already returns `outcome.value`).

- [x] **Step 2: Add the queue to `app/page.tsx`**

Rename the client type (lines 54–56): `TranscribeResult` becomes `TranscribeItem` (same union body). Update the two existing references (`useState<TranscribeResult | null>` at line 84 and `data as TranscribeResult` inside `transcribe()`).

Add queue state next to `transcribeResult`:

```tsx
  const [queue, setQueue] = useState<TranscribeItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
```

Add the loader after `transcribe()`:

```tsx
  // Loads one worksheet problem into the confirm screen, clearing all
  // per-problem result state but keeping the queue itself.
  function loadQueueItem(items: TranscribeItem[], index: number) {
    const item = items[index];
    setQueueIndex(index);
    setTranscribeResult(item);
    setProblem(item.problemStatementLatex);
    setSteps(item.hasWorkedSolution ? item.solutionSteps : null);
    setConfirmed(null);
    setAnalysis(null);
    setSolved(null);
    setResultError(null);
    setHints(null);
    setHintsShown(1);
    setPractice(null);
    setPracticeError(null);
    setChat([]);
    setChatInput("");
    setChatError(null);
    setFixLatex(null);
    setScreen("confirm");
  }
```

In `transcribe()`, replace the success block (lines 125–129) with:

```tsx
      const result = data as { problems: TranscribeItem[] };
      setQueue(result.problems);
      loadQueueItem(result.problems, 0);
```

In `startOver()`, add `setQueue([]); setQueueIndex(0);`.

- [x] **Step 3: Queue chrome on confirm and results**

On the confirm screen, inside the heading `<div>` (from Task 8 Step 2), add above the `<h2>`:

```tsx
                {queue.length > 1 && (
                  <span className="mb-2 inline-block rounded-full border border-hairline bg-white px-3 py-1 text-xs font-medium text-ink-muted">
                    Problem {queueIndex + 1} of {queue.length}
                  </span>
                )}
```

On the results screen, next to BOTH existing "Check another problem" buttons (one in the `solved` section, one in the `analysis` section), add as a preceding sibling:

```tsx
            {queueIndex < queue.length - 1 && (
              <Button
                size="sm"
                className="self-start"
                onClick={() => loadQueueItem(queue, queueIndex + 1)}
              >
                Next problem ({queueIndex + 2} of {queue.length})
              </Button>
            )}
```

Wrap each pair in a `<div className="flex flex-wrap gap-2">` so the pills sit side by side.

- [x] **Step 4: Update the batch script to the new shape**

In `scripts/test-transcribe-batch.mjs`, replace the success push (lines 61–68) with:

```js
    if (status === 200) {
      results.push({
        file,
        status,
        problems: body.problems,
      });
    } else {
```

- [x] **Step 5: Verify**

Run: `npm run lint && npm run build` (expected: pass). With the dev server:
1. Single-problem photo from `test-problems/`: flow identical to before, no "Problem 1 of 1" chip, no "Next problem" button.
2. A photo with two problems (photograph/compose one if `test-problems/` lacks it): confirm shows "Problem 1 of 2", results show "Next problem (2 of 2)", clicking it loads the second problem's confirm screen with all result state cleared.
3. `STEPCHECK_BASE_URL=http://localhost:3000 node scripts/test-transcribe-batch.mjs` — expected: `test-results.json` entries now carry a `problems` array per file.

- [x] **Step 6: Commit**

```bash
git add app/api/transcribe/route.ts app/page.tsx scripts/test-transcribe-batch.mjs
git commit -m "feat: worksheet mode — transcribe returns multiple problems, UI walks a queue"
```

---

### Task 12: Mobile camera capture + PWA manifest

**Files:**
- Modify: `components/ImageUpload.tsx` (camera input + button, export `readFile`)
- Create: `app/manifest.ts`
- Create: `public/icon.svg`

**Interfaces:**
- Consumes: nothing new.
- Produces: `readFile(file: File): Promise<UploadedImage>` exported from `components/ImageUpload.tsx` (Task 14's teacher page consumes it); a "Take a photo" mobile-only button; installable manifest.

Why: students are on phones. `capture="environment"` opens the rear camera directly; a manifest makes "add to home screen" give a real app feel. (Skipped: service worker/offline — the app is useless offline anyway since Gemma is remote.)

- [x] **Step 1: Export `readFile` and add the camera input**

In `components/ImageUpload.tsx`, change line 26 from `function readFile(` to `export function readFile(`.

Add a second ref next to `inputRef`:

```tsx
  const cameraRef = useRef<HTMLInputElement>(null);
```

After the existing hidden `<input>` (lines 123–129), add:

```tsx
      {/* Mobile-only direct-to-camera path. capture forces the camera app,
          so it must be a SECOND input — the main picker keeps gallery
          access. Hidden on sm+ where there's usually no camera worth using. */}
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="mt-2 w-full rounded-full border border-hairline bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface sm:hidden"
      >
        Take a photo
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
```

- [x] **Step 2: Create the manifest and icon**

First find the brand hex (static SVG assets can't use CSS variables, so the token's value is inlined here — the one sanctioned exception):

Run: `grep -rn "brand" app/globals.css tailwind.config.ts`
Note the hex value defined for the `brand` token; call it `<BRAND_HEX>` below and substitute it literally.

Create `public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#ffffff"/>
  <path d="M128 272 L224 368 L400 160" fill="none" stroke="<BRAND_HEX>" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StepCheck",
    short_name: "StepCheck",
    description: "Photograph your working and get a tick or a cross on every step.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    // ponytail: single SVG icon — add PNG sizes only if an install prompt
    // audit on a real device demands them.
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
```

- [x] **Step 3: Verify**

Run: `npm run lint && npm run build` (expected: pass). With the dev server:

```bash
curl -s localhost:3000/manifest.webmanifest
```

Expected: the manifest JSON above. In the browser at a narrow viewport (mobile preset), the upload screen shows the "Take a photo" pill under the dropzone; at desktop width it's hidden. Desktop file picking still works via the dropzone.

- [x] **Step 4: Commit**

```bash
git add components/ImageUpload.tsx app/manifest.ts public/icon.svg
git commit -m "feat: mobile camera capture input and PWA manifest"
```

---

### Task 13: Explain-back check — verify the student's reasoning, not just algebra

**Files:**
- Create: `app/api/explain-check/route.ts`
- Modify: `app/page.tsx` (state, `checkExplanation`, extend the Task 4 fix box)

**Interfaces:**
- Consumes: `generateJson`, `warnIfLooksLikeLatex` (Task 2); Task 4's fix box and `fixLatex` state.
- Produces: `POST /api/explain-check` accepting `{ problemStatementLatex: string, stepsLatex: string[], fixedStepIndex: number, fixedStepLatex: string, studentExplanation: string }`, returning `{ isSound: boolean, feedback: string }`.

Why: a student can luck into the right algebra while holding the wrong idea. Having them say *why* the fix works — and having Gemma judge the reasoning — closes that gap.

- [x] **Step 1: Create `app/api/explain-check/route.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";

export const runtime = "nodejs";
// Same rationale as the other Gemma routes.
export const maxDuration = 180;

const INSTRUCTION = `You are a math tutor judging a student's REASONING, not
their algebra. The student fixed a wrong step in their solution and then
explained, in their own words, why the fix works.

Decide whether the explanation shows genuinely correct mathematical
understanding of why that step is valid. isSound is true only if the
reasoning itself is right — a correct step justified with a wrong or
circular reason ("because that's the rule") is NOT sound.

Give feedback of 1-3 sentences: affirm what's right in their reasoning, and
name precisely what's missing or mistaken if anything is.

CRITICAL formatting rule for feedback: write it in plain, natural human
language, as if speaking to a student out loud. Never use LaTeX syntax,
dollar-sign math delimiters, or raw markup commands like \\frac{}, \\cdot,
^{}, or _{}. If you need to mention a piece of math, describe it in words or
write it as plain readable text.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape:

{ "isSound": boolean, "feedback": string }`;

interface ExplainCheckResult {
  isSound: boolean;
  feedback: string;
}

function isExplainCheckResult(value: unknown): value is ExplainCheckResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.isSound === "boolean" && typeof v.feedback === "string" && v.feedback.trim() !== "";
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  const { problemStatementLatex, stepsLatex, fixedStepIndex, fixedStepLatex, studentExplanation } =
    await request.json();

  if (
    !problemStatementLatex ||
    typeof problemStatementLatex !== "string" ||
    !Array.isArray(stepsLatex) ||
    !stepsLatex.every((s: unknown) => typeof s === "string") ||
    typeof fixedStepIndex !== "number" ||
    !fixedStepLatex ||
    typeof fixedStepLatex !== "string" ||
    !studentExplanation ||
    typeof studentExplanation !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "problemStatementLatex, stepsLatex, fixedStepIndex, fixedStepLatex, and studentExplanation are required.",
      },
      { status: 400 }
    );
  }

  const prompt = `${INSTRUCTION}

Problem statement (LaTeX):
${problemStatementLatex}

Solution steps (LaTeX), 0-based index per line:
${stepsLatex.map((step: string, i: number) => `${i}: ${step}`).join("\n")}

The fixed step is index ${fixedStepIndex}, now reading (LaTeX):
${fixedStepLatex}

The student's explanation of why the fix works:
${studentExplanation}`;

  let outcome;
  try {
    const ai = new GoogleGenAI({ apiKey });
    outcome = await generateJson(ai, prompt, isExplainCheckResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "Gemma's response wasn't valid explain-check JSON, even after retrying.",
        raw: outcome.raw,
      },
      { status: 502 }
    );
  }

  warnIfLooksLikeLatex("feedback", outcome.value.feedback);

  return NextResponse.json(outcome.value);
}
```

- [x] **Step 2: Verify the route in isolation**

Run: `npm run lint && npm run build` (expected: pass). Then:

```bash
curl -s -X POST localhost:3000/api/explain-check \
  -H 'Content-Type: application/json' \
  -d '{"problemStatementLatex": "2x + 3 = 11", "stepsLatex": ["2x = 8", "x = 4"], "fixedStepIndex": 0, "fixedStepLatex": "2x = 8", "studentExplanation": "I subtracted 3 from both sides, and doing the same thing to both sides keeps the equation balanced."}'
```

Expected: `{ "isSound": true, "feedback": "..." }`. Re-run with `"studentExplanation": "Because you always move numbers to the other side and flip them."` — expected `"isSound": false` with feedback naming the missing idea (inverse operations on both sides).

- [x] **Step 3: Extend the fix box in `app/page.tsx`**

Add state next to `fixLatex`:

```tsx
  const [explainText, setExplainText] = useState("");
  const [explainFeedback, setExplainFeedback] = useState<{ isSound: boolean; feedback: string } | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
```

Add `setExplainText(""); setExplainFeedback(null);` to the reset lists in `runResult`, `startOver()`, and `loadQueueItem` (Task 11).

Add the check function after `askFollowUp`:

```tsx
  async function checkExplanation() {
    if (!confirmed?.steps || !analysis) return;
    setIsExplaining(true);
    setExplainFeedback(null);
    const idx = analysis.firstErrorStepIndex ?? 0;
    try {
      const res = await fetch("/api/explain-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemStatementLatex: confirmed.problem,
          stepsLatex: confirmed.steps,
          fixedStepIndex: idx,
          fixedStepLatex: fixLatex ?? confirmed.steps[idx],
          studentExplanation: explainText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // ponytail: route errors surface through the same feedback line —
        // a dedicated error slot only if this proves confusing.
        setExplainFeedback({ isSound: false, feedback: data.error ?? "Couldn't check that reasoning." });
        return;
      }
      setExplainFeedback(data);
    } catch {
      setExplainFeedback({ isSound: false, feedback: "Network error: could not reach the API." });
    } finally {
      setIsExplaining(false);
    }
  }
```

In the Task 4 fix box, after the "Re-check my fix" `<Button>`, add:

```tsx
                  <div className="mt-3">
                    <p className="font-medium text-ink">Explain your fix (optional)</p>
                    <p className="mt-1 text-ink-muted">
                      Say why your corrected step works — Gemma checks the
                      reasoning, not just the algebra.
                    </p>
                    <textarea
                      value={explainText}
                      onChange={(e) => setExplainText(e.target.value)}
                      rows={2}
                      placeholder="It works because…"
                      className="mt-2 w-full rounded-md border border-hairline bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={isExplaining || !explainText.trim()}
                      onClick={checkExplanation}
                    >
                      {isExplaining ? "Checking…" : "Check my reasoning"}
                    </Button>
                    {explainFeedback && (
                      <p
                        className={`mt-2 ${
                          explainFeedback.isSound ? "text-mark-correct" : "text-mark-flag"
                        }`}
                      >
                        {explainFeedback.feedback}
                      </p>
                    )}
                  </div>
```

- [x] **Step 4: Verify in the browser**

Run: `npm run lint && npm run build` (expected: pass). In the dev server: produce a wrong-step analysis, fix the step in the fix box, write a genuine explanation, click "Check my reasoning". Expected: feedback line in `mark-correct` green for sound reasoning; repeat with a circular explanation ("because that's the rule") and expect `mark-flag` feedback naming what's missing.

- [x] **Step 5: Commit**

```bash
git add app/api/explain-check/route.ts app/page.tsx
git commit -m "feat: explain-back check judging the reasoning behind a fixed step"
```

---

### Task 14: Teacher mode — batch-mark a class's photos of one problem

**Files:**
- Create: `app/api/class-summary/route.ts`
- Create: `app/teacher/page.tsx`
- Modify: `app/page.tsx` (landing-screen link)

**Interfaces:**
- Consumes: `readFile`, `UploadedImage` from `components/ImageUpload.tsx` (Task 12); `/api/transcribe`'s `{ problems }` shape (Task 11); `/api/analyze` unchanged; `generateJson`, `warnIfLooksLikeLatex` (Task 2).
- Produces: `POST /api/class-summary` accepting `{ misconceptions: string[] }` (non-empty), returning `{ themes: [{ label: string, description: string }], advice: string }`; a self-contained `/teacher` page.

Why: same three Gemma calls, different buyer — a teacher photographs a stack of attempts at one problem and gets "here's what the class misunderstands." Sequential processing (one photo at a time) is deliberate: free-tier rate limits make parallel calls self-defeating.

- [x] **Step 1: Create `app/api/class-summary/route.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";

export const runtime = "nodejs";
// Same rationale as the other Gemma routes.
export const maxDuration = 180;

const INSTRUCTION = `You are helping a math teacher. You will be given a list
of misconception summaries, one per student, all from attempts at the SAME
problem.

Group them into recurring themes. For each theme give:
- label: a short lowercase name of 2-4 plain words (like "sign distribution").
- description: 1-2 sentences describing the misunderstanding and roughly how
  widespread it is in this list (e.g. "about half the class").

Then give advice: 2-4 sentences on what to reteach first, based on the most
common theme.

CRITICAL formatting rule for every field: write in plain, natural human
language. Never use LaTeX syntax, dollar-sign math delimiters, or raw markup
commands like \\frac{}, \\cdot, ^{}, or _{}. If you need to mention a piece
of math, describe it in words or write it as plain readable text.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape:

{
  "themes": [ { "label": string, "description": string } ],
  "advice": string
}`;

interface Theme {
  label: string;
  description: string;
}

interface ClassSummary {
  themes: Theme[];
  advice: string;
}

function isTheme(value: unknown): value is Theme {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.label === "string" &&
    v.label.trim() !== "" &&
    typeof v.description === "string" &&
    v.description.trim() !== ""
  );
}

function isClassSummary(value: unknown): value is ClassSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.themes) &&
    v.themes.length > 0 &&
    v.themes.every(isTheme) &&
    typeof v.advice === "string" &&
    v.advice.trim() !== ""
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  const { misconceptions } = await request.json();

  if (
    !Array.isArray(misconceptions) ||
    misconceptions.length === 0 ||
    !misconceptions.every((m: unknown) => typeof m === "string" && m.trim() !== "")
  ) {
    return NextResponse.json(
      { error: "misconceptions must be a non-empty array of strings." },
      { status: 400 }
    );
  }

  const prompt = `${INSTRUCTION}

Misconception summaries, one per student:
${misconceptions.map((m: string, i: number) => `${i + 1}. ${m}`).join("\n")}`;

  let outcome;
  try {
    const ai = new GoogleGenAI({ apiKey });
    outcome = await generateJson(ai, prompt, isClassSummary);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "Gemma's response wasn't valid class-summary JSON, even after retrying.",
        raw: outcome.raw,
      },
      { status: 502 }
    );
  }

  outcome.value.themes.forEach((t, i) => warnIfLooksLikeLatex(`themes[${i}].description`, t.description));
  warnIfLooksLikeLatex("advice", outcome.value.advice);

  return NextResponse.json(outcome.value);
}
```

- [x] **Step 2: Verify the route in isolation**

Run: `npm run lint && npm run build` (expected: pass). Then:

```bash
curl -s -X POST localhost:3000/api/class-summary \
  -H 'Content-Type: application/json' \
  -d '{"misconceptions": ["Added 3 to both sides instead of subtracting when isolating the term.", "Moved the constant across the equals sign without changing its sign.", "Divided only one side of the equation by 2."]}'
```

Expected: `{ "themes": [...], "advice": "..." }` with at least one theme grouping the two sign-related summaries.

- [x] **Step 3: Create `app/teacher/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { readFile, type UploadedImage } from "@/components/ImageUpload";
import LoadingNote from "@/components/LoadingNote";

interface StudentResult {
  name: string;
  status: "pending" | "working" | "done" | "error";
  isCorrect?: boolean;
  misconceptionSummary?: string | null;
  error?: string;
}

interface ClassSummary {
  themes: { label: string; description: string }[];
  advice: string;
}

export default function TeacherPage() {
  const [images, setImages] = useState<{ name: string; image: UploadedImage }[]>([]);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [summary, setSummary] = useState<ClassSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function pickFiles(list: FileList | null) {
    if (!list) return;
    const picked: { name: string; image: UploadedImage }[] = [];
    for (const file of Array.from(list)) {
      if (!["image/jpeg", "image/png"].includes(file.type)) continue;
      picked.push({ name: file.name, image: await readFile(file) });
    }
    setImages(picked);
    setResults(picked.map((p) => ({ name: p.name, status: "pending" })));
    setSummary(null);
    setSummaryError(null);
  }

  // ponytail: strictly sequential — parallel calls just trade 429s for
  // wall-clock time on the free tier. Parallelize when a paid key exists.
  async function run() {
    setIsRunning(true);
    setSummary(null);
    setSummaryError(null);
    const collected: StudentResult[] = images.map((p) => ({ name: p.name, status: "pending" }));

    for (let i = 0; i < images.length; i++) {
      collected[i] = { ...collected[i], status: "working" };
      setResults([...collected]);
      try {
        const tRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: images[i].image.base64,
            mimeType: images[i].image.mimeType,
          }),
        });
        const tData = await tRes.json();
        if (!tRes.ok) throw new Error(tData.error ?? "Transcription failed.");
        // Teacher flow marks one problem per photo — take the first.
        const item = tData.problems[0];
        if (!item.hasWorkedSolution) {
          throw new Error("No worked solution found in this photo.");
        }
        const aRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problemStatementLatex: item.problemStatementLatex,
            confirmedSteps: item.solutionSteps,
          }),
        });
        const aData = await aRes.json();
        if (!aRes.ok) throw new Error(aData.error ?? "Analysis failed.");
        collected[i] = {
          name: images[i].name,
          status: "done",
          isCorrect: aData.isCorrect,
          misconceptionSummary: aData.misconceptionSummary,
        };
      } catch (error) {
        collected[i] = {
          name: images[i].name,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error.",
        };
      }
      setResults([...collected]);
    }

    const misconceptions = collected
      .filter((r) => r.status === "done" && r.misconceptionSummary)
      .map((r) => r.misconceptionSummary as string);

    if (misconceptions.length > 0) {
      try {
        const sRes = await fetch("/api/class-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ misconceptions }),
        });
        const sData = await sRes.json();
        if (!sRes.ok) setSummaryError(sData.error ?? "Couldn't summarize the class.");
        else setSummary(sData);
      } catch {
        setSummaryError("Network error: could not reach the class-summary API.");
      }
    }
    setIsRunning(false);
  }

  const doneCount = results.filter((r) => r.status === "done" || r.status === "error").length;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          StepCheck for teachers
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Photograph a stack of attempts at the same problem. Gemma marks each
          one, then summarizes what the class misunderstands.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-white p-6">
        <label className="text-sm font-medium text-ink">
          Photos of student attempts (JPEG/PNG, one attempt per photo)
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          disabled={isRunning}
          onChange={(e) => void pickFiles(e.target.files)}
          className="text-sm text-ink-muted file:mr-3 file:rounded-full file:border file:border-hairline file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink"
        />
        <Button onClick={run} disabled={isRunning || images.length === 0}>
          {isRunning ? `Marking ${doneCount + 1} of ${images.length}…` : `Mark ${images.length || "the"} attempts`}
        </Button>
        {isRunning && (
          <LoadingNote label="Marking one attempt at a time to stay inside API rate limits." />
        )}
      </section>

      {results.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-white p-6 text-sm">
          {results.map((r) => (
            <div key={r.name} className="flex items-baseline justify-between gap-3 border-b border-hairline-soft pb-2 last:border-b-0 last:pb-0">
              <p className="font-mono text-xs text-ink-muted">{r.name}</p>
              {r.status === "pending" && <p className="text-ink-muted">Waiting…</p>}
              {r.status === "working" && <p className="text-ink-muted">Marking…</p>}
              {r.status === "error" && <p className="text-mark-error">{r.error}</p>}
              {r.status === "done" &&
                (r.isCorrect ? (
                  <p className="font-medium text-mark-correct">Correct</p>
                ) : (
                  <p className="text-mark-error">{r.misconceptionSummary}</p>
                ))}
            </div>
          ))}
        </section>
      )}

      {summaryError && (
        <section className="rounded-lg border border-mark-error/40 bg-mark-error/5 p-6 text-sm text-ink-muted">
          {summaryError}
        </section>
      )}

      {summary && (
        <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-white p-6 text-sm">
          <p className="font-display text-xl font-semibold tracking-tight text-ink">
            What the class misunderstands
          </p>
          {summary.themes.map((t) => (
            <div key={t.label} className="rounded-md border border-mark-flag/40 bg-mark-flag/5 p-4">
              <p className="font-medium text-ink">{t.label}</p>
              <p className="mt-1 text-ink-muted">{t.description}</p>
            </div>
          ))}
          <div className="rounded-md bg-surface p-4">
            <p className="font-medium text-ink">Where to start</p>
            <p className="mt-1 text-ink-muted">{summary.advice}</p>
          </div>
        </section>
      )}
    </main>
  );
}
```

- [x] **Step 4: Link it from the landing screen**

In `app/page.tsx`, in the landing return (Task 6 Step 4), add after `<HistoryList />`:

```tsx
        <p className="pb-10 text-center text-sm text-ink-muted">
          Teaching a class?{" "}
          <a href="/teacher" className="underline underline-offset-4 hover:text-ink">
            Mark a stack of photos at once
          </a>
          .
        </p>
```

- [x] **Step 5: Verify in the browser**

Run: `npm run lint && npm run build` (expected: pass). Visit `localhost:3000/teacher`, select 2–3 worked-solution photos from `test-problems/`, click Mark. Expected: rows flip Waiting → Marking → verdict one at a time (each can take 60s+); wrong attempts show their misconception sentence; after the last photo, a "What the class misunderstands" card with themed groups and reteaching advice. Photos with no worked solution show a row-level error without stopping the batch.

- [x] **Step 6: Commit**

```bash
git add app/api/class-summary/route.ts app/teacher/page.tsx app/page.tsx
git commit -m "feat: teacher mode — batch-mark attempts and summarize class misconceptions"
```

---

### Task 15: Streaming step-by-step reveal (NDJSON, with automatic fallback)

**Files:**
- Create: `lib/prompts.ts` (shared grading rules, extracted from analyze)
- Create: `app/api/analyze-stream/route.ts`
- Modify: `app/api/analyze/route.ts` (compose INSTRUCTION from `lib/prompts.ts`)
- Modify: `app/page.tsx` (`streamAnalyze`, live marks in the loading card, fallback wiring in `runResult`)

**Interfaces:**
- Consumes: `MODEL` from `lib/gemini.ts`; Task 3's loading card; Task 6's `saveHistoryEntry`; Task 7's `misconceptionTag`.
- Produces: `GRADING_RULES`, `PLAIN_LANGUAGE_RULE` exported from `lib/prompts.ts`; `POST /api/analyze-stream` returning `application/x-ndjson` — one `{ stepIndex, status, explanation }` line per step, then one `{ final: true, isCorrect, firstErrorStepIndex, misconceptionSummary, misconceptionTag, correctContinuation, correctContinuationExplanation }` line. On ANY stream/shape failure the client silently falls back to the classic `/api/analyze` (which has full retry/salvage), so reliability never regresses.

Why: the biggest perceived-latency win — the student watches ticks appear step by step during the wait instead of staring at dots for two minutes. Layered last because the fallback depends on the hardened classic route.

- [x] **Step 1: Extract shared prompt text into `lib/prompts.ts`**

Route files must only export HTTP handlers/config, so shared text lives in `lib/`. Create `lib/prompts.ts` by MOVING (verbatim) two chunks of `app/api/analyze/route.ts`'s `INSTRUCTION`:

```ts
// Shared between /api/analyze (single JSON object) and /api/analyze-stream
// (NDJSON). The grading semantics must never drift between the two.

export const GRADING_RULES = `You are a rigorous math grader.

You will be given a problem statement and a student's confirmed, step-by-step
solution, both in LaTeX. Work through this in order, internally:

1. Solve the problem yourself, independently, before looking at the student's
   steps. Do not let the student's work bias your own derivation.
2. Compare your independent solution against the student's steps, one step at
   a time, in order.
3. Identify the first step (if any) where the student's step no longer
   follows from valid mathematics, given everything confirmed correct so far.
   A step is only "incorrect" if it is the first place the reasoning breaks;
   every step after that first error is "not_reached" because a broken
   derivation never validly reaches them, even if their algebra would be
   fine in isolation.
4. Only after finishing 1-3, write your final answer.

If every step is valid, isCorrect must be true, and every step's status must
be "correct" with a genuine explanation of why that specific step is valid
(not a generic approval).

If a step is wrong, isCorrect must be false. Set firstErrorStepIndex to the
0-based index of that step. Steps before it are "correct" (with real
explanations), that step is "incorrect" (with an explanation naming the
specific misconception), and every step after it is "not_reached". Also fill
misconceptionSummary, misconceptionTag, correctContinuation (LaTeX,
continuing correctly from right before the error), and
correctContinuationExplanation.

misconceptionTag is a SHORT lowercase label of 2-4 plain words naming the
skill behind the error, reusable across problems — like "sign distribution",
"fraction addition", or "chain rule". No LaTeX, no punctuation.`;

export const PLAIN_LANGUAGE_RULE = `CRITICAL formatting rule for all prose/explanation fields (explanation,
misconceptionSummary, correctContinuationExplanation): write them in plain,
natural human language, as if speaking to a student out loud. Never use
LaTeX syntax, dollar-sign math delimiters, or raw markup commands like
\\frac{}, \\cdot, ^{}, or _{} inside these fields. If you need to mention a
piece of math, describe it in words or write it as plain readable text.

BAD (do not do this):
"the derivative of $2x^2$ should be $2 \\cdot 2x = 4x$, but the student wrote $2x$"

GOOD (do this instead):
"the derivative of 2x squared should be 4x (2 times 2x), but the student wrote 2x"

This rule does NOT apply to correctContinuation, which must remain real LaTeX
since it is rendered in a math input field, not displayed as text.`;
```

In `app/api/analyze/route.ts`, replace the duplicated portions of `INSTRUCTION` with a composition (keep the JSON-shape tail exactly as it stands after Task 7):

```ts
import { GRADING_RULES, PLAIN_LANGUAGE_RULE } from "@/lib/prompts";

const INSTRUCTION = `${GRADING_RULES}

${PLAIN_LANGUAGE_RULE}

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape:

{
  "isCorrect": boolean,
  "firstErrorStepIndex": number | null,
  "stepByStepFeedback": [
    { "stepIndex": number, "status": "correct" | "incorrect" | "not_reached", "explanation": string }
  ],
  "misconceptionSummary": string | null,
  "misconceptionTag": string | null,
  "correctContinuation": string | null,
  "correctContinuationExplanation": string | null
}

stepByStepFeedback must have exactly one entry per student step, in order.
misconceptionSummary, misconceptionTag, correctContinuation, and
correctContinuationExplanation must be null when isCorrect is true.`;
```

Verify with the Task 7 curl that `/api/analyze` output is unchanged.

- [x] **Step 2: Create `app/api/analyze-stream/route.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { MODEL } from "@/lib/gemini";
import { GRADING_RULES, PLAIN_LANGUAGE_RULE } from "@/lib/prompts";

export const runtime = "nodejs";
// Same rationale as /api/analyze — the stream stays open just as long.
export const maxDuration = 180;

// ponytail: no retries and no JSON salvage here — a broken stream makes the
// client silently fall back to the classic /api/analyze, which has both.
const INSTRUCTION = `${GRADING_RULES}

${PLAIN_LANGUAGE_RULE}

Output NDJSON: one complete JSON object PER LINE, no commentary, no markdown
fences, no blank lines, in exactly this order:

1. For each student step, in index order, one line:
{"stepIndex": number, "status": "correct" | "incorrect" | "not_reached", "explanation": string}

2. Then exactly one final line:
{"final": true, "isCorrect": boolean, "firstErrorStepIndex": number | null, "misconceptionSummary": string | null, "misconceptionTag": string | null, "correctContinuation": string | null, "correctContinuationExplanation": string | null}`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  const { problemStatementLatex, confirmedSteps } = await request.json();

  if (
    !problemStatementLatex ||
    !Array.isArray(confirmedSteps) ||
    confirmedSteps.length === 0 ||
    !confirmedSteps.every((s: unknown) => typeof s === "string")
  ) {
    return NextResponse.json(
      { error: "problemStatementLatex and a non-empty array of string confirmedSteps are required." },
      { status: 400 }
    );
  }

  const prompt = `${INSTRUCTION}

Problem statement (LaTeX):
${problemStatementLatex}

Student's confirmed steps (LaTeX), 0-based index per line:
${confirmedSteps.map((step: string, i: number) => `${i}: ${step}`).join("\n")}`;

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

- [x] **Step 3: Consume the stream in `app/page.tsx`, with fallback**

Add state next to the other result state:

```tsx
  // Step marks that have arrived so far over the analyze stream, shown
  // inside the loading card while the rest is still generating.
  const [liveFeedback, setLiveFeedback] = useState<StepFeedback[]>([]);
```

Add `setLiveFeedback([]);` to the reset lists in `runResult`, `startOver()`, and `loadQueueItem`.

Add the stream consumer after `runHints`:

```tsx
  // Returns a full AnalysisResult if the stream produced a complete, valid
  // marking; null on ANY shortfall — the caller then falls back to the
  // classic /api/analyze, which has retries and JSON salvage.
  async function streamAnalyze(
    problemToUse: string,
    stepsToUse: string[]
  ): Promise<AnalysisResult | null> {
    const res = await fetch("/api/analyze-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemStatementLatex: problemToUse, confirmedSteps: stepsToUse }),
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const feedback: StepFeedback[] = [];
    let finalLine: Record<string, unknown> | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim().replace(/^```(?:json)?|```$/g, "").trim();
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (
            obj &&
            typeof obj.stepIndex === "number" &&
            (obj.status === "correct" || obj.status === "incorrect" || obj.status === "not_reached") &&
            typeof obj.explanation === "string"
          ) {
            feedback.push(obj);
            setLiveFeedback([...feedback]);
          } else if (obj && obj.final === true) {
            finalLine = obj;
          }
        } catch {
          // Partial or junk line — ignore; completeness is checked at the end.
        }
      }
    }

    if (
      !finalLine ||
      feedback.length !== stepsToUse.length ||
      typeof finalLine.isCorrect !== "boolean" ||
      !(finalLine.firstErrorStepIndex === null || typeof finalLine.firstErrorStepIndex === "number") ||
      !(finalLine.misconceptionSummary === null || typeof finalLine.misconceptionSummary === "string") ||
      !(finalLine.misconceptionTag === null || typeof finalLine.misconceptionTag === "string") ||
      !(finalLine.correctContinuation === null || typeof finalLine.correctContinuation === "string") ||
      !(finalLine.correctContinuationExplanation === null ||
        typeof finalLine.correctContinuationExplanation === "string")
    ) {
      return null;
    }

    return {
      isCorrect: finalLine.isCorrect as boolean,
      firstErrorStepIndex: finalLine.firstErrorStepIndex as number | null,
      stepByStepFeedback: feedback,
      misconceptionSummary: finalLine.misconceptionSummary as string | null,
      misconceptionTag: finalLine.misconceptionTag as string | null,
      correctContinuation: finalLine.correctContinuation as string | null,
      correctContinuationExplanation: finalLine.correctContinuationExplanation as string | null,
    };
  }
```

In `runResult`, replace the analyze branch's body (the `fetch("/api/analyze", ...)` block) with:

```tsx
        const streamed = await streamAnalyze(problemToUse, stepsToUse).catch(() => null);
        if (streamed) {
          setAnalysis(streamed);
          saveHistoryEntry({
            at: Date.now(),
            problemLatex: problemToUse,
            outcome: streamed.isCorrect ? "correct" : "incorrect",
            misconceptionSummary: streamed.misconceptionSummary,
            misconceptionTag: streamed.misconceptionTag ?? null,
          });
        } else {
          setLiveFeedback([]);
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              problemStatementLatex: problemToUse,
              confirmedSteps: stepsToUse,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setResultError({ message: data.error ?? "Analysis failed.", raw: data.raw });
            return;
          }
          setAnalysis(data);
          saveHistoryEntry({
            at: Date.now(),
            problemLatex: problemToUse,
            outcome: data.isCorrect ? "correct" : "incorrect",
            misconceptionSummary: data.misconceptionSummary,
            misconceptionTag: data.misconceptionTag ?? null,
          });
        }
```

- [x] **Step 4: Show live marks inside the loading card**

Inside the results-screen loading section, after the `<LoadingNote ... />` line, add:

```tsx
            {confirmed?.steps && liveFeedback.length > 0 && (
              <div className="flex w-full flex-col gap-2 text-left">
                {confirmed.steps.map((_, i) => {
                  const fb = liveFeedback.find((f) => f.stepIndex === i);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-md border border-hairline-soft bg-surface-soft px-3 py-2 text-sm"
                    >
                      <div className="flex w-5 justify-center">
                        {fb && <StepMark status={fb.status} delayMs={0} />}
                      </div>
                      <span className="text-ink-muted">
                        Step {i + 1}
                        {fb ? ` — ${fb.status.replace("_", " ")}` : "…"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
```

(`StepMark` is already imported; this reuses its existing draw-on animation, no new animation system.)

- [x] **Step 5: Verify**

Run: `npm run lint && npm run build` (expected: pass). Streaming path:

```bash
curl -sN -X POST localhost:3000/api/analyze-stream \
  -H 'Content-Type: application/json' \
  -d '{"problemStatementLatex": "2x + 3 = 11", "confirmedSteps": ["2x = 8", "x = 4"]}'
```

Expected: lines arrive incrementally (`-N` disables curl buffering) — two step objects then one `"final": true` line.

In the browser: run an analyze with 3+ steps and watch the loading card — tick/cross rows appear one by one before the full results screen replaces them. Fallback check: temporarily rename the `app/api/analyze-stream` directory to `app/api/analyze-stream-off`, run an analyze — expected: identical final results via the classic route (no user-visible error) — then rename it back.

- [x] **Step 6: Commit**

```bash
git add lib/prompts.ts app/api/analyze-stream/route.ts app/api/analyze/route.ts app/page.tsx
git commit -m "feat: stream analyze marks step by step with automatic fallback to the classic route"
```

---

## Deliberately out of scope (and when to reconsider)

- **Hedged duplicate requests** after ~75s — burns quota; measure how far Tasks 1–2 get first.
- **Repair-prompt second call** instead of full regeneration in `generateJson` — add if the double-generation worst case shows up in logs.
- **Accounts / cross-device history sync** — localStorage until someone asks.
- **Fixed misconception taxonomy** — free-form tags at temperature 0 first; revisit if labels fragment.
- **Dedicated cheap "re-check one step" route** — the full re-grade via `/api/analyze` first; add if the wait annoys.

## Suggested session split (execution)

| Session | Tasks | Theme | Why this grouping |
|---|---|---|---|
| 1 | 1–3 | Reliability + wait UX | Small diffs, mostly `lib/gemini.ts`; everything after builds on `generateJson`. |
| 2 | 4–7 | Results-screen learning loop + history | All four touch `app/page.tsx`'s results screen — one read of the file serves four tasks. |
| 3 | 8–10 | New input paths + chat | Confirm-screen cluster plus two self-contained routes. |
| 4 | 11–12 | Worksheet mode + mobile | The transcribe shape change is the riskiest diff in the plan — give it a fresh context window. |
| 5 | 13–14 | Explain-back + teacher mode | Two independent route+UI pairs; teacher mode needs 11's shape and 12's `readFile` already landed. |
| 6 | 15 | Streaming | Most invasive client change; do it last, alone, against a stable base. |
