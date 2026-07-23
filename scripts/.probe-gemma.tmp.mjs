import fs from "fs";
import { GoogleGenAI } from "@google/genai";

const src = fs.readFileSync("lib/prompts.ts", "utf8");
const grab = (name) => src.match(new RegExp("export const " + name + " = `([^`]*)`", "m"))[1];

const steps = [
  "Let y = \\frac{2x^2 + 3x - 1}{x^2 + 1}",
  "Use quotient rule: \\left(\\frac{u}{v}\\right)' = \\frac{vu' - uv'}{v^2}",
  "u = 2x^2 + 3x - 1, u' = 4x + 3",
  "v = x^2 + 1, v' = 2x",
  "\\frac{dy}{dx} = \\frac{(x^2 + 1)(4x + 3) - (2x^2 + 3x - 1)(2x)}{(x^2 + 1)^2}",
  "= \\frac{4x^3 + 3x^2 + 4x + 3 - 4x^3 - 6x^2 + 2x}{(x^2 + 1)^2}",
  "= \\frac{-3x^2 + 6x + 3}{(x^2 + 1)^2}",
];

const INSTRUCTION = `${grab("GRADING_RULES")}

${grab("PLAIN_LANGUAGE_RULE")}

Output NDJSON: one complete JSON object PER LINE, no commentary, no markdown
fences, no blank lines, in exactly this order:

1. For each student step, in index order, one line:
{"stepIndex": number, "status": "correct" | "incorrect" | "not_reached", "explanation": string}

2. Then exactly one final line:
{"final": true, "isCorrect": boolean, "firstErrorStepIndex": number | null, "misconceptionSummary": string | null, "misconceptionTag": string | null, "correctContinuation": string | null, "correctContinuationExplanation": string | null}`;

const prompt = `${INSTRUCTION}

Problem statement (LaTeX):
11. \\text{ Differentiate } y = \\frac{2x^2 + 3x - 1}{x^2 + 1}

Student's confirmed steps (LaTeX), 0-based index per line:
${steps.map((s, i) => `${i}: ${s}`).join("\n")}`;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const t0 = Date.now();
try {
  const stream = await ai.models.generateContentStream({
    model: "gemma-4-26b-a4b-it",
    contents: prompt,
    config: { temperature: 0 },
  });
  let first = null,
    text = "";
  for await (const c of stream) {
    if (first === null) first = Date.now() - t0;
    text += c.text ?? "";
  }
  console.log("first:", first, "ms; total:", Date.now() - t0, "ms; bytes:", text.length, "; lines:", text.trim().split("\n").length);
} catch (e) {
  console.log("ERROR after", Date.now() - t0, "ms; status:", e.status, String(e).slice(0, 300));
}
