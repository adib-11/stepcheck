"use client";

import { useEffect, useState } from "react";
import { loadHistory, type HistoryEntry } from "@/lib/history";

/**
 * "While you wait" card: the student's own recent slips from localStorage,
 * surfaced during the long Gemma wait so the dead time becomes a short,
 * personally relevant review. Zero API cost. Renders nothing for students
 * with no recorded misconceptions yet.
 */
export default function WaitReview() {
  const [slips, setSlips] = useState<HistoryEntry[]>([]);

  // Loaded in an effect (not at render) so the server and first client
  // render agree — localStorage doesn't exist during SSR.
  useEffect(() => {
    setSlips(loadHistory().filter((e) => e.misconceptionSummary).slice(0, 3));
  }, []);

  if (slips.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-white p-6 text-sm shadow-brut">
      <div>
        <p className="font-medium text-ink">While you wait — your recent slips</p>
        <p className="mt-1 text-ink-muted">
          A quick re-read now is the cheapest revision you&apos;ll do today.
        </p>
      </div>
      {slips.map((entry) => (
        <div key={entry.at} className="rounded-md border border-hairline-soft bg-surface-soft p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
            {new Date(entry.at).toLocaleDateString()}
          </p>
          <p className="mt-1 text-ink-muted">{entry.misconceptionSummary}</p>
        </div>
      ))}
    </section>
  );
}
