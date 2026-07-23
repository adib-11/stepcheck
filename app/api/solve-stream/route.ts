import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { MODEL } from "@/lib/gemini";
import { PLAIN_LANGUAGE_RULE } from "@/lib/prompts";

export const runtime = "nodejs";
// Same rationale as /api/solve — the stream stays open just as long.
export const maxDuration = 180;

// ponytail: no retries and no JSON salvage here — a broken stream makes the
// client silently fall back to the classic /api/solve, which has both.
const INSTRUCTION = `You are a careful math tutor. Solve the problem below
from scratch, showing your work as a sequence of clear steps a student could
follow. Keep steps small — one algebraic move per step.

${PLAIN_LANGUAGE_RULE}

Output NDJSON: one complete JSON object PER LINE, no commentary, no markdown
fences, no blank lines, in exactly this order:

1. For each solution step, in order, 0-based stepIndex, one line:
{"stepIndex": number, "workLatex": string, "explanation": string}

"workLatex" is the math for that step in LaTeX. "explanation" is plain
natural language, never LaTeX.

2. Then exactly one final line:
{"final": true, "finalAnswerLatex": string}`;

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

  const prompt = `${INSTRUCTION}\n\nProblem statement:\n${problemStatementLatex}`;

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
