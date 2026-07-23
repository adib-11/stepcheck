import { GoogleGenAI, createPartFromBase64, createUserContent } from "@google/genai";
import { NextResponse } from "next/server";
import { generateJson } from "@/lib/gemini";

export const runtime = "nodejs";
// Same rationale as /api/analyze and /api/solve: any route calling Gemma
// needs this or the platform's default timeout kills long requests as 502s.
export const maxDuration = 180;

// Single vision call that both transcribes the photo and classifies whether
// it contains a worked solution attempt, not just the problem statement.
// One well-structured prompt does both jobs so there's no second model call
// just for classification (see LOCKS).
const INSTRUCTION = `You are reading a photo of math homework for a student.

The photo may contain ONE OR MORE problems. Each problem may appear as ONLY
a problem statement, or as a problem statement PLUS the student's own
handwritten attempt at solving it.

For EACH problem in the photo, in reading order (top to bottom, left column
before right):
1. Transcribe the problem statement into LaTeX.
2. Decide whether the photo also shows worked solution steps written by the
   student for THAT problem (not just the problem, and not a printed answer
   key) — if there is any handwritten attempt at solving it, however
   partial, treat it as a worked solution.
3. If there is a worked solution, transcribe each step of it into LaTeX, one
   step per array entry, in the order written. If a line is illegible,
   transcribe your best guess rather than skipping it.

Output ONLY a single JSON object, no commentary, no markdown fences, matching
exactly this shape, with one entry per problem:

{
  "problems": [
    { "hasWorkedSolution": false, "problemStatementLatex": string }
    OR
    { "hasWorkedSolution": true, "problemStatementLatex": string, "solutionSteps": string[] }
  ]
}`;

interface NoSolutionItem {
  hasWorkedSolution: false;
  problemStatementLatex: string;
}

interface WithSolutionItem {
  hasWorkedSolution: true;
  problemStatementLatex: string;
  solutionSteps: string[];
}

type TranscribeItem = NoSolutionItem | WithSolutionItem;

interface TranscribeBatch {
  problems: TranscribeItem[];
}

function isTranscribeItem(value: unknown): value is TranscribeItem {
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

function isTranscribeBatch(value: unknown): value is TranscribeBatch {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // ponytail: 6-problem cap — a denser worksheet needs cropping into two
  // photos; raise when a real page busts it.
  return (
    Array.isArray(v.problems) &&
    v.problems.length >= 1 &&
    v.problems.length <= 6 &&
    v.problems.every(isTranscribeItem)
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

  const { imageBase64, mimeType } = await request.json();

  if (!imageBase64 || !mimeType) {
    return NextResponse.json(
      { error: "imageBase64 and mimeType are required." },
      { status: 400 }
    );
  }

  let outcome;
  try {
    const ai = new GoogleGenAI({ apiKey });
    outcome = await generateJson(
      ai,
      createUserContent([createPartFromBase64(imageBase64, mimeType), INSTRUCTION]),
      isTranscribeBatch
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: "Gemma's response wasn't valid transcription JSON, even after retrying.",
        raw: outcome.raw,
      },
      { status: 502 }
    );
  }
  return NextResponse.json(outcome.value);
}
