import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { MODEL } from "@/lib/gemini";
import { GRADING_RULES, PLAIN_LANGUAGE_RULE } from "@/lib/prompts";

export const runtime = "nodejs";
// Same rationale as /api/analyze — the stream stays open just as long.
export const maxDuration = 300;

// ponytail: no retries and no JSON salvage here — a broken stream makes the
// client silently fall back to the classic /api/analyze, which has both.
const INSTRUCTION = `${GRADING_RULES}

${PLAIN_LANGUAGE_RULE}

Output NDJSON: one complete JSON object PER LINE, no commentary, no markdown
fences, no blank lines, in exactly this order:

1. For each student step, in index order, one line:
{"stepIndex": number, "status": "correct" | "incorrect" | "not_reached", "explanation": string}

2. Then exactly one final line:
{"final": true, "isCorrect": boolean, "firstErrorStepIndex": number | null, "misconceptionSummary": string | null, "misconceptionTag": string | null, "correctContinuation": string | null, "correctContinuationExplanation": string | null}`;

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

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContentStream({
      model: MODEL,
      contents: prompt,
      config: { temperature: 0 },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
