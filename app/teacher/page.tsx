"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { readFile, type UploadedImage } from "@/components/ImageUpload";
import LoadingNote from "@/components/LoadingNote";
import { composeProblem } from "@/lib/problem";

interface StudentResult {
  name: string;
  status: "pending" | "working" | "done" | "error";
  isCorrect?: boolean;
  misconceptionSummary?: string | null;
  error?: string;
}

interface ClassSummary {
  themes: { label: string; description: string }[];
  advice: string;
}

export default function TeacherPage() {
  const [images, setImages] = useState<{ name: string; image: UploadedImage }[]>([]);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [summary, setSummary] = useState<ClassSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function pickFiles(list: FileList | null) {
    if (!list) return;
    const picked: { name: string; image: UploadedImage }[] = [];
    for (const file of Array.from(list)) {
      if (!["image/jpeg", "image/png"].includes(file.type)) continue;
      picked.push({ name: file.name, image: await readFile(file) });
    }
    setImages(picked);
    setResults(picked.map((p) => ({ name: p.name, status: "pending" })));
    setSummary(null);
    setSummaryError(null);
  }

  // ponytail: strictly sequential — parallel calls just trade 429s for
  // wall-clock time on the free tier. Parallelize when a paid key exists.
  async function run() {
    setIsRunning(true);
    setSummary(null);
    setSummaryError(null);
    const collected: StudentResult[] = images.map((p) => ({ name: p.name, status: "pending" }));

    for (let i = 0; i < images.length; i++) {
      collected[i] = { ...collected[i], status: "working" };
      setResults([...collected]);
      try {
        const tRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: images[i].image.base64,
            mimeType: images[i].image.mimeType,
          }),
        });
        const tData = await tRes.json();
        if (!tRes.ok) throw new Error(tData.error ?? "Transcription failed.");
        // Teacher flow marks one problem per photo — take the first.
        const item = tData.problems[0];
        if (!item.hasWorkedSolution) {
          throw new Error("No worked solution found in this photo.");
        }
        const aRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problemStatementLatex: composeProblem(item.problemText, item.problemLatex),
            confirmedSteps: item.solutionSteps,
          }),
        });
        const aData = await aRes.json();
        if (!aRes.ok) throw new Error(aData.error ?? "Analysis failed.");
        collected[i] = {
          name: images[i].name,
          status: "done",
          isCorrect: aData.isCorrect,
          misconceptionSummary: aData.misconceptionSummary,
        };
      } catch (error) {
        collected[i] = {
          name: images[i].name,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error.",
        };
      }
      setResults([...collected]);
    }

    const misconceptions = collected
      .filter((r) => r.status === "done" && r.misconceptionSummary)
      .map((r) => r.misconceptionSummary as string);

    if (misconceptions.length > 0) {
      try {
        const sRes = await fetch("/api/class-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ misconceptions }),
        });
        const sData = await sRes.json();
        if (!sRes.ok) setSummaryError(sData.error ?? "Couldn't summarize the class.");
        else setSummary(sData);
      } catch {
        setSummaryError("Network error: could not reach the class-summary API.");
      }
    }
    setIsRunning(false);
  }

  const doneCount = results.filter((r) => r.status === "done" || r.status === "error").length;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-16">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          StepCheck for teachers
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Photograph a stack of attempts at the same problem. Gemma marks each
          one, then summarizes what the class misunderstands.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border-2 border-ink bg-white shadow-brut p-6">
        <label className="text-sm font-medium text-ink">
          Photos of student attempts (JPEG/PNG, one attempt per photo)
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          disabled={isRunning}
          onChange={(e) => void pickFiles(e.target.files)}
          className="text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-2 file:border-ink file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
        />
        <Button onClick={run} disabled={isRunning || images.length === 0}>
          {isRunning ? `Marking ${doneCount + 1} of ${images.length}…` : `Mark ${images.length || "the"} attempts`}
        </Button>
        {isRunning && (
          <LoadingNote label="Marking one attempt at a time to stay inside API rate limits." />
        )}
      </section>

      {results.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border-2 border-ink bg-white shadow-brut p-6 text-sm">
          {results.map((r) => (
            <div key={r.name} className="flex items-baseline justify-between gap-3 border-b border-hairline-soft pb-2 last:border-b-0 last:pb-0">
              <p className="font-mono text-xs text-ink-muted">{r.name}</p>
              {r.status === "pending" && <p className="text-ink-muted">Waiting…</p>}
              {r.status === "working" && <p className="text-ink-muted">Marking…</p>}
              {r.status === "error" && <p className="text-mark-error">{r.error}</p>}
              {r.status === "done" &&
                (r.isCorrect ? (
                  <p className="font-medium text-mark-correct">Correct</p>
                ) : (
                  <p className="text-mark-error">{r.misconceptionSummary}</p>
                ))}
            </div>
          ))}
        </section>
      )}

      {summaryError && (
        <section className="rounded-lg border border-mark-error/40 bg-mark-error/5 p-6 text-sm text-ink-muted">
          {summaryError}
        </section>
      )}

      {summary && (
        <section className="flex flex-col gap-4 rounded-lg border-2 border-ink bg-white shadow-brut p-6 text-sm">
          <p className="font-display text-xl font-semibold tracking-tight text-ink">
            What the class misunderstands
          </p>
          {summary.themes.map((t) => (
            <div key={t.label} className="rounded-md border border-mark-flag/40 bg-mark-flag/5 p-4">
              <p className="font-medium text-ink">{t.label}</p>
              <p className="mt-1 text-ink-muted">{t.description}</p>
            </div>
          ))}
          <div className="rounded-md bg-surface p-4">
            <p className="font-medium text-ink">Where to start</p>
            <p className="mt-1 text-ink-muted">{summary.advice}</p>
          </div>
        </section>
      )}
    </main>
  );
}
