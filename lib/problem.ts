/**
 * Joins the prose and math halves of a transcribed problem back into the
 * single string every downstream Gemma route ( /api/analyze, /api/solve,
 * /api/hints, … ) already accepts as `problemStatementLatex`. Keeping the
 * downstream contracts unchanged means the schema split touches only
 * /api/transcribe and the client.
 */
export function composeProblem(problemText: string, problemLatex: string): string {
  const text = problemText.trim();
  const latex = problemLatex.trim();
  if (!latex) return text;
  if (!text) return latex;
  return `${text}\n${latex}`;
}
