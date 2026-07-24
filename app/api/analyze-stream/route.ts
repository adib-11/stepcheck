import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { extractJsonObject, generateBounded } from "@/lib/gemini";
import { PLAIN_LANGUAGE_RULE } from "@/lib/prompts";

export const runtime = "nodejs";
// Same rationale as /api/analyze — the stream stays open just as long.
export const maxDuration = 300;

// FAN-OUT DESIGN: gemma-4's full-grading prompt stochastically triggers a
// runaway-thinking loop (32k thought tokens, zero output, ~11 min — see
// CLAUDE.md), and under load the model also 503s. Small single-step prompts
// stay in the safe zone (~300 thought tokens, observed reliable), so this
// route grades ONE STEP PER GEMMA CALL: a bounded-concurrency pool, results
// emitted in index order as they resolve (preserving the client's NDJSON
// contract and live marks), early abort once the first error is found, and
// one small follow-up call for the misconception/continuation. Grading
// semantics match GRADING_RULES: the first invalid step is "incorrect",
// everything after it is "not_reached".
const STEP_CONCURRENCY = 2;
// Per-step checks think ~300 tokens when healthy; the follow-up (which must
// re-derive the correct continuation) gets more headroom.
const STEP_MAX_THOUGHTS = 4_000;
const FOLLOWUP_MAX_THOUGHTS = 8_000;

function stepPrompt(problem: string, steps: string[], i: number): string {
  return `You are a math grader checking ONE step of a student's worked solution.

Problem statement (LaTeX):
${problem}

Student's steps so far (LaTeX), 0-based; step ${i} is the one to check:
${steps
    .slice(0, i + 1)
    .map((s, j) => `${j}: ${s}`)
    .join("\n")}

Treat steps 0 to ${i - 1} as given context. Decide whether step ${i} is
mathematically valid as the next move. This is a routine single-step check —
decide it directly.

Output ONE line of JSON only, no markdown fences, no commentary:
{"valid": true | false, "explanation": string}

"explanation" is one short plain-English sentence (no LaTeX): why the step is
valid, or the specific mistake if it is not.`;
}

function followupPrompt(
  problem: string,
  steps: string[],
  errorIndex: number,
  errorExplanation: string
): string {
  return `A student made their first mistake at step ${errorIndex} of this worked solution.

Problem statement (LaTeX):
${problem}

Student's steps (LaTeX), 0-based:
${steps.map((s, j) => `${j}: ${s}`).join("\n")}

The mistake at step ${errorIndex}: ${errorExplanation}

${PLAIN_LANGUAGE_RULE}

misconceptionTag is a SHORT lowercase label of 2-4 plain words naming the
skill behind the error, reusable across problems — like "sign distribution",
"fraction addition", or "chain rule". No LaTeX, no punctuation.

Output ONE JSON object only, no markdown fences, no commentary:
{"misconceptionSummary": string, "misconceptionTag": string, "correctContinuation": string, "correctContinuationExplanation": string}

"correctContinuation" is LaTeX continuing correctly from right before the
error. The other three fields are plain natural language.`;
}

type StepVerdict = { valid: boolean; explanation: string };

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

  const steps: string[] = confirmedSteps;
  const ai = new GoogleGenAI({ apiKey });
  const encoder = new TextEncoder();

  // One small Gemma call per step. Parse failures get ONE regeneration before
  // giving up (generateBounded already retries API-level failures inside).
  const checkStep = async (i: number): Promise<StepVerdict> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await generateBounded(ai, stepPrompt(problemStatementLatex, steps, i), STEP_MAX_THOUGHTS);
      try {
        const parsed: unknown = JSON.parse(extractJsonObject(raw));
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          typeof (parsed as { valid?: unknown }).valid === "boolean"
        ) {
          const explanation = (parsed as { explanation?: unknown }).explanation;
          return {
            valid: (parsed as { valid: boolean }).valid,
            explanation: typeof explanation === "string" ? explanation : "",
          };
        }
      } catch {
        // fall through to regeneration
      }
      console.warn(`[analyze-stream] step ${i} check returned unusable JSON (attempt ${attempt})`);
    }
    throw new Error(`Step ${i} check produced unusable JSON twice.`);
  };

  const stream = new ReadableStream({
    async start(controller) {
      // Only whole NDJSON lines are ever enqueued, so a heartbeat (blank
      // line, skipped by the client's parser) can never split a line. It
      // covers the wait while per-step calls queue under load.
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode("\n"));
      }, 10_000);
      const emit = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const inFlight = new Map<number, Promise<StepVerdict>>();
      try {
        let firstError: number | null = null;
        let firstErrorExplanation = "";
        let launched = 0;
        // Process strictly in index order so emitted statuses are final:
        // a step's verdict only depends on whether an earlier step failed.
        for (let i = 0; i < steps.length; i++) {
          if (firstError !== null) {
            emit({ stepIndex: i, status: "not_reached", explanation: "" });
            continue;
          }
          while (inFlight.size < STEP_CONCURRENCY && launched < steps.length) {
            inFlight.set(launched, checkStep(launched));
            launched++;
          }
          const verdict = await inFlight.get(i)!;
          inFlight.delete(i);
          if (verdict.valid) {
            emit({ stepIndex: i, status: "correct", explanation: verdict.explanation });
          } else {
            firstError = i;
            firstErrorExplanation = verdict.explanation;
            emit({ stepIndex: i, status: "incorrect", explanation: verdict.explanation });
          }
        }
        // Steps launched beyond the first error are abandoned — swallow
        // their rejections so they can't crash the process later.
        inFlight.forEach((p) => p.catch(() => {}));

        const final: Record<string, unknown> = {
          final: true,
          isCorrect: firstError === null,
          firstErrorStepIndex: firstError,
          misconceptionSummary: null,
          misconceptionTag: null,
          correctContinuation: null,
          correctContinuationExplanation: null,
        };
        if (firstError !== null) {
          // Degrade gracefully: the marking is already delivered, so a
          // failed follow-up keeps the nulls instead of sinking the stream.
          try {
            const raw = await generateBounded(
              ai,
              followupPrompt(problemStatementLatex, steps, firstError, firstErrorExplanation),
              FOLLOWUP_MAX_THOUGHTS
            );
            const parsed: unknown = JSON.parse(extractJsonObject(raw));
            if (parsed !== null && typeof parsed === "object") {
              for (const key of [
                "misconceptionSummary",
                "misconceptionTag",
                "correctContinuation",
                "correctContinuationExplanation",
              ] as const) {
                const value = (parsed as Record<string, unknown>)[key];
                if (typeof value === "string" && value) final[key] = value;
              }
            }
          } catch (error) {
            console.warn("[analyze-stream] misconception follow-up failed:", error);
          }
        }
        emit(final);
        controller.close();
      } catch (error) {
        // Headers already went out, so Next still logs this request as a
        // 200 — this line is the only server-side trace of the failure.
        console.error("[analyze-stream] fan-out failed:", error);
        inFlight.forEach((p) => p.catch(() => {}));
        controller.error(error);
      } finally {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
