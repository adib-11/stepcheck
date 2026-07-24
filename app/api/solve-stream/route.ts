import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { MODEL, statusOf } from "@/lib/gemini";
import { PLAIN_LANGUAGE_RULE } from "@/lib/prompts";

export const runtime = "nodejs";
// Same rationale as /api/solve — the stream stays open just as long.
export const maxDuration = 300;

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

  const ai = new GoogleGenAI({ apiKey });
  const encoder = new TextEncoder();
  // Same shape as /api/analyze-stream: Gemma call starts inside the stream
  // so headers go out immediately, with blank-line heartbeats (skipped by
  // the client's parser) covering Gemma's long first-token wait. Heartbeats
  // only fire at a line boundary so they never split a JSON line.
  const stream = new ReadableStream({
    async start(controller) {
      let atLineBoundary = true;
      const heartbeat = setInterval(() => {
        if (atLineBoundary) controller.enqueue(encoder.encode("\n"));
      }, 10_000);
      try {
        // Solving can't be split into per-step calls like analyze-stream
        // (the steps don't exist until Gemma writes them), so runaway
        // thinking and 503s are handled by retrying INSIDE this response:
        // safe because the runaway mode produces zero visible output before
        // the watchdog trips, so nothing partial ever reaches the client,
        // and heartbeats keep the connection alive across attempts.
        for (let attempt = 0; ; attempt++) {
          let sentAnyText = false;
          try {
            const response = await ai.models.generateContentStream({
              model: MODEL,
              contents: prompt,
              // No maxOutputTokens: gemma-4's hidden thinking tokens count
              // against it, risking an empty visible output — see CLAUDE.md.
              config: { temperature: 0 },
            });
            for await (const chunk of response) {
              if (chunk.text) {
                sentAnyText = true;
                atLineBoundary = chunk.text.endsWith("\n");
                controller.enqueue(encoder.encode(chunk.text));
              }
              // Runaway-thinking watchdog: stochastic, so a fresh attempt
              // usually converges — see CLAUDE.md.
              const thoughts = chunk.usageMetadata?.thoughtsTokenCount ?? 0;
              if (!sentAnyText && thoughts > 10_000) {
                throw new Error(
                  `Gemma runaway thinking: ${thoughts} thought tokens with no output yet — aborting a doomed attempt.`
                );
              }
            }
            break;
          } catch (error) {
            // Output already sent: retrying would corrupt the NDJSON.
            if (sentAnyText || attempt >= 2) throw error;
            const status = statusOf(error);
            if (!(status === undefined || status >= 500 || status === 429)) throw error;
            console.warn(`[solve-stream] attempt ${attempt} failed, retrying:`, error);
            await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
          }
        }
        controller.close();
      } catch (error) {
        // Headers already went out, so Next still logs this request as a
        // 200 — this line is the only server-side trace of the failure.
        console.error("[solve-stream] Gemma stream failed:", error);
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
