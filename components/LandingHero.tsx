"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import StepMark from "@/components/StepMark";

/**
 * Canned examples for the landing-screen demo card — deliberately hardcoded,
 * not fetched, so the concept is legible in seconds and the screen never
 * depends on API health (see LOCKS). One entry per carousel dot.
 */
const DEMO_PROBLEMS: {
  label: string;
  steps: { latex: string; status: "correct" | "incorrect" }[];
  stamp: string;
  stampTone: "correct" | "error";
}[] = [
  {
    label: "LINEAR EQUATION",
    steps: [
      { latex: "2x + 4 = 10", status: "correct" },
      { latex: "2x = 6", status: "correct" },
      { latex: "x = 3 + 1", status: "incorrect" },
    ],
    stamp: "FIRST SLIP: STEP 3",
    stampTone: "error",
  },
  {
    label: "DIFFERENTIATION",
    steps: [
      { latex: "y = x^2 + 3x", status: "correct" },
      { latex: "y' = 2x + 3", status: "correct" },
    ],
    stamp: "ALL CORRECT",
    stampTone: "correct",
  },
  {
    label: "FRACTIONS",
    steps: [
      { latex: "1/2 + 1/3", status: "correct" },
      { latex: "= 2/5", status: "incorrect" },
    ],
    stamp: "FIRST SLIP: STEP 2",
    stampTone: "error",
  },
];

/** Advances the demo card through DEMO_PROBLEMS on a loop. */
function useDemoCarousel(length: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % length), intervalMs);
    return () => clearInterval(id);
  }, [length, intervalMs]);
  return [index, setIndex] as const;
}

const STATS: { figure: string; caption: string }[] = [
  { figure: "✓✗", caption: "EVERY LINE, MARKED" },
  { figure: "1", caption: "PHOTO IS ALL IT TAKES" },
  { figure: "∞", caption: "RE-CHECKS AFTER YOU FIX" },
];

export default function LandingHero({
  onStart,
  onStartTyped,
}: {
  onStart: () => void;
  onStartTyped: () => void;
}) {
  const [demoIndex, setDemoIndex] = useDemoCarousel(DEMO_PROBLEMS.length, 5200);
  const demo = DEMO_PROBLEMS[demoIndex];

  return (
    <div className="flex w-full flex-col bg-surface">
      {/* Announcement ticker — MockClub-style full-width ink bar. */}
      <div className="w-full bg-ink px-4 py-2 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white">
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle" aria-hidden />
        Powered by Gemma · A full check takes a few minutes — every step gets read
      </div>

      {/* Nav row: wordmark left, links + CTA right. */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <span className="font-display text-xl font-bold tracking-tight text-ink">StepCheck</span>
        <nav className="flex items-center gap-4">
          <a
            href="/teacher"
            className="hidden font-mono text-xs uppercase tracking-[0.15em] text-ink-muted hover:text-ink sm:inline"
          >
            For teachers
          </a>
          <Button size="sm" onClick={onStart}>
            Check my work
          </Button>
        </nav>
      </header>

      {/* Two-column hero: pitch left, marked-page artifact right. */}
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div className="flex flex-col items-start gap-6 text-left">
          <span className="rounded-full border-2 border-ink bg-brand-soft/40 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink">
            Made for students, marked like a teacher
          </span>

          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
            Marked{" "}
            <span className="relative inline-block">
              <span className="relative z-10">line by line</span>
              <span
                className="absolute inset-x-0 bottom-1 h-3 bg-brand"
                aria-hidden
              />
            </span>
            , like a marker would.
          </h1>

          <p className="max-w-md text-lg text-ink-muted">
            Photograph your working and get a tick or a cross on{" "}
            <strong className="text-ink">every step</strong> — not just a
            final grade. When something slips, you see exactly where, why,
            and how to fix it.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="accent" size="lg" onClick={onStart} className="px-8">
              Check my work
            </Button>
            <Button variant="outline" size="lg" onClick={onStartTyped}>
              Type a problem instead
            </Button>
          </div>

          {/* Stats strip: one bordered 3-cell table, MockClub-style. */}
          <div className="grid w-full max-w-md grid-cols-3 divide-x-2 divide-ink border-2 border-ink bg-white shadow-brut">
            {STATS.map((stat) => (
              <div key={stat.caption} className="flex flex-col gap-1 p-4">
                <span className="font-display text-2xl font-bold text-ink sm:text-3xl">
                  {stat.figure}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                  {stat.caption}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* The hero object: a marked page, dramatized as a physical artifact. */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full max-w-sm rounded-lg border-2 border-ink bg-white shadow-brut-brand" aria-hidden>
            {/* Card header — mono label row. */}
            <div className="flex items-center justify-between border-b-2 border-ink px-5 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink">
                Marked work
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-muted">
                {demo.label}
              </span>
            </div>

            {/* Steps with the marking rail — remounted per demoIndex so the
                mark-in draw replays; no second animation system. */}
            <div className="flex flex-col gap-3 p-5">
              {demo.steps.map((step, i) => (
                <div
                  key={`${demoIndex}-${i}`}
                  className="flex items-center gap-3 rounded-md border border-hairline-soft bg-surface-soft p-3 text-sm"
                >
                  <div className="flex w-5 flex-shrink-0 justify-center border-r border-hairline pr-3">
                    <StepMark status={step.status} delayMs={i * 350} />
                  </div>
                  <code className="font-mono text-sm text-ink">{step.latex}</code>
                </div>
              ))}
            </div>

            {/* Verdict stamp — rotated rubber-stamp badge. */}
            <span
              key={`stamp-${demoIndex}`}
              className={`absolute -right-3 bottom-14 rotate-[-8deg] rounded-md border-2 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
                demo.stampTone === "correct"
                  ? "border-mark-correct bg-white text-mark-correct"
                  : "border-mark-error bg-white text-mark-error"
              }`}
            >
              {demo.stamp}
            </span>

            {/* Fine-print footer strip. */}
            <div className="rounded-b-[6px] bg-ink px-5 py-2 font-mono text-[9px] uppercase tracking-[0.15em] text-white">
              Every step checked · Not just the answer
            </div>
          </div>

          {/* Carousel dots. */}
          <div className="flex items-center gap-2">
            {DEMO_PROBLEMS.map((p, i) => (
              <button
                key={p.label}
                type="button"
                aria-label={`Show ${p.label.toLowerCase()} example`}
                onClick={() => setDemoIndex(i)}
                className={
                  i === demoIndex
                    ? "h-1.5 w-6 rounded-full bg-ink"
                    : "h-1.5 w-1.5 rounded-full bg-ink/30 hover:bg-ink/60"
                }
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
