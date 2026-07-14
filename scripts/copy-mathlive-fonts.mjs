// MathLive serves its own KaTeX font files by default from a path that
// doesn't resolve under Next.js's webpack bundling. This script copies the
// font files into /public/mathlive-fonts on install, so they can be served
// as static assets and pointed to via `MathfieldElement.fontsDirectory`.
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "..", "node_modules", "mathlive", "fonts");
const destDir = join(__dirname, "..", "public", "mathlive-fonts");

if (!existsSync(srcDir)) {
  console.warn("mathlive fonts directory not found, skipping copy:", srcDir);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith(".woff2"));
for (const file of files) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}

console.log(`Copied ${files.length} MathLive font files to public/mathlive-fonts`);
