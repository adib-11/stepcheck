import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

// This route runs server-side only. The API key never reaches the client.
export const runtime = "nodejs";

const MODEL = "gemma-4-26b-a4b-it";
const TEST_PROMPT = "Explain what 2 + 2 equals in one sentence.";

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: TEST_PROMPT,
    });

    const text = response.text;

    if (!text) {
      return NextResponse.json(
        { error: "Gemma returned an empty response.", raw: response },
        { status: 502 }
      );
    }

    return NextResponse.json({ text, model: MODEL });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error calling the Gemma API.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
