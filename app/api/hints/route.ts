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
