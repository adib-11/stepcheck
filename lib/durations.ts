export type WorkKind = "analyze" | "solve";

export interface DurationSample {
  kind: WorkKind;
  stepCount: number;
  ms: number;
}

const KEY = "stepcheck-durations";
const MAX_SAMPLES = 24;
// Before any local samples exist, assume a long check — overestimating and
// finishing "early" always feels better than a bar that stalls at 100%.
const FALLBACK_MS = 150_000;

function load(): DurationSample[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is DurationSample =>
        typeof s === "object" &&
        s !== null &&
        ((s as DurationSample).kind === "analyze" || (s as DurationSample).kind === "solve") &&
        typeof (s as DurationSample).stepCount === "number" &&
        typeof (s as DurationSample).ms === "number" &&
        (s as DurationSample).ms > 0
    );
  } catch {
    return [];
  }
}

export function saveDuration(sample: DurationSample): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([sample, ...load()].slice(0, MAX_SAMPLES)));
  } catch {
    // Quota failures just mean no calibration — never break the flow.
  }
}

/** Median of past same-kind checks on this device; FALLBACK_MS when unknown. */
// ponytail: stepCount is accepted but unused for now — median-only estimate.
// Kept in the signature so callers don't churn when calibration-by-step lands.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function estimateMs(kind: WorkKind, stepCount: number): number {
  const same = load().filter((s) => s.kind === kind);
  if (same.length === 0) return FALLBACK_MS;
  const sorted = same.map((s) => s.ms).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
