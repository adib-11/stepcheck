import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson, warnIfLooksLikeLatex } from "@/lib/gemini";
import { GRADING_RULES, PLAIN_LANGUAGE_RULE } from "@/lib/prompts";

export const runtime = "nodejs";
// Gemma can legitimately take 60-150s+ on multi-step problems (confirmed by
// direct testing: 69s/151s/70s runs all returned complete, valid JSON).
// Without this, a hosting platform's default serverless function timeout
// (e.g. Vercel's 60s on Hobby) can kill an otherwise-successful request
// mid-flight, surfacing as a 502 gateway error rather than an app error.
export const maxDuration = 180;

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
  misconceptionTag: string | null;
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
    (v.misconceptionTag === null || typeof v.misconceptionTag === "string") &&
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
