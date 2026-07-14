"use client";

import { useEffect, useState } from "react";

/**
 * Reassuring "still working" copy for long-running Gemma calls (both
 * transcribe and analyze routinely take 30-60s). Without this the button
 * label alone reads as frozen. Ticks a plain elapsed-seconds counter so
 * the student can see it's alive, not just a static sentence.
 */
export default function LoadingNote({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="text-xs text-ink-muted" role="status" aria-live="polite">
      {label} This can take up to a minute — {seconds}s so far.
    </p>
  );
}
