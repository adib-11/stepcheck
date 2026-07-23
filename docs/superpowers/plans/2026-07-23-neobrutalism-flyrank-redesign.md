# Neobrutalism × FlyRank Palette UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle StepCheck from the Mintlify design system to a neobrutalist system (thick ink borders, hard offset shadows, boxy buttons, flat fills) using FlyRank's palette (mint `#50E098`, dark-teal ink `#001820`, whitesmoke canvas), adopting design.md motion, light mode only, with **zero functional changes**.

**Architecture:** The codebase is fully tokenized (semantic Tailwind tokens, shadcn CSS variables, no raw hex in components except MathInput's inline style), so the recolor is a value swap in `tailwind.config.ts` + `app/globals.css`. The geometry change (borders/shadows/radii) is a rewrite of `components/ui/button.tsx` plus enumerated className edits at known line sites. No file in `lib/` or `app/api/` is touched.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, class-variance-authority, MathLive. No new dependencies.

## Global Constraints

- **UI/UX only.** Never touch `lib/`, `app/api/`, state logic, handlers, props, or JSX structure beyond classNames and the few explicitly-listed element additions/removals. If a step seems to require logic changes, stop — the plan is wrong.
- **Light mode only.** No `dark:` variants, no dark-mode CSS vars.
- **Palette (FlyRank):** brand mint `#50E098`, brand-deep `#2FBF7B`, brand-soft `#A9EFCB`, ink `#001820`, ink-muted `#425153`, charcoal `#0C1B1B`, surface `#F8F8F8`, surface-soft `#FCFCFC`. Red (chosen): `#E5484D` (warm, ~75% saturation — under design.md's 80% cap, harmonizes with mint + dark teal). `mark-correct #1ba673` and `mark-flag #c37d0d` stay as-is (already fit).
- **Neobrutalist geometry:** outer cards/sections/buttons/inputs get `border-2 border-ink` + hard offset shadow (no blur). Inner sub-boxes keep 1px `hairline` borders so the design doesn't scream. No gradients anywhere. No pure `#000` (ink `#001820` is the off-black, per design.md's own rule).
- **Radius:** base 8px. `--radius: 0.5rem` → `rounded-lg` = 8px (cards/buttons), `rounded-md` = 4px (inner boxes). Buttons are **boxy** (`rounded-lg`), not pills. Tiny *non-interactive* status badges may stay `rounded-full` (FlyRank uses pill badges).
- **Motion (from design.md, replacing the old "two animations only" lock):** entry = fade + translateY(16px → 0), 420ms ease-out; list cascades stagger 80ms; hover = color/shadow shift over 200ms; button active = tactile press translate. Only `transform` and `opacity` (and color) animate. `prefers-reduced-motion` disables entry animations. The `mark-in` StepMark stagger (120ms) is kept untouched — it is still the signature moment.
- **Semantic token names are kept** (`ink`, `brand`, `mark-*`, `surface`, `hairline`) so components recolor in place — only values and component classes change.
- There is no automated test runner. Per-task check = `npm run lint` + a targeted `grep` assertion. Final task = production build + full visual walkthrough in the browser.
- Commit after every task. Message prefix `style:`.

---

### Task 1: Retoken — FlyRank palette values + radius + brutal shadows

**Files:**
- Modify: `tailwind.config.ts:17-48` (colors) and add a `boxShadow` block
- Modify: `app/globals.css:21-47` (CSS variables)

**Interfaces:**
- Produces: Tailwind utilities `shadow-brut`, `shadow-brut-sm`, `shadow-brut-brand` and the recolored `ink`/`brand`/`mark-error` tokens that every later task uses. `--radius: 0.5rem` makes existing `rounded-lg`/`rounded-md` classes resolve to 8px/4px with no component edits.
- Consumes: nothing.

- [ ] **Step 1: Update color values and add shadows in `tailwind.config.ts`**

Replace lines 17–48 (the `colors` entries from the `// Mintlify system` comment through `hero`) with the following, and add the `boxShadow` key as a sibling of `colors` inside `extend`. Keep the shadcn `background`/`foreground`/`card`/… entries and `borderRadius` exactly as they are. The `hero` token stays for now (LandingHero still references it; Task 4 deletes both together).

```ts
  		colors: {
  			// Neobrutalism × FlyRank palette (see DESIGN.md). Token names kept
  			// from the previous system so existing classes recolor in place.
  			paper: '#ffffff',            // card fill
  			surface: {
  				DEFAULT: '#f8f8f8',        // FlyRank whitesmoke canvas
  				soft: '#fcfcfc',
  			},
  			hairline: {
  				DEFAULT: '#e5e5e5',        // inner dividers ONLY — outer borders are ink
  				soft: '#ededed',
  			},
  			charcoal: '#0c1b1b',         // hover state for ink-filled buttons
  			ink: {
  				DEFAULT: '#001820',        // FlyRank dark teal — text, borders, shadows
  				muted: '#425153',          // FlyRank slate
  			},
  			brand: {
  				DEFAULT: '#50e098',        // FlyRank mint — primary accent
  				deep: '#2fbf7b',           // hover darken
  				soft: '#a9efcb',           // tints/washes
  			},
  			mark: {
  				correct: '#1ba673',        // tick — unchanged, already mint-family
  				error: '#e5484d',          // cross — warm red, fits mint + dark teal
  				flag: '#c37d0d',           // low-confidence flag — unchanged
  			},
  			hero: {
  				from: '#87a8c8',           // dead after Task 4 — deleted there
  				to: '#f5e9d8',
  			},
```

```ts
  		boxShadow: {
  			// Neobrutalist hard offset shadows — no blur, ink or mint, never #000
  			brut: '4px 4px 0 0 #001820',
  			'brut-sm': '2px 2px 0 0 #001820',
  			'brut-brand': '6px 6px 0 0 #50e098',
  		},
```

- [ ] **Step 2: Update CSS variables in `app/globals.css`**

Replace the `:root` block (lines 21–47) with:

```css
  :root {
    --background: 0 0% 100%; /* card/canvas white */
    --foreground: 196 100% 6%; /* ink #001820 */
    --card: 0 0% 100%;
    --card-foreground: 196 100% 6%;
    --popover: 0 0% 100%;
    --popover-foreground: 196 100% 6%;
    --primary: 196 100% 6%; /* ink-filled CTA */
    --primary-foreground: 0 0% 100%;
    --secondary: 0 0% 97%; /* surface #f8f8f8 */
    --secondary-foreground: 196 100% 6%;
    --muted: 0 0% 97%;
    --muted-foreground: 187 11% 29%; /* slate #425153 */
    --accent: 150 70% 60%; /* brand mint #50e098 */
    --accent-foreground: 196 100% 6%;
    --destructive: 358 75% 59%; /* red #e5484d */
    --destructive-foreground: 0 0% 100%;
    --border: 0 0% 90%; /* hairline — inner dividers only */
    --input: 196 100% 6%; /* inputs carry ink borders */
    --ring: 150 70% 60%; /* focus ring = brand mint */
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
    --radius: 0.5rem; /* 8px — neobrutalist base radius (rounded-lg) */
  }
```

Also update the comment block above it (lines 14–20): replace the Mintlify description with "Neobrutalism × FlyRank token system (see DESIGN.md). shadcn variable names kept so Tailwind classes work unchanged; values point at the FlyRank palette: white cards on whitesmoke canvas, dark-teal ink, mint accent, hard offset shadows."

- [ ] **Step 3: Verify**

Run: `npm run lint`
Expected: no errors (warnings pre-existing are fine).

Run: `grep -c '001820' tailwind.config.ts app/globals.css`
Expected: `tailwind.config.ts:3` (ink + two shadows) — globals.css matches 0 (it uses HSL); instead `grep -c '196 100% 6%' app/globals.css` → `7`.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css
git commit -m "style: retoken to FlyRank palette with neobrutalist shadows and 8px radius"
```

---

### Task 2: Motion foundation — design.md entry/cascade timing

**Files:**
- Modify: `app/globals.css:88-110` (the `screen-in` block and reduced-motion block)

**Interfaces:**
- Produces: retimed `.screen-transition` (420ms, 16px) reused as the cascade animation via inline `animationDelay` in Tasks 5–6. No new class names.
- Consumes: nothing.

- [ ] **Step 1: Retime `screen-in` and update the motion-policy comments**

Replace lines 88–110 (the screen-in comment, keyframes, `.screen-transition`, and the reduced-motion block) with:

```css
/* Entry motion (design.md): fade + translate-Y 16px → 0 over 420ms
   ease-out. Used for screen mounts AND, via inline animationDelay in
   80ms increments, for staggered list cascades (results steps, history
   entries). Only transform/opacity animate. */
@keyframes screen-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.screen-transition {
  animation: screen-in 0.42s ease-out both;
}

@media (prefers-reduced-motion: reduce) {
  .screen-transition {
    animation: none;
  }
}
```

Also update the `mark-in` comment above line 77: change "This is the single orchestrated transition in the app; no other hover/load animation is added anywhere else." to "This is the signature transition; general entry/hover motion follows the design.md rules in DESIGN.md §5."

- [ ] **Step 2: Verify**

Run: `grep -n '0.42s\|translateY(16px)' app/globals.css`
Expected: both matched.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: adopt design.md entry motion timing (420ms, 16px, 80ms cascades)"
```

---

### Task 3: Button — boxy, bordered, hard-shadowed, tactile press

**Files:**
- Modify: `components/ui/button.tsx:7-34`

**Interfaces:**
- Consumes: `shadow-brut`/`shadow-brut-sm` utilities and recolored tokens from Task 1.
- Produces: same exported API (`Button`, `buttonVariants`, identical variant/size names) — **no call site changes needed anywhere**.

- [ ] **Step 1: Replace the cva block**

Replace lines 7–34 with:

```ts
// Neobrutalist buttons: boxy 8px radius, 2px ink border, hard offset
// shadow. Hover lifts (shadow grows), active presses into the page
// (translate toward the shadow, shadow collapses) — design.md's
// "tactile press". Ghost/link stay flat: no border, no shadow.
const brutal =
  "border-2 border-ink shadow-brut-sm hover:-translate-y-0.5 hover:shadow-brut active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[transform,box-shadow,background-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: `${brutal} bg-ink text-white hover:bg-charcoal`,
        accent: `${brutal} bg-brand text-ink hover:bg-brand-deep`,
        destructive: `${brutal} bg-mark-error text-white hover:bg-mark-error/90`,
        outline: `${brutal} bg-white text-ink hover:bg-surface`,
        secondary: `${brutal} bg-surface text-ink hover:bg-hairline-soft`,
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

(Everything below line 34 — the `ButtonProps` interface and `Button` component — is untouched.)

- [ ] **Step 2: Verify**

Run: `npm run lint`
Expected: pass.

Run: `grep -c 'rounded-full' components/ui/button.tsx`
Expected: `0`.

- [ ] **Step 3: Commit**

```bash
git add components/ui/button.tsx
git commit -m "style: neobrutalist button variants — boxy, ink border, hard shadow, press"
```

---

### Task 4: LandingHero — flat canvas, kicker pill, mint-shadow demo card

**Files:**
- Modify: `components/LandingHero.tsx:34-77`
- Modify: `tailwind.config.ts` (delete the `hero` token block added back in Task 1)

**Interfaces:**
- Consumes: `shadow-brut-brand`, `brand-soft`, retokened `ink` from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Remove the gradient band, add a FlyRank-style kicker pill, brutalize the demo card**

In `components/LandingHero.tsx`, replace lines 35–71 (from `<main` through the demo-card closing `</div>`) with:

```tsx
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface px-4 py-16 text-center sm:px-6">
      <div className="flex w-full max-w-2xl flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-4">
          {/* Kicker pill, FlyRank hero-style: mint-washed, ink outline. */}
          <span className="rounded-full border-2 border-ink bg-brand-soft/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink">
            Step-by-step marking
          </span>
          <h1 className="font-display text-5xl font-bold tracking-[-0.02em] text-ink sm:text-6xl">
            StepCheck
          </h1>
          <p className="max-w-md text-balance text-lg text-ink-muted">
            Line by line, like a marker would. Photograph your working and
            get a tick or a cross on every step, not just a final grade.
          </p>
        </div>

        {/* Demo card as the neobrutalist hero object: white card, 2px ink
            border, hard mint offset shadow (FlyRank's highlighted-card
            treatment). */}
        <div
          className="flex w-full max-w-sm flex-col gap-3 rounded-lg border-2 border-ink bg-white p-6 text-left shadow-brut-brand"
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
```

(The trailing CTA `<div className="flex items-center gap-3">…` block and closing tags stay as they are.)

- [ ] **Step 2: Delete the `hero` token from `tailwind.config.ts`**

Remove the four lines:

```ts
  			hero: {
  				from: '#87a8c8',           // dead after Task 4 — deleted there
  				to: '#f5e9d8',
  			},
```

- [ ] **Step 3: Verify**

Run: `grep -rn 'hero-from\|hero-to\|bg-gradient' app components`
Expected: no matches.

Run: `npm run lint` → pass.

- [ ] **Step 4: Commit**

```bash
git add components/LandingHero.tsx tailwind.config.ts
git commit -m "style: neobrutalist landing hero — flat canvas, kicker pill, mint offset shadow"
```

---

### Task 5: page.tsx sweep — cards, chips, inputs, cascade

**Files:**
- Modify: `app/page.tsx` (className-only edits at the exact sites below; line numbers are pre-edit)

**Interfaces:**
- Consumes: `shadow-brut`, `.screen-transition` cascade pattern, retokened colors.
- Produces: nothing downstream.

Every edit below is a find-and-replace of the exact quoted className string. JSX structure, handlers, and content are untouched (except Step 3, which adds one style prop).

- [ ] **Step 1: Outer section cards → brutal cards**

At lines 639, 691, 811, 897, 942, 987, 1171 replace, in each className, the fragment:

`border border-hairline bg-white` → `border-2 border-ink bg-white shadow-brut`

(7 sites. Line 811's and 1171's classNames have extra utilities around the fragment — replace only the fragment.)

At line 861 (error card) replace:

`border border-mark-error/40 bg-mark-error/5` → `border-2 border-mark-error bg-mark-error/5 shadow-brut`

At line 1031 (misconception card) replace:

`border border-mark-flag/40 bg-mark-flag/5` → `border-2 border-mark-flag bg-mark-flag/5`

- [ ] **Step 2: Back button and stage chips → boxy**

Line 574 (back button), replace the full className with:

`"flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink bg-white text-ink shadow-brut-sm transition-[transform,box-shadow,background-color] duration-200 ease-out hover:bg-surface active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"`

Lines 606–607 (progress stage chips — non-interactive, but they're the segmented progress control, so boxy):

`"rounded-full bg-ink px-3 py-1 text-xs font-medium text-white"` → `"rounded-lg border-2 border-ink bg-ink px-3 py-1 text-xs font-semibold text-white"`

`"rounded-full border border-hairline bg-white px-3 py-1 text-xs font-medium text-ink-muted"` → `"rounded-lg border-2 border-ink bg-white px-3 py-1 text-xs font-semibold text-ink-muted"`

Line 694 ("no worked solution" badge — non-interactive status badge, stays a pill, gets the mint wash):

`"mb-2 inline-block rounded-full border border-hairline bg-white px-3 py-1 text-xs font-medium text-ink-muted"` → `"mb-2 inline-block rounded-full border-2 border-ink bg-brand-soft/40 px-3 py-1 text-xs font-semibold text-ink"`

(Line 816's `rounded-full bg-brand` dot is decorative — leave it.)

- [ ] **Step 3: Results steps → 80ms cascade**

At lines 1008–1011 (the step card inside `confirmed.steps.map`), change:

```tsx
                  <div
                    key={i}
                    className="flex gap-3 rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm"
                  >
```

to:

```tsx
                  <div
                    key={i}
                    className="screen-transition flex gap-3 rounded-md border border-hairline-soft bg-surface-soft p-4 text-sm"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
```

(StepMark's own `delayMs={i * 120}` at line 1013 stays — the pen-mark stagger remains the signature.)

- [ ] **Step 4: Free-text inputs → ink borders**

Lines 1090 and 1205, in each className replace:

`rounded-md border border-hairline bg-white` → `rounded-md border-2 border-ink bg-white`

and append ` focus-visible:ring-offset-2` to the className at line 1205 (1090 check: if it lacks the offset, append there too).

- [ ] **Step 5: Verify**

Run: `grep -c 'border border-hairline bg-white' app/page.tsx`
Expected: `0`.

Run: `grep -c 'shadow-brut' app/page.tsx`
Expected: `9` (8 cards + back button).

Run: `npm run lint` → pass.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "style: neobrutalist main-flow sweep — brutal cards, boxy chips, step cascade"
```

---

### Task 6: Component + teacher-page sweep

**Files:**
- Modify: `components/ImageUpload.tsx:109-110,137`
- Modify: `components/HistoryList.tsx:45,55`
- Modify: `components/MathInput.tsx:76-84`
- Modify: `app/teacher/page.tsx:129,139,150,175`

**Interfaces:**
- Consumes: Task 1 tokens/shadows.
- Produces: nothing downstream.

- [ ] **Step 1: ImageUpload**

Line 109–111 dropzone — replace `rounded-lg border border-dashed` with `rounded-lg border-2 border-dashed` and the state fragment:

`isDragging ? "border-brand bg-brand/5" : "border-hairline bg-surface-soft"` → `isDragging ? "border-brand bg-brand/5" : "border-ink bg-surface-soft"`

Line 137 mobile camera button — replace the full className with:

`"mt-2 w-full rounded-lg border-2 border-ink bg-white px-4 py-2 text-sm font-semibold text-ink shadow-brut-sm transition-[transform,box-shadow,background-color] duration-200 ease-out hover:bg-surface active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:hidden"`

- [ ] **Step 2: HistoryList**

Line 45 (pattern-spotted box): `border border-mark-flag/40` → `border-2 border-mark-flag`

Line 55 (entry card): `"rounded-lg border border-hairline bg-white p-4 text-sm"` → `"screen-transition rounded-lg border-2 border-ink bg-white p-4 text-sm shadow-brut"` and add to the same `<div>`: `style={{ animationDelay: \`${index * 80}ms\` }}` — change the map callback from `(entry) =>` to `(entry, index) =>`.

- [ ] **Step 3: MathInput inline style**

Lines 81–82, replace:

```ts
          borderRadius: "0.5rem", // 8px — {rounded.md}, the input radius
          border: "1px solid #e5e5e5", // {colors.hairline}
```

with:

```ts
          borderRadius: "0.5rem", // 8px — neobrutalist base radius
          border: "2px solid #001820", // {colors.ink} — raw hex: MathLive host style can't use Tailwind
```

- [ ] **Step 4: Teacher page**

Lines 129, 150, 175: replace `border border-hairline bg-white` → `border-2 border-ink bg-white shadow-brut` in each className.

Line 139 (file-input button styling): replace `file:rounded-full file:border file:border-hairline` → `file:rounded-lg file:border-2 file:border-ink` and `file:font-medium` → `file:font-semibold`.

- [ ] **Step 5: Verify**

Run: `grep -rn 'border border-hairline bg-white\|rounded-full border border-hairline' components app/teacher`
Expected: no matches.

Run: `npm run lint` → pass.

- [ ] **Step 6: Commit**

```bash
git add components/ImageUpload.tsx components/HistoryList.tsx components/MathInput.tsx app/teacher/page.tsx
git commit -m "style: neobrutalist sweep — upload, history, math input, teacher page"
```

---

### Task 7: Rewrite design docs so future sessions defend the new system

**Files:**
- Modify: `DESIGN.md` (full rewrite)
- Modify: `CLAUDE.md` (the "Design system" section and the `StepMark` paragraph's animation sentence)

**Interfaces:** none — documentation.

- [ ] **Step 1: Replace `DESIGN.md` contents with:**

```markdown
# StepCheck — Design System (Neobrutalism × FlyRank)

The active design language is neobrutalism (thick ink borders, hard
offset shadows, flat fills, boxy buttons — no gradients, no blurs)
executed in the FlyRank palette (mint accent, dark-teal ink, whitesmoke
canvas). The previous Mintlify system (pills, hairline-only borders,
hero gradient) is retired — do not reintroduce it.

## Tokens (`tailwind.config.ts`) — never raw hex in components

| Token | Value | Role |
|---|---|---|
| `bg-white` / `paper` | `#ffffff` | Card fill |
| `surface`, `surface-soft` | `#f8f8f8`, `#fcfcfc` | Page canvas / inner boxes |
| `hairline`, `hairline-soft` | `#e5e5e5`, `#ededed` | INNER dividers only — never outer borders |
| `ink`, `ink-muted`, `charcoal` | `#001820`, `#425153`, `#0c1b1b` | Text, outer borders, shadows / muted text / hover fill |
| `brand`, `brand-deep`, `brand-soft` | `#50e098`, `#2fbf7b`, `#a9efcb` | Mint accent: CTAs, focus ring, kicker washes, hero shadow |
| `mark-correct` | `#1ba673` | Tick / correct step |
| `mark-error` | `#e5484d` | Cross / incorrect step; the app's one red |
| `mark-flag` | `#c37d0d` | Low-confidence warning |
| `shadow-brut`, `shadow-brut-sm` | `4px 4px 0 #001820`, `2px 2px 0` | Hard offset shadows — cards / buttons |
| `shadow-brut-brand` | `6px 6px 0 #50e098` | Mint shadow — landing hero card only |

## Rules

1. Outer cards, sections, buttons, and inputs: `border-2 border-ink`
   plus a `shadow-brut*`. Inner sub-boxes keep 1px hairline borders.
   Never pure `#000` — ink `#001820` is the off-black.
2. Buttons are boxy (`rounded-lg`, 8px), `font-semibold`, bordered and
   hard-shadowed. Hover lifts (shadow grows); active presses
   (translate 2px toward the shadow, shadow collapses). Ghost/link are
   flat. Only tiny non-interactive status badges may be `rounded-full`.
3. Radius scale: 8px (`rounded-lg`) cards/buttons/inputs, 4px
   (`rounded-md`) inner boxes. Nothing else.
4. No gradients, no blurred shadows, no dark mode (light only for now).
5. `brand` mint is accent-only; `mark-*` colors are reserved for
   grading semantics; `mark-error` is the only red.
6. Inter for all prose/headings (400/500/600/700); Geist Mono for
   code/raw LaTeX only. No third typeface.

## Motion (§5)

- Entry: fade + translateY(16px → 0), 420ms ease-out
  (`.screen-transition`); lists cascade with 80ms inline
  `animationDelay` increments (results steps, history entries).
- Hover: color/shadow shift over 200ms. Buttons press on active.
- Signature: StepMark `mark-in` tick/cross reveal, staggered 120ms —
  keep it the loudest motion on the page.
- Only `transform`, `opacity`, and colors animate.
  `prefers-reduced-motion` disables entry animation.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Replace the "## Design system" section body with:

```markdown
See [DESIGN.md](DESIGN.md). The app uses a neobrutalist system in the
FlyRank palette: white cards on whitesmoke canvas, 2px dark-teal ink
borders (`#001820` — never pure black), hard offset shadows
(`shadow-brut*`, no blur), boxy `rounded-lg` buttons, mint-green accent.

- Colors are semantic tokens (`surface`, `hairline`, `ink`, `ink-muted`,
  `brand`, `mark-correct`, `mark-error`, `mark-flag`) defined in
  `tailwind.config.ts` / `app/globals.css` and used by name, never as raw
  hex or generic Tailwind palette colors (`text-blue-600`).
- Fonts: Inter for all UI prose and headings (`font-display` and
  `font-body` both resolve to it), Geist Mono (self-hosted in
  `app/fonts`) for code/raw LaTeX/JSON only. No third typeface.
- Buttons are boxy (`rounded-lg`) with `border-2 border-ink` and a hard
  offset shadow; cards 8px radius + `shadow-brut`; inner boxes 4px with
  hairline borders. No gradients. Light mode only.
- `brand` mint is accent-only (CTAs, focus ring, kicker washes);
  `mark-correct`/`mark-error`/`mark-flag` are reserved for grading
  semantics — don't repurpose either as generic UI colors. `mark-error`
  is the app's only red.
- Motion follows DESIGN.md §5: 420ms entry fade/translate, 80ms list
  cascades, 200ms hover shifts, tactile button press.
```

In the `StepMark` paragraph of CLAUDE.md, replace "— the one deliberate animation in the app (see DESIGN.md §5). Don't add hover/load/scroll animation elsewhere; it's an explicit design constraint, not an oversight." with "— the signature animation. General motion (entry, cascades, hover, button press) follows DESIGN.md §5; don't add motion outside those patterns."

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md CLAUDE.md
git commit -m "docs: rewrite design system docs for neobrutalism × FlyRank"
```

---

### Task 8: Full verification — build + visual walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: compiles with no errors.

- [ ] **Step 2: Visual walkthrough in the browser**

Start the dev server (`npm run dev` via the launch config / preview tooling, not a raw shell if an in-app browser is available) and check each screen at desktop and 375px mobile width:

1. **Landing:** flat whitesmoke canvas (no gradient), kicker pill, demo card with 2px ink border + mint offset shadow, ticks/crosses still replay, "Check my work" is a boxy mint button that lifts on hover and presses on click. History cards (if any localStorage entries) cascade in.
2. **Upload:** section card has ink border + hard shadow; dropzone dashed ink border; buttons boxy.
3. **Confirm:** MathLive fields show 2px ink borders; mint focus ring; editing still works (type into a field, value updates).
4. **Results:** step cards cascade in at 80ms; ticks/crosses stagger at 120ms after; error/misconception boxes have solid semantic borders; "Fix it and re-check" input works.
5. **Teacher (`/teacher`):** cards brutalized, file button boxy; upload flow unaffected.
6. Reduced motion: with `prefers-reduced-motion`, screens/lists appear without animation.
7. Console: no new errors.

Fix anything broken by returning to the offending task's file; classNames only.

- [ ] **Step 3: Final commit (if fixes were made) and push**

```bash
git push origin main
```

Vercel deploys `main` automatically — confirm the deployment succeeds.
