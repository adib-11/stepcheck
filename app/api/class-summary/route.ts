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
