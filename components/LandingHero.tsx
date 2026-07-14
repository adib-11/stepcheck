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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-10 px-4 py-16 text-center sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          StepCheck
        </h1>
        <p className="max-w-md text-balance text-base text-ink-muted sm:text-lg">
          Line by line, like a marker would. Photograph your working and
          get a tick or a cross on every step, not just a final grade.
        </p>
      </div>

      <div
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-card p-5 text-left"
        aria-hidden
      >
        {DEMO_STEPS.map((step, i) => (
          <div
            key={`${cycle}-${i}`}
            className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm"
          >
            <div className="flex w-5 flex-shrink-0 justify-center border-r border-border pr-3">
              <StepMark status={step.status} delayMs={i * 350} />
            </div>
            <code className="font-mono text-ink">{step.latex}</code>
          </div>
        ))}
      </div>

      <Button size="lg" onClick={onStart} className="px-8">
        Check my work
      </Button>
    </main>
  );
}
