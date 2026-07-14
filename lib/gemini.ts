import { GoogleGenAI } from "@google/genai";

export const MODEL = "gemma-4-26b-a4b-it";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/** Strips markdown code fences the model sometimes adds despite being told not to. */
export function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|latex)?\n?/i, "")
    .replace(/```$/, "")
    .trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns the HTTP status the Gemma SDK attaches to an error, if any. */
function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

const LATEX_MARKUP_PATTERN = /\$|\\frac|\\cdot|\\sqrt|\\left|\\right|\^\{|_\{|\\int|\\sum|\\pm/;

/**
 * Soft quality check for prose/explanation fields that must read as plain
 * human language, not LaTeX (see the analyze/solve prompts). Only logs a
 * warning — never blocks the response, since this is a signal for us to
 * notice recurrence during testing, not a hard contract on the model.
 */
export function warnIfLooksLikeLatex(fieldName: string, value: string | null): void {
  if (!value) return;
  if (LATEX_MARKUP_PATTERN.test(value)) {
    console.warn(`[explanation-format] "${fieldName}" looks like it contains LaTeX markup:`, value);
  }
}

/**
 * Shared retry-on-5xx wrapper for text-only Gemma calls. `contents` is
 * passed through as-is so callers can send either a plain prompt string or
 * a multimodal `createUserContent([...])` payload (transcribe needs the
 * latter for the image part).
 */
export async function generateWithRetry(
  ai: GoogleGenAI,
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"]
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    try {
      const response = await ai.models.generateContent({ model: MODEL, contents });
      const durationMs = Date.now() - start;
      if (durationMs > 60_000) {
        console.warn(`[gemini-timing] generateContent took ${durationMs}ms (attempt ${attempt})`);
      }
      const text = response.text;
      if (!text) throw new Error("Gemma returned an empty response.");
      return text;
    } catch (error) {
      lastError = error;
      const status = statusOf(error);
      const isRetryable = status === undefined || status >= 500;
      if (!isRetryable || attempt === MAX_RETRIES) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}
