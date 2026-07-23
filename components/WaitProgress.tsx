"use client";

import { useEffect, useMemo, useState } from "react";
import { estimateMs, type WorkKind } from "@/lib/durations";

function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Elapsed timer + progress bar against a device-calibrated estimate of how
 * long this kind of check usually takes. The bar caps at 92% — we genuinely
 * don't know the remaining time, and a full-looking stalled bar reads as a
 * hang (the exact failure this component exists to prevent).
 */
export default function WaitProgress({ kind, stepCount }: { kind: WorkKind; stepCount: number }) {
  const [elapsed, setElapsed] = useState(0);
  const estimate = useMemo(() => estimateMs(kind, stepCount), [kind, stepCount]);

  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [kind]);

  const pct = Math.min(92, ((elapsed * 1000) / estimate) * 100);
  const estimateMin = Math.max(1, Math.round(estimate / 60_000));

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="h-2 w-full overflow-hidden rounded-full border border-ink bg-surface">
        <div
          className="h-full bg-brand transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
        {fmt(elapsed)} elapsed · usually ~{estimateMin} min on this device
      </p>
    </div>
  );
}
