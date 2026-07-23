"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { loadHistory, type HistoryEntry } from "@/lib/history";

// Same MathLive constraint as app/page.tsx: custom elements touch the DOM on
// import, so the view must only ever render on the client.
const MathView = dynamic(() => import("@/components/MathView"), { ssr: false });

const OUTCOME_LABEL: Record<HistoryEntry["outcome"], { text: string; className: string }> = {
  correct: { text: "Correct", className: "text-mark-correct" },
  incorrect: { text: "First slip found", className: "text-mark-error" },
  solved: { text: "Solved for you", className: "text-ink-muted" },
};

/** Recent checks from localStorage, shown on the landing screen. */
export default function HistoryList() {
  // Loaded in an effect (not at render) so the server and first client
  // render agree — localStorage doesn't exist during SSR.
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [repeated, setRepeated] = useState<[string, number] | null>(null);

  useEffect(() => {
    const all = loadHistory();
    setEntries(all.slice(0, 5));
    const counts = new Map<string, number>();
    for (const e of all) {
      if (e.misconceptionTag) counts.set(e.misconceptionTag, (counts.get(e.misconceptionTag) ?? 0) + 1);
    }
    const top = Array.from(counts.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])[0];
    setRepeated(top ?? null);
  }, []);

  if (entries.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-16 sm:px-6">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
        Recent checks
      </h2>
      {repeated && (
        <div className="mt-3 rounded-md border-2 border-mark-flag bg-mark-flag/5 p-4 text-sm">
          <p className="font-medium text-ink">Pattern spotted</p>
          <p className="mt-1 text-ink-muted">
            You&apos;ve slipped on {repeated[0]} {repeated[1]} times recently —
            worth a focused review before your next attempt.
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-col gap-3">
        {entries.map((entry, index) => (
          <div
            key={entry.at}
            className="screen-transition rounded-lg border-2 border-ink bg-white p-4 text-sm shadow-brut"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className={`font-medium ${OUTCOME_LABEL[entry.outcome].className}`}>
                {OUTCOME_LABEL[entry.outcome].text}
              </p>
              <p className="text-xs text-ink-muted">
                {new Date(entry.at).toLocaleDateString()}
              </p>
            </div>
            <div className="mt-2 rounded-md border border-hairline-soft bg-surface px-3 py-2">
              {entry.problemText && <p className="text-sm text-ink">{entry.problemText}</p>}
              {entry.problemLatex.trim() !== "" && <MathView latex={entry.problemLatex} />}
            </div>
            {entry.misconceptionSummary && (
              <p className="mt-2 text-ink-muted">{entry.misconceptionSummary}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
