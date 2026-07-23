"use client";

import { useEffect, useState } from "react";

const STAGES: Record<"analyze" | "solve", Array<[atSeconds: number, label: string]>> = {
  analyze: [
    [0, "Solving the problem independently…"],
    [45, "Comparing against your steps, line by line…"],
    [95, "Still working — longer solutions take longer to mark…"],
  ],
  solve: [
    [0, "Working through the problem from scratch…"],
    [95, "Still working — longer problems take longer…"],
  ],
};

/**
 * Headline for the long results-screen wait. Advances through honest,
 * time-based stage messages so a 60-150s Gemma call reads as progress
 * rather than a hang. Copy is deliberately vague about which step is being
 * processed — we genuinely don't know, and must not pretend to.
 */
export default function StagedStatus({ mode }: { mode: "analyze" | "solve" }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [mode]);

  const current = STAGES[mode].filter(([at]) => seconds >= at).at(-1)!;

  return (
    <p className="font-display text-xl font-semibold tracking-tight text-ink" aria-live="polite">
      {current[1]}
    </p>
  );
}
