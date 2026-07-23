# Mintlify UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle StepCheck's entire UI from the "exam paper + red pen" system to the Mintlify design system (`/Users/adib/Downloads/DESIGN-mintlify.md`) — white canvas, hairline borders, Inter + Geist Mono, black pill buttons, mint-green accent, atmospheric sky-gradient hero — without changing any functionality.

**Architecture:** The app already routes every color through two indirection layers: semantic Tailwind tokens (`ink`, `ink-muted`, `mark-correct/error/flag`) in `tailwind.config.ts`, and shadcn CSS variables (`--background`, `--border`, `--primary`, …) in `app/globals.css`. Tasks 1–2 repoint those layers at Mintlify values, which recolors ~80% of the app with zero component edits. Tasks 3–7 then restyle shapes and typography per surface (pill buttons, hero band, cards, progress nav). Task 8 updates the design docs so future agents follow the new system.

**Tech Stack:** Next.js 14 App Router, Tailwind 3, shadcn/ui button, MathLive, `next/font/google` (Inter), self-hosted Geist Mono.

## Global Constraints

- **Zero functionality changes.** No edits to `app/api/**`, `lib/**`, state logic in `app/page.tsx`, `MathInput`/`MathView` behavior, `ImageUpload` file handling, or any fetch/validation code. Only classNames, styles, fonts, tokens, and static JSX structure (wrappers, ordering) may change.
- **No new npm dependencies.** Inter comes from `next/font/google` (already a Next.js built-in). Geist Mono stays self-hosted from `app/fonts/`.
- **Fonts:** Inter for all UI prose and headings; Geist Mono for code only. Fraunces and IBM Plex Sans are removed. (This supersedes the old DESIGN.md rule "do not introduce Inter" — the user chose the Mintlify system, which mandates Inter.)
- **Color discipline (from Mintlify Do's/Don'ts):** `#00d4a4` (brand mint) only on accent CTAs, focus rings, and active states — never body text or large fills. Grading semantics stay on dedicated tokens: correct `#1ba673`, error `#d45656`, flag/warn `#c37d0d`.
- **Shape discipline:** all buttons `rounded-full` (pills); cards `12px` radius; inputs/code `8px`; never a radius between 8 and 12px in the same family.
- **Keep the two existing animations exactly as-is:** `mark-in` (StepMark stagger, the signature moment) and `screen-in` (screen transitions), including the `prefers-reduced-motion` guard. Do not add hover/scroll/load animations anywhere else.
- **Keep all existing semantic class names working.** Repoint token values; don't rename tokens that components already use (`ink`, `ink-muted`, `mark-*`), so untouched files keep compiling and rendering correctly.
- **MathLive constraint:** `MathInput`/`MathView` must stay client-only (`dynamic(..., { ssr: false })` in `app/page.tsx`); `MathfieldElement.fontsDirectory = "/mathlive-fonts"` must not be touched.
- **Verification (no test runner exists in this repo):** every task ends with `npm run build` (runs lint + type-check + compile; expected tail: `✓ Generating static pages (8/8)`) plus a visual check of the affected screen at `localhost:3000` (`npm run dev`). The results/confirm screens can be reached without a real photo by using the landing → upload flow with any image from `Test_images/`.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File Structure

| File | Action | Responsibility after this plan |
|---|---|---|
| `tailwind.config.ts` | Modify | Mintlify semantic color tokens, Inter/Geist Mono font mapping, 12px card radius |
| `app/globals.css` | Modify | shadcn CSS vars → Mintlify values; remove graph-paper texture; keep `mark-in`/`screen-in` |
| `app/layout.tsx` | Modify | Load Inter (replaces Fraunces + IBM Plex Sans); keep Geist Mono |
| `components/ui/button.tsx` | Modify | Pill button variants: black primary, mint accent, outlined secondary, ghost |
| `components/LandingHero.tsx` | Modify | Sky-gradient hero band + product-mockup demo card + accent CTA |
| `app/page.tsx` | Modify | Header/progress pill nav, card polish, typography classes only |
| `components/ImageUpload.tsx` | Modify | Dropzone restyle (surface bg, hairline dashed border, 12px radius) |
| `components/MathInput.tsx` | Modify | Input styling per `text-input` token (8px radius, 40px+ height feel) |
| `components/StepMark.tsx` | None | Already uses `currentColor` + `text-mark-*`; recolors via Task 1 |
| `components/MathView.tsx`, `components/Screen.tsx`, `components/LoadingNote.tsx` | None | Inherit tokens |
| `DESIGN.md` | Replace | Points at the Mintlify system as the active design language |
| `CLAUDE.md` | Modify | Design-system section rewritten to match |

---

### Task 1: Token foundation — colors and radius

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css:13-67`

**Interfaces:**
- Produces: Tailwind classes `bg-paper`, `text-ink`, `text-ink-muted`, `text-charcoal`, `bg-surface`, `bg-surface-soft`, `border-hairline`, `border-hairline-soft`, `bg-brand`, `bg-brand-deep`, `bg-brand-soft`, `text-mark-correct`, `text-mark-error`, `text-mark-flag`, `from-hero-from`, `via-hero-to` — used by every later task. shadcn vars (`--background`, `--border`, `--ring`, …) repointed so `bg-card`, `border-border`, `bg-muted`, `text-muted-foreground`, `ring-ring` etc. recolor everywhere automatically.

- [ ] **Step 1: Replace the color and radius blocks in `tailwind.config.ts`**

Replace the `fontFamily`, `colors`, and `borderRadius` entries inside `theme.extend` (keep `content`, `darkMode`, `plugins` unchanged):

```ts
  theme: {
  	extend: {
  		fontFamily: {
  			display: ['var(--font-inter)', 'sans-serif'],
  			body: ['var(--font-inter)', 'sans-serif'],
  			mono: ['var(--font-geist-mono)', 'monospace'],
  		},
  		colors: {
  			// Mintlify system (see DESIGN.md). Token names kept from the old
  			// system where components already reference them (paper, ink,
  			// ink-muted, mark-*) so existing classes recolor in place.
  			paper: '#ffffff',            // {colors.canvas}
  			surface: {
  				DEFAULT: '#f7f7f7',        // {colors.surface}
  				soft: '#fafafa',           // {colors.surface-soft}
  			},
  			hairline: {
  				DEFAULT: '#e5e5e5',        // {colors.hairline}
  				soft: '#ededed',           // {colors.hairline-soft}
  			},
  			charcoal: '#1c1c1e',         // {colors.charcoal} — pressed primary
  			ink: {
  				DEFAULT: '#0a0a0a',        // {colors.ink}
  				muted: '#5a5a5c',          // {colors.steel}
  			},
  			brand: {
  				DEFAULT: '#00d4a4',        // {colors.brand-green} — accent only
  				deep: '#00b48a',           // {colors.brand-green-deep}
  				soft: '#7cebcb',           // {colors.brand-green-soft}
  			},
  			mark: {
  				correct: '#1ba673',        // {colors.brand-annotate}
  				error: '#d45656',          // {colors.brand-error}
  				flag: '#c37d0d',           // {colors.brand-warn}
  			},
  			hero: {
  				from: '#87a8c8',           // {colors.hero-sky-from}
  				to: '#f5e9d8',             // {colors.hero-sky-to}
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 4px)',
  			sm: 'calc(var(--radius) - 6px)'
  		}
  	}
  },
```

Note `borderRadius`: `--radius` becomes `0.75rem` (12px) in Step 2, so `rounded-lg` = 12px (cards), `rounded-md` = 8px (inputs/code), `rounded-sm` = 6px (nav chips) — exactly the Mintlify scale with no in-between values.

- [ ] **Step 2: Replace the `:root` variable block and body styling in `app/globals.css`**

Replace the entire first `@layer base { :root { ... } }` block (lines 13–48) with:

```css
@layer base {
  /*
   * Mintlify token system (see DESIGN.md). The shadcn CSS-variable names
   * are kept so ui/button.tsx variants and Tailwind classes (bg-background,
   * text-muted-foreground, border-border, etc.) work unchanged, but the
   * values now point at the Mintlify palette: white canvas, near-black ink,
   * hairline borders, mint-green accent.
   */
  :root {
    --background: 0 0% 100%; /* canvas #ffffff */
    --foreground: 0 0% 4%; /* ink #0a0a0a */
    --card: 0 0% 100%;
    --card-foreground: 0 0% 4%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 4%;
    --primary: 0 0% 4%; /* black pill CTA */
    --primary-foreground: 0 0% 100%;
    --secondary: 0 0% 97%; /* surface #f7f7f7 */
    --secondary-foreground: 0 0% 4%;
    --muted: 0 0% 97%; /* surface */
    --muted-foreground: 240 1% 36%; /* steel #5a5a5c */
    --accent: 166 100% 42%; /* brand mint #00d4a4 */
    --accent-foreground: 0 0% 4%;
    --destructive: 0 59% 58%; /* brand-error #d45656 */
    --destructive-foreground: 0 0% 100%;
    --border: 0 0% 90%; /* hairline #e5e5e5 */
    --input: 0 0% 90%;
    --ring: 166 100% 42%; /* focus = brand mint, per text-input-focused */
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
    --radius: 0.75rem; /* 12px — {rounded.lg}, the Mintlify card radius */
  }
}
```

- [ ] **Step 3: Remove the graph-paper texture (flat white canvas per Mintlify)**

In the second `@layer base` block of `app/globals.css`, replace:

```css
  body {
    @apply bg-background text-foreground font-body;
    /* Faint graph-paper texture (the `grid` token) behind the whole app. */
    background-image:
      linear-gradient(hsl(var(--border) / 0.5) 1px, transparent 1px),
      linear-gradient(90deg, hsl(var(--border) / 0.5) 1px, transparent 1px);
    background-size: 28px 28px;
  }
  h1, h2, h3 {
    @apply font-display;
  }
```

with:

```css
  body {
    @apply bg-background text-foreground font-body;
  }
  h1, h2, h3 {
    @apply font-display tracking-tight;
  }
```

Leave everything below (the `math-field:focus-within` rule, `mark-in`, `screen-in`, and the reduced-motion guard) exactly as it is.

- [ ] **Step 4: Fix the two hardcoded references the old `grid` token leaves behind**

`grep -rn "grid\b" tailwind.config.ts` must return nothing (the `grid: '#C9DAE3'` entry was removed in Step 1 — confirm no component references `bg-grid`/`border-grid`):

Run: `grep -rn "text-grid\|bg-grid\|border-grid" app components`
Expected: no output. (If any appear, replace with `border-hairline`.)

- [ ] **Step 5: Build and visually verify**

Run: `npm run build`
Expected: `✓ Generating static pages (8/8)`

Run `npm run dev`, open `localhost:3000`. Expected: white background, no graph-paper grid, near-black text, existing layout intact (typography still old fonts — that's Task 2). The landing demo card's tick/cross marks now render in `#1ba673` green and `#d45656` red.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "redesign: repoint color tokens and radius scale to Mintlify system"
```

---

### Task 2: Typography — Inter everywhere, Geist Mono for code

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `font-display` / `font-body` Tailwind families from Task 1 (both now `var(--font-inter)`).
- Produces: CSS variable `--font-inter` on `<body>`; `--font-geist-mono` unchanged. All later tasks assume headings are Inter 600 with tight tracking.

- [ ] **Step 1: Replace the font setup in `app/layout.tsx`**

Replace the entire file with:

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter } from "next/font/google";
import "./globals.css";

// Geist Mono stays: code blocks, raw LaTeX/JSON debug output only.
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Inter carries all UI prose and headings (Mintlify system — see DESIGN.md).
// Weights: 400 body, 500 buttons/emphasis, 600 headings.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "StepCheck",
  description:
    "AI-powered step-by-step checker for handwritten math solutions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Confirm no orphaned font variables remain**

Run: `grep -rn "font-display\|font-body" tailwind.config.ts app components | grep -v "var(--font-inter)"`
Expected: only *class usages* (`font-display`, `font-body` in classNames) — those are fine since both families now resolve to Inter. There must be no remaining `--font-display` / `--font-body` variable definitions.

Run: `grep -rn "Fraunces\|IBM_Plex\|font-body\b" app/layout.tsx`
Expected: no output.

- [ ] **Step 3: Build and visually verify**

Run: `npm run build`
Expected: `✓ Generating static pages (8/8)`

Visual: all text renders in Inter; headings are semibold with tight tracking; the demo card's LaTeX line stays in Geist Mono.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "redesign: replace Fraunces/IBM Plex Sans with Inter, keep Geist Mono for code"
```

---

### Task 3: Pill buttons

**Files:**
- Modify: `components/ui/button.tsx:7-35`

**Interfaces:**
- Consumes: tokens from Task 1 (`bg-ink`, `charcoal`, `brand`, `surface`, `hairline`).
- Produces: `<Button>` variants `default` (black pill), `accent` (mint pill — **new**), `outline` (hairline pill), `secondary`, `ghost`, `link`, `destructive`. Task 4 uses `variant="accent"`; every other call site keeps its existing variant prop untouched.

- [ ] **Step 1: Replace `buttonVariants` in `components/ui/button.tsx`**

Replace the whole `const buttonVariants = cva(...)` expression (keep imports and the `Button` component below it unchanged):

```tsx
const buttonVariants = cva(
  // Pill shape on every button per the Mintlify system — squared buttons
  // signal "third-party widget" in this language (DESIGN.md, Shapes).
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-white hover:bg-charcoal",
        accent: "bg-brand text-ink hover:bg-brand-deep",
        destructive: "bg-mark-error text-white hover:bg-mark-error/90",
        outline: "border border-hairline bg-white text-ink hover:bg-surface",
        secondary: "bg-surface text-ink hover:bg-hairline-soft",
        ghost: "rounded-md text-ink hover:bg-surface",
        link: "text-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-4 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

- [ ] **Step 2: Build and visually verify**

Run: `npm run build`
Expected: `✓ Generating static pages (8/8)` — TypeScript will also prove no existing call site uses a removed variant (all previous variant names still exist).

Visual: every button in the app is now a pill — black primary on upload/confirm, outlined retry/start-over buttons.

- [ ] **Step 3: Commit**

```bash
git add components/ui/button.tsx
git commit -m "redesign: pill buttons — black primary, mint accent, hairline outline"
```

---

### Task 4: Landing hero — sky gradient band + product-mockup demo card

**Files:**
- Modify: `components/LandingHero.tsx`

**Interfaces:**
- Consumes: `variant="accent"` from Task 3; `from-hero-from`/`via-hero-to` gradient tokens from Task 1; existing `StepMark` and `useDemoCycle` (behavior untouched).
- Produces: nothing consumed downstream; `onStart` prop contract unchanged.

- [ ] **Step 1: Restyle the hero (keep `DEMO_STEPS`, `useDemoCycle`, and all logic identical)**

Replace only the returned JSX of `LandingHero` (everything inside `return (...)`) with:

```tsx
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16 text-center sm:px-6">
      {/* Atmospheric sky band — the one gradient moment in the app
          (hero-band-sky, DESIGN.md). Fades into the white canvas. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[65vh] bg-gradient-to-b from-hero-from/60 via-hero-to/50 to-white"
      />

      <div className="flex w-full max-w-2xl flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-4">
          <h1 className="font-display text-5xl font-semibold tracking-[-0.02em] text-ink sm:text-6xl">
            StepCheck
          </h1>
          <p className="max-w-md text-balance text-lg text-ink-muted">
            Line by line, like a marker would. Photograph your working and
            get a tick or a cross on every step, not just a final grade.
          </p>
        </div>

        {/* Demo card styled as the hero product mockup: white card, soft
            hairline border, deep diffuse drop shadow (hero-product-mockup). */}
        <div
          className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-hairline-soft bg-white p-6 text-left shadow-[0_24px_48px_-8px_rgba(0,0,0,0.12)]"
          aria-hidden
        >
          {DEMO_STEPS.map((step, i) => (
            <div
              key={`${cycle}-${i}`}
              className="flex items-center gap-3 rounded-md border border-hairline-soft bg-surface-soft p-3 text-sm"
            >
              <div className="flex w-5 flex-shrink-0 justify-center border-r border-hairline pr-3">
                <StepMark status={step.status} delayMs={i * 350} />
              </div>
              <code className="font-mono text-sm text-ink">{step.latex}</code>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="accent" size="lg" onClick={onStart} className="px-8">
            Check my work
          </Button>
        </div>
      </div>
    </main>
```

- [ ] **Step 2: Build and visually verify**

Run: `npm run build`
Expected: `✓ Generating static pages (8/8)`

Visual on `localhost:3000`: soft sky-blue→cream wash fading to white behind the headline; demo card floats with the deep mockup shadow; mint pill CTA; tick/cross demo still cycles every 2.6s.

- [ ] **Step 3: Commit**

```bash
git add components/LandingHero.tsx
git commit -m "redesign: landing hero — sky gradient band, mockup demo card, mint CTA"
```

---

### Task 5: Header wordmark + pill progress nav (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx:216-258` (the `header` JSX constant only — no state or handler changes)

**Interfaces:**
- Consumes: tokens from Task 1. `STAGE_LABELS`, `stage`, `screen`, `goBack` — all existing, unchanged.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Replace the `header` constant's JSX**

Replace the `const header = (...)` block with:

```tsx
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
```

- [ ] **Step 2: Build and visually verify**

Run: `npm run build`
Expected: `✓ Generating static pages (8/8)`

Visual: on the upload screen, circular hairline back button, Inter wordmark, "1. Photo" as a black pill and the rest as outlined pills; pills flip as you advance to confirm/results.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "redesign: header wordmark and pill-tab progress nav"
```

---

### Task 6: Upload + confirm screens — cards, dropzone, math input

**Files:**
- Modify: `app/page.tsx:268-380` (upload + confirm screen JSX, classNames only)
- Modify: `components/ImageUpload.tsx:60-108` (dropzone/preview classNames only — `handleFile`, `readFile`, validation untouched)
- Modify: `components/MathInput.tsx:74-86` (the inline `style` object only — events/refs untouched)

**Interfaces:**
- Consumes: tokens (Task 1), pill buttons (Task 3).
- Produces: nothing consumed downstream. `UploadedImage`/`onChange` contracts unchanged.

- [ ] **Step 1: Upload screen card in `app/page.tsx`**

In the `screen === "upload"` block, replace:

```tsx
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
```
with:
```tsx
          <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-white p-6">
```

and replace the error box classes:
```tsx
              <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
```
with:
```tsx
              <div className="flex flex-col gap-2 rounded-md border border-mark-error/40 bg-mark-error/5 p-4 text-sm">
```

- [ ] **Step 2: Confirm screen card in `app/page.tsx`**

In the `screen === "confirm"` block, replace:
```tsx
            <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
```
with:
```tsx
            <section className="flex flex-col gap-5 rounded-lg border border-hairline bg-white p-6">
```

Replace the section heading class:
```tsx
                <h2 className="font-display text-lg font-semibold text-ink">
```
with:
```tsx
                <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
```

Replace the shaky-transcription warning box:
```tsx
                <div className="rounded-md border border-mark-flag/40 bg-mark-flag/10 p-3 text-sm text-ink">
```
with:
```tsx
                <div className="rounded-md border border-mark-flag/40 bg-mark-flag/5 p-4 text-sm text-ink">
```

Replace the photo thumbnail border `border-border` with `border-hairline` in the confirm screen's `<img>`.

- [ ] **Step 3: Dropzone in `components/ImageUpload.tsx`**

Replace the dropzone wrapper className (the template literal on the `role="button"` div):

```tsx
        className={`flex min-h-[10rem] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm text-ink-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          isDragging ? "border-brand bg-brand/5" : "border-hairline bg-surface-soft"
        }`}
```

Replace the preview image class `rounded` with `rounded-md`, and the error `<p>` class `text-destructive` with `text-mark-error`.

- [ ] **Step 4: Math input styling in `components/MathInput.tsx`**

Replace the `style` object on `<math-field>`:

```tsx
        style={{
          width: "100%",
          minHeight: "3.5rem",
          fontSize: "1.25rem",
          padding: "0.65rem 1rem",
          borderRadius: "0.5rem", // 8px — {rounded.md}, the input radius
          border: "1px solid #e5e5e5", // {colors.hairline}
          backgroundColor: "#ffffff",
        }}
```

(The green focus ring already comes from `math-field:focus-within` in globals.css via `--ring`, repointed in Task 1 — do not add a focus style here.)

- [ ] **Step 5: Build and visually verify**

Run: `npm run build`
Expected: `✓ Generating static pages (8/8)`

Visual: upload a `Test_images/` photo — dropzone is a soft-gray dashed panel that tints mint while dragging; confirm screen shows white 12px-radius cards, 8px-radius math fields with a mint focus ring when clicked.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx components/ImageUpload.tsx components/MathInput.tsx
git commit -m "redesign: upload and confirm screens — hairline cards, dropzone, math inputs"
```

---

### Task 7: Results screen — verdict, marked steps, misconception panel

**Files:**
- Modify: `app/page.tsx:383-578` (results screen JSX, classNames only — no logic, no data shapes)

**Interfaces:**
- Consumes: tokens (Task 1). `analysis`, `solved`, `confirmed`, `resultError`, `StepMark`, `MathView` — all unchanged.
- Produces: final surface; nothing downstream.

- [ ] **Step 1: Loading and error cards**

Replace the loading section wrapper:
```tsx
          <section className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center">
```
with:
```tsx
          <section className="flex flex-col items-center gap-4 rounded-lg border border-hairline bg-white p-8 text-center">
```
and inside it, the pulsing dots `bg-ink/40` with `bg-brand` (the one active-state accent on this screen), and the loading heading class `font-display text-lg font-semibold text-ink` with `font-display text-xl font-semibold tracking-tight text-ink`.

Replace the error section wrapper:
```tsx
          <section className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
```
with:
```tsx
          <section className="flex flex-col gap-2 rounded-lg border border-mark-error/40 bg-mark-error/5 p-6">
```
and its `text-destructive` heading with `text-mark-error`. The raw-output `<pre>` keeps `font-mono` but its classes become `mt-2 overflow-x-auto rounded-md bg-[#1c1c1e] p-4 font-mono text-xs text-white` (the Mintlify dark code-block surface).

- [ ] **Step 2: Solved-from-scratch section**

Replace the section wrapper:
```tsx
          <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
```
with:
```tsx
          <section className="flex flex-col gap-4 rounded-lg border border-hairline bg-white p-6">
```
Intro banner: `rounded-md border border-ink/20 bg-muted/40 p-4` → `rounded-md bg-surface p-5`; its heading gains `tracking-tight text-xl`.
Each step card: `rounded-md border border-border bg-muted/40 p-3 text-sm` → `rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm`; the inner LaTeX wrapper `rounded bg-muted px-2 py-1` → `rounded-md bg-white px-3 py-2 border border-hairline-soft`.
Final-answer box: `rounded-md border border-mark-correct/30 bg-mark-correct/10 p-3 text-sm` → `rounded-md border border-mark-correct/30 bg-mark-correct/5 p-4 text-sm`.

- [ ] **Step 3: Analysis (marked page) section**

Section wrapper: same swap as Step 2 (`border-hairline bg-white p-6`).

Verdict banner — replace:
```tsx
              className={`rounded-md p-4 font-display text-lg font-semibold ${
                analysis.isCorrect
                  ? "border border-mark-correct/30 bg-mark-correct/10 text-mark-correct"
                  : "border border-mark-error/30 bg-mark-error/10 text-mark-error"
              }`}
```
with:
```tsx
              className={`rounded-md p-5 font-display text-xl font-semibold tracking-tight ${
                analysis.isCorrect
                  ? "border border-mark-correct/30 bg-mark-correct/5 text-mark-correct"
                  : "border border-mark-error/30 bg-mark-error/5 text-mark-error"
              }`}
```

Step rows: `flex gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm` → `flex gap-3 rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm`; the rail divider `border-r border-border pr-3` → `border-r border-hairline pr-3`; the LaTeX wrapper `rounded bg-muted px-2 py-1 text-ink` → `rounded-md border border-hairline-soft bg-white px-3 py-2 text-ink`.

Misconception panel: `rounded-md border border-mark-flag/40 bg-mark-flag/10 p-4 text-sm` → `rounded-md border border-mark-flag/40 bg-mark-flag/5 p-5 text-sm`; its correct-continuation LaTeX wrapper `rounded bg-muted px-2 py-1` → `rounded-md border border-hairline-soft bg-white px-3 py-2`.

(The `StepMark` glyphs and their `delayMs={i * 120}` stagger are untouched.)

- [ ] **Step 4: Build and visually verify end-to-end**

Run: `npm run build`
Expected: `✓ Generating static pages (8/8)`

Visual: run the full flow with a `Test_images/` photo containing worked steps. Expected: white cards with hairline borders; ticks draw in staggered green `#1ba673`, crosses in `#d45656`; verdict banner in tinted correct/error surface; misconception panel amber-tinted; loading dots mint.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "redesign: results screen — verdict banner, marked steps, misconception panel"
```

---

### Task 8: Documentation — make the new system the recorded truth

**Files:**
- Replace: `DESIGN.md`
- Modify: `CLAUDE.md` (Design system section)

**Interfaces:**
- Consumes: everything above.
- Produces: docs future agents rely on; prevents the old "never use Inter / exam-paper palette" rules from fighting the new system.

- [ ] **Step 1: Replace `DESIGN.md`**

Replace the whole file with:

```markdown
# StepCheck — Design System (Mintlify)

The active design language is the Mintlify system. Canonical token
reference: `DESIGN-mintlify.md` (source: user-provided design analysis).
The previous "exam paper + red pen" system (Fraunces, paper/grid palette)
is retired — do not reintroduce it.

## Tokens in this codebase

Semantic Tailwind tokens (`tailwind.config.ts`), never raw hex in
components:

| Token | Value | Role |
|---|---|---|
| `paper` / `bg-white` | `#ffffff` | Canvas |
| `surface`, `surface-soft` | `#f7f7f7`, `#fafafa` | Section/card fills |
| `hairline`, `hairline-soft` | `#e5e5e5`, `#ededed` | Borders/dividers |
| `ink`, `ink-muted`, `charcoal` | `#0a0a0a`, `#5a5a5c`, `#1c1c1e` | Text |
| `brand`, `brand-deep`, `brand-soft` | `#00d4a4`, `#00b48a`, `#7cebcb` | Accent CTAs, focus ring, active states ONLY |
| `mark-correct` | `#1ba673` | Tick / correct step |
| `mark-error` | `#d45656` | Cross / incorrect step |
| `mark-flag` | `#c37d0d` | Low-confidence warning |
| `hero-from` → `hero-to` | `#87a8c8` → `#f5e9d8` | Landing hero gradient only |

## Rules

- Inter for all prose/headings (weights 400/500/600, tight tracking on
  headings); Geist Mono for code/LaTeX-source only. No third typeface,
  no italics.
- Every button is a pill (`rounded-full`). Cards are 12px
  (`rounded-lg`), inputs/code 8px (`rounded-md`) — nothing in between.
- `brand` mint never appears on body text or large fills.
- `mark-*` colors are reserved for grading semantics.
- Flat surfaces with hairline borders; the only deep shadow is the
  landing demo card (hero-product-mockup treatment). The only gradient
  is the landing hero band.
- Motion: `mark-in` (staggered tick/cross reveal, 120ms apart) and
  `screen-in` (screen transitions) are the only animations. Both respect
  `prefers-reduced-motion`.
```

- [ ] **Step 2: Update the Design system section of `CLAUDE.md`**

Replace the bullet list under `## Design system` with:

```markdown
See [DESIGN.md](DESIGN.md). The app uses the Mintlify design system:
white canvas, hairline borders, black pill buttons, mint-green accent.

- Colors are semantic tokens (`surface`, `hairline`, `ink`, `ink-muted`,
  `brand`, `mark-correct`, `mark-error`, `mark-flag`) defined in
  `tailwind.config.ts` / `app/globals.css` and used by name, never as raw
  hex or generic Tailwind palette colors (`text-blue-600`).
- Fonts: Inter for all UI prose and headings (`font-display` and
  `font-body` both resolve to it), Geist Mono (self-hosted in
  `app/fonts`) for code/raw LaTeX/JSON only. No third typeface.
- All buttons are pills (`rounded-full`); cards 12px, inputs 8px radius.
- `brand` mint is accent-only (CTAs, focus ring, active states);
  `mark-correct`/`mark-error`/`mark-flag` are reserved for grading
  semantics — don't repurpose either as generic UI colors.
```

- [ ] **Step 3: Copy the token source into the repo**

```bash
cp "/Users/adib/Downloads/DESIGN-mintlify.md" DESIGN-mintlify.md
```

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md DESIGN-mintlify.md CLAUDE.md
git commit -m "docs: record Mintlify design system as the active design language"
```

---

### Task 9: Full QA pass and ship

**Files:**
- None created; fixes only if QA finds regressions.

- [ ] **Step 1: Clean build**

Run: `rm -rf .next && npm run build`
Expected: `✓ Generating static pages (8/8)`, no lint/type errors.

- [ ] **Step 2: Functional regression pass (behavior, not looks)**

With `npm run dev` running, verify each unchanged behavior:
1. Landing → "Check my work" → upload screen; back button returns without losing state.
2. Upload a photo with worked steps from `Test_images/` → "Read photo" → confirm screen shows problem + editable steps.
3. Edit a step's LaTeX in the math field → Confirm → results show verdict banner + staggered ticks/crosses.
4. Upload a problem-only photo → confirm screen shows "no worked solution" copy → results show the solve-from-scratch walkthrough with **no** verdict banner and **no** StepMarks.
5. Kill the dev server mid-analyze (or use an invalid `GEMINI_API_KEY` temporarily) → error card appears with Retry; Retry re-runs without re-upload.

- [ ] **Step 3: Responsive + reduced-motion check**

- At 375px width: single column, pill nav wraps, hero card fits, math fields usable.
- With "Reduce motion" enabled in OS settings: screens appear without slide-in; app remains fully usable.

- [ ] **Step 4: Visual sweep for stragglers**

Run: `grep -rn "F7F8F4\|C9DAE3\|1E3A5F\|5B6B7A\|2F6B4F\|B23A2E\|C98A2C\|Fraunces\|IBM Plex" app components tailwind.config.ts`
Expected: no output (no old-palette hex or old fonts anywhere).

- [ ] **Step 5: Commit any QA fixes, then push**

```bash
git push
```

(Deployment to Vercel is a separate, user-approved step — do not run `vercel --prod` as part of this plan without explicit confirmation.)
