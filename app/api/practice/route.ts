import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";

export const runtime = "nodejs";
// Same rationale as the other Gemma routes: without this, platform default
// serverless timeouts kill long generations mid-flight as gateway 502s.
export const maxDuration = 300;

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
