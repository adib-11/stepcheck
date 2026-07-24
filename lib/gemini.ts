import { GoogleGenAI } from "@google/genai";

export const MODEL = "gemma-4-26b-a4b-it";

const MAX_RETRIES = 3;
// ponytail: fixed backoff schedule + jitter, no Retry-After header parsing —
// parse the header if 429s still surface after this lands.
const RETRY_DELAYS_MS = [2000, 6000, 15000];

// generateJson's regeneration loop wraps generateWithRetry's own retry loop,
// so a request could otherwise stack up to 2 x 4 = 8 real Gemma calls under
// sustained 429s. Cap total wall-clock time per request just under the
// routes' maxDuration=300 so a rate-limited request fails fast with a clear
// error instead of hanging for 15-20 minutes.
const TOTAL_BUDGET_MS = 290_000;

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
export function statusOf(error: unknown): number | undefined {
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
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
  deadline: number = Date.now() + TOTAL_BUDGET_MS
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const start = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        // Grading must be repeatable, and temperature 0 also reduces
        // JSON-format drift in responses.
        config: { temperature: 0 },
      });
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
      // Retry server errors, network/unknown errors, and rate limiting.
      const isRetryable = status === undefined || status >= 500 || status === 429;
      if (!isRetryable || attempt === MAX_RETRIES) throw error;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      // Budget exhausted: fail fast now rather than retry into a hang that
      // generateJson's own regeneration loop would then double again.
      if (Date.now() + delay >= deadline) throw error;
      await sleep(delay + Math.random() * 1000);
    }
  }
  throw lastError;
}

/**
 * Small-call variant of generateWithRetry for the per-step fan-out routes:
 * streams so gemma-4's hidden thinking is observable per chunk, and aborts
 * (then retries — the runaway is stochastic, so a fresh call usually
 * converges) once thought tokens pass `maxThoughtTokens` with no visible
 * output. Small focused prompts think ~300 tokens; the runaway mode burns
 * the full 32k output budget on thoughts and ends empty after ~11 min, so
 * the bound turns a doomed call into a quick retry instead. Also retries
 * 429/5xx (the model currently 503s under load) on the same backoff
 * schedule as generateWithRetry.
 */
export async function generateBounded(
  ai: GoogleGenAI,
  prompt: string,
  maxThoughtTokens: number,
  deadline: number = Date.now() + TOTAL_BUDGET_MS
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContentStream({
        model: MODEL,
        contents: prompt,
        config: { temperature: 0 },
      });
      let text = "";
      for await (const chunk of response) {
        if (chunk.text) text += chunk.text;
        const thoughts = chunk.usageMetadata?.thoughtsTokenCount ?? 0;
        if (!text && thoughts > maxThoughtTokens) {
          throw new Error(
            `Gemma runaway thinking: ${thoughts} thought tokens with no output on a small call.`
          );
        }
      }
      if (!text) throw new Error("Gemma returned an empty response.");
      return text;
    } catch (error) {
      lastError = error;
      const status = statusOf(error);
      const isRetryable = status === undefined || status >= 500 || status === 429;
      if (!isRetryable || attempt === MAX_RETRIES) throw error;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      if (Date.now() + delay >= deadline) throw error;
      await sleep(delay + Math.random() * 1000);
    }
  }
  throw lastError;
}

/**
 * Best-effort recovery of a JSON object from a response that may wrap it in
 * prose or fences ("Sure! Here is the JSON: { ... } Hope that helps").
 * Returns the cleaned input unchanged when no outer braces are found, so
 * JSON.parse still produces the natural error.
 */
export function extractJsonObject(raw: string): string {
  const cleaned = stripFences(raw);
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last <= first) return cleaned;
  return cleaned.slice(first, last + 1);
}

export type JsonOutcome<T> = { ok: true; value: T } | { ok: false; raw: string };

/**
 * generateWithRetry + salvage + parse + shape-guard, with ONE full
 * regeneration if the first response is unparseable or fails the guard.
 * Throws on API-level failure (network/4xx/5xx after retries) — callers keep
 * their existing 500 handling. Returns { ok: false } only when Gemma
 * answered twice and both answers were structurally unusable (callers' 502).
 *
 * ponytail: regeneration, not a cheaper "repair this JSON" second prompt —
 * add the repair prompt if double-generation latency shows up in practice.
 */
export async function generateJson<T>(
  ai: GoogleGenAI,
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"],
  guard: (value: unknown) => value is T
): Promise<JsonOutcome<T>> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let raw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    // Don't spend the regeneration attempt once budget is already gone —
    // return whatever we have instead of starting a call we'll cut off anyway.
    if (attempt > 0 && Date.now() >= deadline) break;
    raw = await generateWithRetry(ai, contents, deadline);
    try {
      const parsed: unknown = JSON.parse(extractJsonObject(raw));
      if (guard(parsed)) return { ok: true, value: parsed };
      console.warn(`[gemini-json] response failed shape guard (attempt ${attempt})`);
    } catch {
      console.warn(`[gemini-json] response was not parseable JSON (attempt ${attempt})`);
    }
  }
  return { ok: false, raw };
}
