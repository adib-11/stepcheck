import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateWithRetry, stripFences, warnIfLooksLikeLatex } from "@/lib/gemini";

export const runtime = "nodejs";
// Same rationale as /api/analyze: solve() hits the same model with similar
// reasoning demands and can legitimately run 60-150s+, so it needs the same
// extended function duration to avoid an infra-level 502 mid-request.
export const maxDuration = 180;

// Clean sibling to /api/analyze — solves a problem from scratch with full
// explanation. Does NOT compare against any student work (there is none to
// compare against), so it must not be built on top of analyze's
// solve-then-compare-then-verdict prompt (see DO-NOT LIST).
const INSTRUCTION = `You are a math tutor. You will be given a problem
statement in LaTeX. Solve it step by step.

For each step, give the LaTeX for the work done in that step, and a plain
explanation of why that step is valid and what it accomplishes. A student
with no attempt of their own should be able to follow your reasoning from
step to step. Finish with the final answer in LaTeX.

CRITICAL formatting rule for the explanation field: write it in plain,
natural human language, as if speaking to a student out loud. Never use
LaTeX syntax, dollar-sign math delimiters, or raw markup commands like
\\frac{}, \\cdot, ^{}, or _{} inside explanation. If you need to mention a
piece of math, describe it in words or write it as plain readable text.

BAD (do not do this):
"the derivative of $2x^2$ is $2 \\cdot 2x = 4x$"

GOOD (do this instead):
"the derivative of 2x squared is 4x (2 times 2x)"

This rule does NOT apply to workLatex or finalAnswerLatex, which must remain
real LaTeX since they are rendered in math input fields, not displayed as
text.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape:

{
  "steps": [
    { "stepIndex": number, "workLatex": string, "explanation": string }
  ],
  "finalAnswerLatex": string
}

steps must be 0-indexed and in order.`;

interface SolveStep {
  stepIndex: number;
  workLatex: string;
  explanation: string;
}

interface SolveResult {
  steps: SolveStep[];
  finalAnswerLatex: string;
}

function isSolveStep(value: unknown): value is SolveStep {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.stepIndex === "number" &&
    typeof v.workLatex === "string" &&
    typeof v.explanation === "string"
  );
}

function isSolveResult(value: unknown): value is SolveResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.steps) &&
    v.steps.length > 0 &&
    v.steps.every(isSolveStep) &&
    typeof v.finalAnswerLatex === "string"
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

  let raw: string;
  try {
    const ai = new GoogleGenAI({ apiKey });
    raw = await generateWithRetry(ai, prompt);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return NextResponse.json(
      { error: "Gemma's response could not be parsed as JSON.", raw },
      { status: 502 }
    );
  }

  if (!isSolveResult(parsed)) {
    return NextResponse.json(
      { error: "Gemma's response did not match the expected solve shape.", raw },
      { status: 502 }
    );
  }

  parsed.steps.forEach((step) =>
    warnIfLooksLikeLatex(`steps[${step.stepIndex}].explanation`, step.explanation)
  );

  return NextResponse.json(parsed);
}
