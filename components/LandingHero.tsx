"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import StepMark from "@/components/StepMark";

/**
 * Canned example for the landing-screen demo — deliberately hardcoded, not
 * fetched, so the concept is legible in seconds and the screen never
 * depends on API health (see LOCKS).
 */
const DEMO_STEPS: { latex: string; status: "correct" | "incorrect" }[] = [
  { latex: "2x + 4 = 10", status: "correct" },
  { latex: "2x = 6", status: "correct" },
  { latex: "x = 3 + 1", status: "incorrect" },
];

/** Replays the canned demo on a loop so it's visible the moment the screen mounts. */
function useDemoCycle(length: number, intervalMs: number) {
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCycle((c) => c + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return cycle;
}

export default function LandingHero({ onStart }: { onStart: () => void }) {
  // Bumping `cycle` changes the StepMark keys below, which remounts them
  // and replays the same `mark-in` draw-on animation StepMark already
  // defines — no second animation system introduced.
  const cycle = useDemoCycle(DEMO_STEPS.length, 2600);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface px-4 py-16 text-center sm:px-6">
      <div className="flex w-full max-w-2xl flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-4">
          {/* Kicker pill, FlyRank hero-style: mint-washed, ink outline. */}
          <span className="rounded-full border-2 border-ink bg-brand-soft/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink">
            Step-by-step marking
          </span>
          <h1 className="font-display text-5xl font-bold tracking-[-0.02em] text-ink sm:text-6xl">
            StepCheck
          </h1>
          <p className="max-w-md text-balance text-lg text-ink-muted">
            Line by line, like a marker would. Photograph your working and
            get a tick or a cross on every step, not just a final grade.
          </p>
        </div>

        {/* Demo card as the neobrutalist hero object: white card, 2px ink
            border, hard mint offset shadow (FlyRank's highlighted-card
            treatment). */}
        <div
          className="flex w-full max-w-sm flex-col gap-3 rounded-lg border-2 border-ink bg-white p-6 text-left shadow-brut-brand"
          aria-hidden
        >
          {DEMO_STEPS.map((step, i) => (
            <div
              key={`${cycle}-${i}`}
              className="flex items-center gap-3 rounded-md border border-hairline-soft bg-surface-soft p-3 text-sm"
            >
              <div className="flex w-5 flex-shrink-0 justify-center border-r border-hairline pr-3">
                <StepMark status={step.status} delayMs={i * 350} />
              </div>
              <code className="font-mono text-sm text-ink">{step.latex}</code>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="accent" size="lg" onClick={onStart} className="px-8">
            Check my work
          </Button>
        </div>
      </div>
    </main>
  );
}
