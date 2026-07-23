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
