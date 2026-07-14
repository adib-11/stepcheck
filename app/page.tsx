"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import ImageUpload, { type UploadedImage } from "@/components/ImageUpload";
import StepMark from "@/components/StepMark";
import LoadingNote from "@/components/LoadingNote";
import Screen from "@/components/Screen";
import LandingHero from "@/components/LandingHero";

// MathLive touches the DOM (custom elements) on import, so the input must
// only ever be rendered on the client.
const MathInput = dynamic(() => import("@/components/MathInput"), {
  ssr: false,
});

interface StepFeedback {
  stepIndex: number;
  status: "correct" | "incorrect" | "not_reached";
  explanation: string;
}

interface AnalysisResult {
  isCorrect: boolean;
  firstErrorStepIndex: number | null;
  stepByStepFeedback: StepFeedback[];
  misconceptionSummary: string | null;
  correctContinuation: string | null;
  correctContinuationExplanation: string | null;
}

interface SolveStep {
  stepIndex: number;
  workLatex: string;
  explanation: string;
}

interface SolveResult {
  steps: SolveStep[];
  finalAnswerLatex: string;
}

interface ApiErrorState {
  message: string;
  raw?: string;
}

type TranscribeResult =
  | { hasWorkedSolution: false; problemStatementLatex: string }
  | { hasWorkedSolution: true; problemStatementLatex: string; solutionSteps: string[] };

/**
 * Client-side low-confidence heuristic — the model's own JSON can't tell us
 * this, so a simple check flags an unusually short transcription before the
 * student confirms.
 *
 * ponytail: naive length/count check, not real OCR-confidence scoring.
 * Ceiling: won't catch a confidently-wrong-but-well-formed transcription.
 * Upgrade path: have /api/transcribe also return a per-step confidence score.
 */
function transcriptionLooksShaky(steps: string[]): boolean {
  if (steps.length < 2) return true;
  return steps.some((step) => step.trim().length < 3);
}

const STAGE_LABELS = ["Photo", "Confirm", "Result"];

type Screen = "landing" | "upload" | "confirm" | "results";

export default function Home() {
  // Explicit screen state (rather than purely derived from data) so the
  // back affordance can move the user to a previous screen without
  // clearing any of the underlying transcribe/confirm/result state.
  const [screen, setScreen] = useState<Screen>("landing");
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [transcribeResult, setTranscribeResult] = useState<TranscribeResult | null>(null);

  // Editable copies shown on the confirm screen. `steps` is null when the
  // photo had no worked solution — the confirm UI adapts to whichever
  // shape came back (see LOCKS).
  const [problem, setProblem] = useState("");
  const [steps, setSteps] = useState<string[] | null>(null);

  const [confirmed, setConfirmed] = useState<{ problem: string; steps: string[] | null } | null>(
    null
  );
  const [isWorking, setIsWorking] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [solved, setSolved] = useState<SolveResult | null>(null);
  const [resultError, setResultError] = useState<ApiErrorState | null>(null);

  const stage = analysis || solved || resultError ? 3 : transcribeResult ? 2 : 1;

  async function transcribe() {
    if (!image) return;
    setIsTranscribing(true);
    setTranscribeError(null);
    setTranscribeResult(null);
    setAnalysis(null);
    setSolved(null);
    setResultError(null);
    setConfirmed(null);

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: image.base64, mimeType: image.mimeType }),
      });
      const data = await res.json();

      if (!res.ok) {
        setTranscribeError(data.error ?? "Transcription failed.");
        return;
      }

      const result = data as TranscribeResult;
      setTranscribeResult(result);
      setProblem(result.problemStatementLatex);
      setSteps(result.hasWorkedSolution ? result.solutionSteps : null);
      setScreen("confirm");
    } catch {
      setTranscribeError("Network error: could not reach the transcribe API.");
    } finally {
      setIsTranscribing(false);
    }
  }

  // Branches based on the confirmed shape: no solution steps -> solve from
  // scratch; solution steps present -> existing analyze flow, unchanged.
  // `confirmed` stays in state on failure so retrying never forces a
  // re-upload or re-transcription.
  async function runResult(problemToUse: string, stepsToUse: string[] | null) {
    setConfirmed({ problem: problemToUse, steps: stepsToUse });
    setIsWorking(true);
    setResultError(null);
    setAnalysis(null);
    setSolved(null);
    setScreen("results");

    try {
      if (stepsToUse && stepsToUse.length > 0) {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problemStatementLatex: problemToUse,
            confirmedSteps: stepsToUse,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setResultError({ message: data.error ?? "Analysis failed.", raw: data.raw });
          return;
        }
        setAnalysis(data);
      } else {
        const res = await fetch("/api/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problemStatementLatex: problemToUse }),
        });
        const data = await res.json();
        if (!res.ok) {
          setResultError({ message: data.error ?? "Solving failed.", raw: data.raw });
          return;
        }
        setSolved(data);
      }
    } catch {
      setResultError({ message: "Network error: could not reach the API." });
    } finally {
      setIsWorking(false);
    }
  }

  function updateStep(index: number, latex: string) {
    setSteps((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = latex;
      return next;
    });
  }

  function startOver() {
    setImage(null);
    setTranscribeResult(null);
    setTranscribeError(null);
    setProblem("");
    setSteps(null);
    setConfirmed(null);
    setAnalysis(null);
    setSolved(null);
    setResultError(null);
    setScreen("landing");
  }

  // Back affordance: moves the visible screen back one step without
  // clearing any transcribe/confirm/result state, so returning forward
  // again (e.g. via Confirm) needs no re-fetching.
  function goBack() {
    if (screen === "upload") setScreen("landing");
    else if (screen === "confirm") setScreen("upload");
    else if (screen === "results") setScreen("confirm");
  }

  const header = (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {screen !== "landing" && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="rounded-md p-1 text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden fill="none">
              <path
                d="M12.5 4.5 6 10l6.5 5.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            StepCheck
          </h1>
          <p className="mt-1 text-sm text-ink-muted sm:text-base">
            Line by line, like a marker would.
          </p>
        </div>
      </div>

      <nav aria-label="Progress" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        {STAGE_LABELS.map((label, i) => (
          <span key={label} className="flex items-center gap-2">
            <span className={i + 1 <= stage ? "font-medium text-ink" : "text-ink-muted/60"}>
              {i + 1}. {label}
            </span>
            {i < STAGE_LABELS.length - 1 && <span aria-hidden>—</span>}
          </span>
        ))}
      </nav>
    </header>
  );

  if (screen === "landing") {
    return (
      <Screen screenKey="landing">
        <LandingHero onStart={() => setScreen("upload")} />
      </Screen>
    );
  }

  if (screen === "upload") {
    return (
      <Screen screenKey="upload">
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
          {header}

          <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <label className="text-sm font-medium text-ink">
              Page 1 — Photo of the problem (and your working, if you have any)
            </label>
            <ImageUpload onChange={setImage} />
            <Button onClick={transcribe} disabled={!image || isTranscribing}>
              {isTranscribing ? "Reading\u2026" : "Read photo"}
            </Button>
            {isTranscribing && <LoadingNote label="Gemma is reading your photo." />}

            {transcribeError && (
              <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Couldn&apos;t read that photo</p>
                <p className="text-ink-muted">{transcribeError}</p>
                <p className="text-ink-muted">
                  Try a clearer, well-lit photo, or retake it straight-on so
                  each line is legible.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTranscribeError(null);
                    setImage(null);
                  }}
                  className="self-start"
                >
                  Try a different photo
                </Button>
              </div>
            )}
          </section>
        </main>
      </Screen>
    );
  }

  if (screen === "confirm") {
    return (
      <Screen screenKey="confirm">
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
          {header}

          {transcribeResult && (
            <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">
                  Page 2 — Confirm what was read
                </h2>
                <p className="text-sm text-ink-muted">
                  {steps
                    ? "Check the problem and each step against the photo and fix anything the model got wrong."
                    : "No worked solution was found in this photo — just confirm the problem statement, and Gemma will solve it for you."}
                </p>
              </div>

              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image.previewUrl}
                  alt="Your uploaded photo"
                  className="max-h-40 self-start rounded-md border border-border object-contain"
                />
              )}

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-ink">Problem statement</label>
                <MathInput defaultValue={problem} onChange={setProblem} />
              </div>

              {steps && transcriptionLooksShaky(steps) && (
                <div className="rounded-md border border-mark-flag/40 bg-mark-flag/10 p-3 text-sm text-ink">
                  <p className="font-medium">Double check these steps carefully</p>
                  <p className="mt-1 text-ink-muted">
                    The transcription looks unusually short for a full
                    solution — it may have missed or garbled a line. Compare
                    each field against your photo before confirming.
                  </p>
                </div>
              )}

              {steps &&
                steps.map((step, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-ink">Step {i + 1}</label>
                    <MathInput defaultValue={step} onChange={(latex) => updateStep(i, latex)} />
                  </div>
                ))}

              <Button onClick={() => runResult(problem, steps)} disabled={isWorking || !problem}>
                {isWorking ? "Working\u2026" : "Confirm"}
              </Button>
              {isWorking && (
                <LoadingNote
                  label={
                    steps
                      ? "Working through your solution independently."
                      : "Solving the problem from scratch."
                  }
                />
              )}
            </section>
          )}
        </main>
      </Screen>
    );
  }

  // screen === "results"
  return (
    <Screen screenKey="results">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
        {header}

        {/* Loading state: rendered immediately upon entering this screen
            (isWorking becomes true and screen flips to "results" in the
            same tick, in runResult) and stays up for the entire in-flight
            request — analyze/solve calls routinely take 60-90+ seconds,
            so this must not look like it's stuck. Only hidden once a
            result or error has actually arrived (isWorking false). */}
        {isWorking && !resultError && !solved && !analysis && (
          <section className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center">
            <div className="flex gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-3 w-3 rounded-full bg-ink/40"
                  style={{
                    animation: "mark-in 1s ease-in-out infinite alternate",
                    animationDelay: `${i * 200}ms`,
                  }}
                />
              ))}
            </div>
            <div>
              <p className="font-display text-lg font-semibold text-ink">
                {confirmed?.steps ? "Marking your solution\u2026" : "Solving your problem\u2026"}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {confirmed?.steps
                  ? "Gemma is working through your steps line by line, like a marker would."
                  : "Gemma is working through this problem from scratch."}
              </p>
            </div>
            <LoadingNote label="This usually takes under a minute, but can take longer." />
          </section>
        )}

        {/* Error state: solve/analyze failure. `confirmed` stays in state,
            so retrying re-runs the same call only — no re-upload or
            re-transcription required. */}
        {resultError && (
          <section className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              {confirmed?.steps ? "Couldn't finish checking your solution" : "Couldn't finish solving this"}
            </p>
            <p className="text-sm text-ink-muted">{resultError.message}</p>
            <p className="text-sm text-ink-muted">
              Your confirmed answer is still here — you can retry without
              re-uploading anything.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => confirmed && runResult(confirmed.problem, confirmed.steps)}
              disabled={isWorking || !confirmed}
            >
              {isWorking ? "Retrying\u2026" : "Retry"}
            </Button>
            {isWorking && <LoadingNote label="Trying again." />}
            {resultError.raw && (
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer">Raw model output</summary>
                <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono">
                  {resultError.raw}
                </pre>
              </details>
            )}
          </section>
        )}

        {/* Outcome 1: solved-from-scratch. Explicitly NOT framed as a
            verdict — no correct/incorrect banner and no StepMark ticks,
            since there was no student work to check (see LOCKS). Treatment
            is a plain worked-solution walkthrough, distinct from the
            marking-rail outcomes below. */}
        {solved && (
          <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
            <div className="rounded-md border border-ink/20 bg-muted/40 p-4">
              <p className="font-display text-lg font-semibold text-ink">
                Here&apos;s how to solve this
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                No worked solution was found in your photo, so Gemma solved
                it from scratch — this isn&apos;t feedback on any work of
                yours.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {solved.steps.map((step) => (
                <div key={step.stepIndex} className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <p className="font-medium text-ink">Step {step.stepIndex + 1}</p>
                  <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono">
                    {step.workLatex}
                  </code>
                  <p className="mt-1 text-ink-muted">{step.explanation}</p>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-mark-correct/30 bg-mark-correct/10 p-3 text-sm">
              <p className="font-medium text-ink">Final answer</p>
              <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono">
                {solved.finalAnswerLatex}
              </code>
            </div>

            <Button variant="outline" size="sm" onClick={startOver} className="self-start">
              Check another problem
            </Button>
          </section>
        )}

        {/* Outcomes 2 & 3: the confirmed steps themselves ARE the marked
            page — each step's own MathInput content is what carries the
            StepMark tick/cross inline, in one visual unit (marking-rail
            + the student's own confirmed LaTeX), rather than a separate
            feedback list rendered below a step list. */}
        {analysis && confirmed?.steps && (
          <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
            <div
              className={`rounded-md p-4 font-display text-lg font-semibold ${
                analysis.isCorrect
                  ? "border border-mark-correct/30 bg-mark-correct/10 text-mark-correct"
                  : "border border-mark-error/30 bg-mark-error/10 text-mark-error"
              }`}
            >
              {analysis.isCorrect
                ? "Correct — every step holds up."
                : `Not quite — first slip at step ${(analysis.firstErrorStepIndex ?? 0) + 1}.`}
            </div>

            {/* The marked page: each confirmed step of the student's own
                work, with its tick/cross drawn directly onto the same
                card — this is the "your work, marked" unit, not a
                separate abstract feedback card. */}
            <div className="flex flex-col gap-3">
              {confirmed.steps.map((stepLatex, i) => {
                const fb = analysis.stepByStepFeedback.find((f) => f.stepIndex === i);
                return (
                  <div
                    key={i}
                    className="flex gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm"
                  >
                    <div className="flex w-5 flex-shrink-0 justify-center border-r border-border pr-3">
                      {fb && <StepMark status={fb.status} delayMs={i * 120} />}
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="font-medium text-ink">
                        Step {i + 1}
                        {fb ? ` — ${fb.status.replace("_", " ")}` : ""}
                      </p>
                      <code className="block rounded bg-muted px-2 py-1 font-mono text-ink">
                        {stepLatex}
                      </code>
                      {fb && <p className="text-ink-muted">{fb.explanation}</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            {!analysis.isCorrect && (
              <div className="flex flex-col gap-3 rounded-md border border-mark-flag/40 bg-mark-flag/10 p-4 text-sm">
                <div>
                  <p className="font-medium text-ink">Misconception</p>
                  <p className="mt-1 text-ink-muted">{analysis.misconceptionSummary}</p>
                </div>
                <div>
                  <p className="font-medium text-ink">Correct continuation</p>
                  <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono">
                    {analysis.correctContinuation}
                  </code>
                </div>
                <div>
                  <p className="font-medium text-ink">Why</p>
                  <p className="mt-1 text-ink-muted">
                    {analysis.correctContinuationExplanation}
                  </p>
                </div>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={startOver} className="self-start">
              Check another problem
            </Button>
          </section>
        )}
      </main>
    </Screen>
  );
}
