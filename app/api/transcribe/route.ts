import { GoogleGenAI, createPartFromBase64, createUserContent } from "@google/genai";
import { NextResponse } from "next/server";
import { generateWithRetry, stripFences } from "@/lib/gemini";

export const runtime = "nodejs";

// Single vision call that both transcribes the photo and classifies whether
// it contains a worked solution attempt, not just the problem statement.
// One well-structured prompt does both jobs so there's no second model call
// just for classification (see LOCKS).
const INSTRUCTION = `You are reading a photo of a math problem for a student.

The photo may contain ONLY a problem statement, or it may contain a problem
statement PLUS the student's own handwritten attempt at solving it.

1. Transcribe the problem statement into LaTeX.
2. Decide whether the photo also shows worked solution steps written by the
   student (not just the problem, and not a printed answer key) — if there
   is any handwritten attempt at solving it, however partial, treat it as a
   worked solution.
3. If there is a worked solution, transcribe each step of it into LaTeX, one
   step per array entry, in the order written. If a line is illegible,
   transcribe your best guess rather than skipping it.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly one of these two shapes:

If there is NO worked solution in the photo:
{ "hasWorkedSolution": false, "problemStatementLatex": string }

If there IS a worked solution in the photo:
{ "hasWorkedSolution": true, "problemStatementLatex": string, "solutionSteps": string[] }`;

interface NoSolutionResult {
  hasWorkedSolution: false;
  problemStatementLatex: string;
}

interface WithSolutionResult {
  hasWorkedSolution: true;
  problemStatementLatex: string;
  solutionSteps: string[];
}

type TranscribeResult = NoSolutionResult | WithSolutionResult;

function isTranscribeResult(value: unknown): value is TranscribeResult {
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

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  const { imageBase64, mimeType } = await request.json();

  if (!imageBase64 || !mimeType) {
    return NextResponse.json(
      { error: "imageBase64 and mimeType are required." },
      { status: 400 }
    );
  }

  let raw: string;
  try {
    const ai = new GoogleGenAI({ apiKey });
    raw = await generateWithRetry(
      ai,
      createUserContent([createPartFromBase64(imageBase64, mimeType), INSTRUCTION])
    );
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

  if (!isTranscribeResult(parsed)) {
    return NextResponse.json(
      { error: "Gemma's response did not match the expected transcription shape.", raw },
      { status: 502 }
    );
  }

  return NextResponse.json(parsed);
}
