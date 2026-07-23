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

  const ai = new GoogleGenAI({ apiKey });
  const encoder = new TextEncoder();
  // The Gemma call starts INSIDE the stream so headers go out immediately,
  // and blank-line heartbeats keep the connection alive through Gemma's
  // first-token wait (observed at 100s+ under load — long enough for Safari
  // and proxies to kill a silent request). The client's NDJSON parser skips
  // blank lines, but a heartbeat must never land mid-line, so it only fires
  // at a line boundary (nothing sent yet, or the last byte was a newline).
  const stream = new ReadableStream({
    async start(controller) {
      let atLineBoundary = true;
      const heartbeat = setInterval(() => {
        if (atLineBoundary) controller.enqueue(encoder.encode("\n"));
      }, 10_000);
      try {
        const response = await ai.models.generateContentStream({
          model: MODEL,
          contents: prompt,
          config: { temperature: 0 },
        });
        for await (const chunk of response) {
          if (chunk.text) {
            atLineBoundary = chunk.text.endsWith("\n");
            controller.enqueue(encoder.encode(chunk.text));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
