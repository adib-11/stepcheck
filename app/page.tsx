"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import ImageUpload, { type UploadedImage } from "@/components/ImageUpload";
import StepMark from "@/components/StepMark";
import LoadingNote from "@/components/LoadingNote";
import StagedStatus from "@/components/StagedStatus";
import Screen from "@/components/Screen";
import LandingHero from "@/components/LandingHero";
import HistoryList from "@/components/HistoryList";
import { saveHistoryEntry } from "@/lib/history";

// MathLive touches the DOM (custom elements) on import, so the input must
// only ever be rendered on the client.
const MathInput = dynamic(() => import("@/components/MathInput"), {
  ssr: false,
});
// Read-only counterpart to MathInput for displaying (not editing) LaTeX —
// same DOM-touching custom-element constraint applies, hence client-only.
const MathView = dynamic(() => import("@/components/MathView"), {
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
  misconceptionTag: string | null;
  correctContinuation: string | null;
  correctContinuationExplanation: string | null;
}

interface PracticeProblem {
  problemLatex: string;
  hint: string;
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

interface ChatTurn {
  role: "student" | "tutor";
  text: string;
}

interface ApiErrorState {
  message: string;
  raw?: string;
}

type TranscribeItem =
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
  const [transcribeResult, setTranscribeResult] = useState<TranscribeItem | null>(null);

  // Worksheet queue: every problem found in the photo, walked one at a time.
  const [queue, setQueue] = useState<TranscribeItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

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

  // Latest edit of the first wrong step, results-screen fix box. Null =
  // untouched, fall back to the step's confirmed LaTeX.
  const [fixLatex, setFixLatex] = useState<string | null>(null);

  const [practice, setPractice] = useState<PracticeProblem[] | null>(null);
  const [isPracticeLoading, setIsPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  const [hints, setHints] = useState<string[] | null>(null);
  const [hintsShown, setHintsShown] = useState(1);
  const [isHinting, setIsHinting] = useState(false);

  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const stage = analysis || solved || resultError || hints ? 3 : transcribeResult ? 2 : 1;

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

      const result = data as { problems: TranscribeItem[] };
      setQueue(result.problems);
      loadQueueItem(result.problems, 0);
    } catch {
      setTranscribeError("Network error: could not reach the transcribe API.");
    } finally {
      setIsTranscribing(false);
    }
  }

  // Loads one worksheet problem into the confirm screen, clearing all
  // per-problem result state but keeping the queue itself.
  function loadQueueItem(items: TranscribeItem[], index: number) {
    const item = items[index];
    setQueueIndex(index);
    setTranscribeResult(item);
    setProblem(item.problemStatementLatex);
    setSteps(item.hasWorkedSolution ? item.solutionSteps : null);
    setConfirmed(null);
    setAnalysis(null);
    setSolved(null);
    setResultError(null);
    setHints(null);
    setHintsShown(1);
    setPractice(null);
    setPracticeError(null);
    setChat([]);
    setChatInput("");
    setChatError(null);
    setFixLatex(null);
    setScreen("confirm");
  }

  // Type-it-in path: skip /api/transcribe entirely by seeding the confirm
  // screen with an empty synthetic "no worked solution" transcription.
  function startTyped() {
    setImage(null);
    setQueue([]);
    setQueueIndex(0);
    setTranscribeError(null);
    setTranscribeResult({ hasWorkedSolution: false, problemStatementLatex: "" });
    setProblem("");
    setSteps(null);
    setConfirmed(null);
    setAnalysis(null);
    setSolved(null);
    setResultError(null);
    setScreen("confirm");
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
    setFixLatex(null);
    setPractice(null);
    setPracticeError(null);
    setHints(null);
    setHintsShown(1);
    setChat([]);
    setChatInput("");
    setChatError(null);
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
        saveHistoryEntry({
          at: Date.now(),
          problemLatex: problemToUse,
          outcome: data.isCorrect ? "correct" : "incorrect",
          misconceptionSummary: data.misconceptionSummary,
          misconceptionTag: data.misconceptionTag ?? null,
        });
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
        saveHistoryEntry({
          at: Date.now(),
          problemLatex: problemToUse,
          outcome: "solved",
          misconceptionSummary: null,
        });
      }
    } catch {
      setResultError({ message: "Network error: could not reach the API." });
    } finally {
      setIsWorking(false);
    }
  }

  async function runHints(problemToUse: string) {
    setConfirmed({ problem: problemToUse, steps: null });
    setIsHinting(true);
    setResultError(null);
    setAnalysis(null);
    setSolved(null);
    setHints(null);
    setHintsShown(1);
    setScreen("results");
    try {
      const res = await fetch("/api/hints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemStatementLatex: problemToUse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultError({ message: data.error ?? "Couldn't get hints.", raw: data.raw });
        return;
      }
      setHints(data.hints);
    } catch {
      setResultError({ message: "Network error: could not reach the hints API." });
    } finally {
      setIsHinting(false);
    }
  }

  async function fetchPractice() {
    if (!confirmed || !analysis?.misconceptionSummary) return;
    setIsPracticeLoading(true);
    setPracticeError(null);
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemStatementLatex: confirmed.problem,
          misconceptionSummary: analysis.misconceptionSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPracticeError(data.error ?? "Couldn't generate practice problems.");
        return;
      }
      setPractice(data.problems);
    } catch {
      setPracticeError("Network error: could not reach the practice API.");
    } finally {
      setIsPracticeLoading(false);
    }
  }

  async function askFollowUp() {
    const question = chatInput.trim();
    if (!question || !confirmed || isAsking) return;
    setIsAsking(true);
    setChatError(null);
    const contextSummary = [
      `Problem (LaTeX): ${confirmed.problem}`,
      confirmed.steps
        ? `Student steps (LaTeX): ${confirmed.steps.join(" | ")}`
        : "The student submitted no steps of their own.",
      analysis ? `Marking result JSON: ${JSON.stringify(analysis)}` : "",
      solved ? `Worked solution JSON: ${JSON.stringify(solved)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ponytail: transcript capped at the last 6 turns — summarize older
        // turns only if students genuinely hold long conversations here.
        body: JSON.stringify({ contextSummary, transcript: chat.slice(-6), question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error ?? "Couldn't answer that.");
        return;
      }
      setChat((prev) => [
        ...prev,
        { role: "student", text: question },
        { role: "tutor", text: data.answer },
      ]);
      setChatInput("");
    } catch {
      setChatError("Network error: could not reach the follow-up API.");
    } finally {
      setIsAsking(false);
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
    setQueue([]);
    setQueueIndex(0);
    setTranscribeResult(null);
    setTranscribeError(null);
    setProblem("");
    setSteps(null);
    setConfirmed(null);
    setAnalysis(null);
    setSolved(null);
    setResultError(null);
    setFixLatex(null);
    setPractice(null);
    setPracticeError(null);
    setHints(null);
    setHintsShown(1);
    setChat([]);
    setChatInput("");
    setChatError(null);
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

  // Steps stripped of blank entries; null when nothing meaningful remains,
  // which routes the confirm into the solve-from-scratch path.
  const cleanedSteps = (() => {
    const filtered = steps?.filter((s) => s.trim() !== "") ?? [];
    return filtered.length > 0 ? filtered : null;
  })();

  const header = (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {screen !== "landing" && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden fill="none">
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
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            StepCheck
          </h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Line by line, like a marker would.
          </p>
        </div>
      </div>

      {/* Progress as pill-tab chips (pill-tab / pill-tab-active): the
          current-and-done stages get the black pill, upcoming stages the
          outlined pill. */}
      <nav aria-label="Progress" className="flex flex-wrap items-center gap-2">
        {STAGE_LABELS.map((label, i) => (
          <span
            key={label}
            className={
              i + 1 <= stage
                ? "rounded-full bg-ink px-3 py-1 text-xs font-medium text-white"
                : "rounded-full border border-hairline bg-white px-3 py-1 text-xs font-medium text-ink-muted"
            }
          >
            {i + 1}. {label}
          </span>
        ))}
      </nav>
    </header>
  );

  if (screen === "landing") {
    return (
      <Screen screenKey="landing">
        <LandingHero onStart={() => setScreen("upload")} />
        <HistoryList />
      </Screen>
    );
  }

  if (screen === "upload") {
    return (
      <Screen screenKey="upload">
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
          {header}

          <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-white p-6">
            <label className="text-sm font-medium text-ink">
              Page 1 — Photo of the problem (and your working, if you have any)
            </label>
            <ImageUpload onChange={setImage} />
            <Button onClick={transcribe} disabled={!image || isTranscribing}>
              {isTranscribing ? "Reading\u2026" : "Read photo"}
            </Button>
            {isTranscribing && <LoadingNote label="Gemma is reading your photo." />}

            {transcribeError && (
              <div className="flex flex-col gap-2 rounded-md border border-mark-error/40 bg-mark-error/5 p-4 text-sm">
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

            <button
              type="button"
              onClick={startTyped}
              className="self-center text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              No photo? Type the problem instead
            </button>
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
            <section className="flex flex-col gap-5 rounded-lg border border-hairline bg-white p-6">
              <div>
                {queue.length > 1 && (
                  <span className="mb-2 inline-block rounded-full border border-hairline bg-white px-3 py-1 text-xs font-medium text-ink-muted">
                    Problem {queueIndex + 1} of {queue.length}
                  </span>
                )}
                <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                  {image ? "Page 2 — Confirm what was read" : "Type your problem"}
                </h2>
                <p className="text-sm text-ink-muted">
                  {image
                    ? steps
                      ? "Check the problem and each step against the photo and fix anything the model got wrong."
                      : "No worked solution was found in this photo — just confirm the problem statement, and Gemma will solve it for you."
                    : "Enter the problem statement, and optionally your own working — Gemma will mark it step by step, or solve it if you leave the steps out."}
                </p>
              </div>

              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image.previewUrl}
                  alt="Your uploaded photo"
                  className="max-h-40 self-start rounded-md border border-hairline object-contain"
                />
              )}

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-ink">Problem statement</label>
                <MathInput defaultValue={problem} onChange={setProblem} />
              </div>

              {image && steps && transcriptionLooksShaky(steps) && (
                <div className="rounded-md border border-mark-flag/40 bg-mark-flag/5 p-4 text-sm text-ink">
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

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSteps((prev) => [...(prev ?? []), ""])}
                >
                  {steps ? "Add another step" : "Add my working"}
                </Button>
                {steps && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSteps((prev) => (prev && prev.length > 1 ? prev.slice(0, -1) : null))
                    }
                  >
                    Remove last step
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => runResult(problem, cleanedSteps)} disabled={isWorking || !problem}>
                  {isWorking ? "Working\u2026" : "Confirm"}
                </Button>
                {!cleanedSteps && (
                  <Button
                    variant="outline"
                    onClick={() => runHints(problem)}
                    disabled={isWorking || isHinting || !problem}
                  >
                    {isHinting ? "Thinking\u2026" : "Just give me a hint"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-ink-muted">
                Checking usually takes 1-2 minutes -- Gemma solves the whole
                problem itself before marking anything.
              </p>
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
        {(isWorking || isHinting) && !resultError && !solved && !analysis && !hints && (
          <section className="flex flex-col items-center gap-4 rounded-lg border border-hairline bg-white p-8 text-center">
            <div className="flex gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-3 w-3 rounded-full bg-brand"
                  style={{
                    animation: "mark-in 1s ease-in-out infinite alternate",
                    animationDelay: `${i * 200}ms`,
                  }}
                />
              ))}
            </div>
            <div>
              <StagedStatus mode={confirmed?.steps ? "analyze" : "solve"} />
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
          <section className="flex flex-col gap-2 rounded-lg border border-mark-error/40 bg-mark-error/5 p-6">
            <p className="text-sm font-medium text-mark-error">
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
                <pre className="mt-2 overflow-x-auto rounded-md bg-[#1c1c1e] p-4 font-mono text-xs text-white">
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
          <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-white p-6">
            <div className="rounded-md bg-surface p-5">
              <p className="font-display text-xl font-semibold tracking-tight text-ink">
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
                <div key={step.stepIndex} className="rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm">
                  <p className="font-medium text-ink">Step {step.stepIndex + 1}</p>
                  <div className="mt-1 rounded-md border border-hairline-soft bg-white px-3 py-2">
                    <MathView latex={step.workLatex} />
                  </div>
                  <p className="mt-1 text-ink-muted">{step.explanation}</p>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-mark-correct/30 bg-mark-correct/5 p-4 text-sm">
              <p className="font-medium text-ink">Final answer</p>
              <div className="mt-1 rounded-md border border-hairline-soft bg-white px-3 py-2">
                <MathView latex={solved.finalAnswerLatex} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {queueIndex < queue.length - 1 && (
                <Button size="sm" onClick={() => loadQueueItem(queue, queueIndex + 1)}>
                  Next problem ({queueIndex + 2} of {queue.length})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={startOver}>
                Check another problem
              </Button>
            </div>
          </section>
        )}

        {hints && (
          <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-white p-6">
            <div className="rounded-md bg-surface p-5">
              <p className="font-display text-xl font-semibold tracking-tight text-ink">
                Nudges, not answers
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Each hint is a little stronger than the last. Reveal only as
                many as you need, then try it on paper.
              </p>
            </div>

            {hints.slice(0, hintsShown).map((hint, i) => (
              <div key={i} className="rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm">
                <p className="font-medium text-ink">Hint {i + 1}</p>
                <p className="mt-1 text-ink-muted">{hint}</p>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              {hintsShown < hints.length && (
                <Button variant="outline" size="sm" onClick={() => setHintsShown((n) => n + 1)}>
                  Stronger hint
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => confirmed && runResult(confirmed.problem, null)}
                disabled={isWorking}
              >
                Just show me the full solution
              </Button>
              <Button variant="outline" size="sm" onClick={startOver}>
                Check another problem
              </Button>
            </div>
          </section>
        )}

        {/* Outcomes 2 & 3: the confirmed steps themselves ARE the marked
            page — each step's own MathInput content is what carries the
            StepMark tick/cross inline, in one visual unit (marking-rail
            + the student's own confirmed LaTeX), rather than a separate
            feedback list rendered below a step list. */}
        {analysis && confirmed?.steps && (
          <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-white p-6">
            <div
              className={`rounded-md p-5 font-display text-xl font-semibold tracking-tight ${
                analysis.isCorrect
                  ? "border border-mark-correct/30 bg-mark-correct/5 text-mark-correct"
                  : "border border-mark-error/30 bg-mark-error/5 text-mark-error"
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
                    className="flex gap-3 rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm"
                  >
                    <div className="flex w-5 flex-shrink-0 justify-center border-r border-hairline pr-3">
                      {fb && <StepMark status={fb.status} delayMs={i * 120} />}
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="font-medium text-ink">
                        Step {i + 1}
                        {fb ? ` — ${fb.status.replace("_", " ")}` : ""}
                      </p>
                      <div className="rounded-md border border-hairline-soft bg-white px-3 py-2 text-ink">
                        <MathView latex={stepLatex} />
                      </div>
                      {fb && <p className="text-ink-muted">{fb.explanation}</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            {!analysis.isCorrect && (
              <div className="flex flex-col gap-3 rounded-md border border-mark-flag/40 bg-mark-flag/5 p-5 text-sm">
                <div>
                  <p className="font-medium text-ink">Misconception</p>
                  <p className="mt-1 text-ink-muted">{analysis.misconceptionSummary}</p>
                </div>
                <div>
                  <p className="font-medium text-ink">Correct continuation</p>
                  <div className="mt-1 rounded-md border border-hairline-soft bg-white px-3 py-2">
                    {analysis.correctContinuation && (
                      <MathView latex={analysis.correctContinuation} />
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-ink">Why</p>
                  <p className="mt-1 text-ink-muted">
                    {analysis.correctContinuationExplanation}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-ink">Fix it and re-check</p>
                  <p className="mt-1 text-ink-muted">
                    Edit step {(analysis.firstErrorStepIndex ?? 0) + 1} below and
                    Gemma will mark your whole solution again.
                  </p>
                  <div className="mt-2 rounded-md border border-hairline-soft bg-white px-3 py-2">
                    <MathInput
                      key={`fix-${analysis.firstErrorStepIndex}`}
                      defaultValue={confirmed.steps[analysis.firstErrorStepIndex ?? 0]}
                      onChange={setFixLatex}
                    />
                  </div>
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={isWorking}
                    onClick={() => {
                      const idx = analysis.firstErrorStepIndex ?? 0;
                      const next = [...confirmed.steps!];
                      next[idx] = fixLatex ?? next[idx];
                      // Keep the confirm screen's editable copies in sync so
                      // goBack() shows the fixed step, not the stale one.
                      setSteps(next);
                      runResult(confirmed.problem, next);
                    }}
                  >
                    Re-check my fix
                  </Button>
                </div>
              </div>
            )}

            {!analysis.isCorrect && analysis.misconceptionSummary && (
              <div className="flex flex-col gap-3 rounded-md border border-hairline-soft bg-surface-soft p-5 text-sm">
                <div>
                  <p className="font-medium text-ink">Practice this</p>
                  <p className="mt-1 text-ink-muted">
                    Fresh problems that drill exactly the skill this slip came
                    from. Work them on paper, then photograph your attempt to
                    get it checked.
                  </p>
                </div>

                {!practice && (
                  <Button
                    size="sm"
                    className="self-start"
                    onClick={fetchPractice}
                    disabled={isPracticeLoading}
                  >
                    {isPracticeLoading ? "Writing problems…" : "Give me practice problems"}
                  </Button>
                )}
                {isPracticeLoading && (
                  <LoadingNote label="Gemma is writing problems aimed at this misconception." />
                )}
                {practiceError && <p className="text-mark-error">{practiceError}</p>}

                {practice &&
                  practice.map((p, i) => (
                    <div key={i} className="rounded-md border border-hairline-soft bg-white p-4">
                      <p className="font-medium text-ink">Problem {i + 1}</p>
                      <div className="mt-1 rounded-md border border-hairline-soft bg-surface px-3 py-2">
                        <MathView latex={p.problemLatex} />
                      </div>
                      <details className="mt-2 text-ink-muted">
                        <summary className="cursor-pointer font-medium text-ink">Hint</summary>
                        <p className="mt-1">{p.hint}</p>
                      </details>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {queueIndex < queue.length - 1 && (
                <Button size="sm" onClick={() => loadQueueItem(queue, queueIndex + 1)}>
                  Next problem ({queueIndex + 2} of {queue.length})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={startOver}>
                Check another problem
              </Button>
            </div>
          </section>
        )}

        {(analysis || solved) && (
          <section className="flex flex-col gap-3 rounded-lg border border-hairline bg-white p-6 text-sm">
            <div>
              <p className="font-medium text-ink">Ask a follow-up</p>
              <p className="mt-1 text-ink-muted">
                Scoped to this problem and its marking — ask why a step is
                wrong, or what to review next.
              </p>
            </div>

            {chat.map((turn, i) => (
              <div
                key={i}
                className={
                  turn.role === "student"
                    ? "rounded-md bg-surface px-3 py-2 text-ink"
                    : "rounded-md border border-hairline-soft bg-surface-soft px-3 py-2 text-ink-muted"
                }
              >
                <span className="font-medium text-ink">
                  {turn.role === "student" ? "You: " : "Gemma: "}
                </span>
                {turn.text}
              </div>
            ))}
            {chatError && <p className="text-mark-error">{chatError}</p>}

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") askFollowUp();
                }}
                placeholder="Why is that step wrong?"
                className="w-full rounded-md border border-hairline bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button size="sm" onClick={askFollowUp} disabled={isAsking || !chatInput.trim()}>
                {isAsking ? "Thinking…" : "Ask"}
              </Button>
            </div>
            {isAsking && <LoadingNote label="Gemma is thinking about your question." />}
          </section>
        )}
      </main>
    </Screen>
  );
}
