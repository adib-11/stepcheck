import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";

export const runtime = "nodejs";
// Same rationale as the other Gemma routes.
export const maxDuration = 300;

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
