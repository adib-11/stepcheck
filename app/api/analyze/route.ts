import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";

export const runtime = "nodejs";
// Gemma can legitimately take 60-150s+ on multi-step problems (confirmed by
// direct testing: 69s/151s/70s runs all returned complete, valid JSON).
// Without this, a hosting platform's default serverless function timeout
// (e.g. Vercel's 60s on Hobby) can kill an otherwise-successful request
// mid-flight, surfacing as a 502 gateway error rather than an app error.
export const maxDuration = 180;

const INSTRUCTION = `You are a rigorous math grader.

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
misconceptionSummary, correctContinuation (LaTeX, continuing correctly from
right before the error), and correctContinuationExplanation.

CRITICAL formatting rule for all prose/explanation fields (explanation,
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
since it is rendered in a math input field, not displayed as text.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape:

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

stepByStepFeedback must have exactly one entry per student step, in order.
misconceptionSummary, correctContinuation, and correctContinuationExplanation
must be null when isCorrect is true.`;

interface StepFeedback {
  stepIndex: number;
  status: "correct" | "incorrect" | "not_reached";
  explanation: string;
}

interface AnalysisResult {
  isCorrect: boolean;
  firstErrorStepIndex: number | null;
  stepByStepFeedback: StepFeedback[];
  misconceptionSummary: string | null;
  correctContinuation: string | null;
  correctContinuationExplanation: string | null;
}

function isStepFeedback(value: unknown): value is StepFeedback {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.stepIndex === "number" &&
    (v.status === "correct" || v.status === "incorrect" || v.status === "not_reached") &&
    typeof v.explanation === "string"
  );
}

/** Validates the parsed JSON actually matches the AnalysisResult shape. */
function isAnalysisResult(value: unknown, stepCount: number): value is AnalysisResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.isCorrect === "boolean" &&
    (v.firstErrorStepIndex === null || typeof v.firstErrorStepIndex === "number") &&
    Array.isArray(v.stepByStepFeedback) &&
    v.stepByStepFeedback.length === stepCount &&
    v.stepByStepFeedback.every(isStepFeedback) &&
    (v.misconceptionSummary === null || typeof v.misconceptionSummary === "string") &&
    (v.correctContinuation === null || typeof v.correctContinuation === "string") &&
    (v.correctContinuationExplanation === null ||
      typeof v.correctContinuationExplanation === "string")
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

  parsed.stepByStepFeedback.forEach((fb) =>
    warnIfLooksLikeLatex(`stepByStepFeedback[${fb.stepIndex}].explanation`, fb.explanation)
  );
  warnIfLooksLikeLatex("misconceptionSummary", parsed.misconceptionSummary);
  warnIfLooksLikeLatex("correctContinuationExplanation", parsed.correctContinuationExplanation);

  return NextResponse.json(parsed);
}
