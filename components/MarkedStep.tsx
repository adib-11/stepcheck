"use client";

import dynamic from "next/dynamic";
import StepMark from "@/components/StepMark";

const MathView = dynamic(() => import("@/components/MathView"), { ssr: false });

interface MarkedStepProps {
  index: number;
  latex: string;
  /** Undefined while the marker hasn't reached this step yet (streaming). */
  status?: "correct" | "incorrect" | "not_reached";
  explanation?: string;
  delayMs?: number;
}

/**
 * One step of the student's work with its marking-rail tick/cross — the
 * single "your work, marked" unit shared by the final results list and the
 * live streaming view, so marks arriving mid-wait look identical to the
 * finished page.
 */
export default function MarkedStep({ index, latex, status, explanation, delayMs = 0 }: MarkedStepProps) {
  return (
    <div className="flex gap-3 rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm">
      <div className="flex w-5 flex-shrink-0 justify-center border-r border-hairline pr-3">
        {status && <StepMark status={status} delayMs={delayMs} />}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-ink">
          Step {index + 1}
          {status ? ` — ${status.replace("_", " ")}` : " — being checked…"}
        </p>
        <div className="rounded-md border border-hairline-soft bg-white px-3 py-2 text-ink">
          <MathView latex={latex} />
        </div>
        {explanation && <p className="text-ink-muted">{explanation}</p>}
      </div>
    </div>
  );
}
