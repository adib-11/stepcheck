// Fire-and-forget batch verification for /api/transcribe against every
// image in Test_images/. Runs unattended: 5s spacing between calls to
// respect the ~15/min free-tier ceiling, one retry with a 10s backoff on
// 429/5xx, then gives up on that image and records the error. Writes all
// results to test-results.json in one shot.
//
// Usage: node scripts/test-transcribe-batch.mjs
import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";

const TEST_IMAGES_DIR = path.join(process.cwd(), "Test_images");
const RESULTS_PATH = path.join(process.cwd(), "test-results.json");
const BASE_URL = process.env.STEPCHECK_BASE_URL ?? "http://localhost:3001";
const DELAY_MS = 5000;
const RETRY_BACKOFF_MS = 10000;

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callTranscribe(imageBase64, mimeType) {
  const res = await fetch(`${BASE_URL}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function transcribeWithOneRetry(imageBase64, mimeType) {
  let attempt = await callTranscribe(imageBase64, mimeType);
  if (attempt.status !== 200) {
    await sleep(RETRY_BACKOFF_MS);
    attempt = await callTranscribe(imageBase64, mimeType);
  }
  return attempt;
}

async function main() {
  const files = (await readdir(TEST_IMAGES_DIR))
    .filter((f) => MIME_BY_EXT[path.extname(f).toLowerCase()])
    .sort();

  const results = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    const fullPath = path.join(TEST_IMAGES_DIR, file);
    const imageBase64 = (await readFile(fullPath)).toString("base64");

    const { status, body } = await transcribeWithOneRetry(imageBase64, mimeType);

    if (status === 200) {
      results.push({
        file,
        status,
        hasWorkedSolution: body.hasWorkedSolution,
        problemStatementLatex: body.problemStatementLatex,
        solutionSteps: body.hasWorkedSolution ? body.solutionSteps : null,
      });
    } else {
      results.push({
        file,
        status,
        error: body.error ?? "unknown error",
        raw: body.raw,
      });
    }

    console.log(`${file} -> ${status}`);
    await sleep(DELAY_MS);
  }

  await writeFile(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} results to ${RESULTS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
