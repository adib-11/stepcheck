export interface HistoryEntry {
  at: number; // Date.now()
  problemLatex: string;
  // Prose half of the split problem statement. Optional: entries saved
  // before the prose/math split don't have it.
  problemText?: string;
  outcome: "correct" | "incorrect" | "solved";
  misconceptionSummary: string | null;
  // Optional: entries saved before tagging existed don't have it.
  misconceptionTag?: string | null;
}

const KEY = "stepcheck-history";
const MAX_ENTRIES = 20;

// ponytail: localStorage, newest-first, capped at 20 — a real store (accounts,
// sync, analytics) only when someone asks for cross-device history.

export function loadHistory(): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is HistoryEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as HistoryEntry).at === "number" &&
        typeof (e as HistoryEntry).problemLatex === "string" &&
        ["correct", "incorrect", "solved"].includes((e as HistoryEntry).outcome)
    );
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...loadHistory()].slice(0, MAX_ENTRIES)));
  } catch {
    // Quota/serialization failures just mean no history — never break the flow.
  }
}
