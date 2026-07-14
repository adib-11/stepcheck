# StepCheck test problem set

> **Status: documented test coverage, not yet run against real photos.**
> These problems are hand-authored LaTeX standing in for handwritten-photo
> transcripts. Phase 2's transcription tests used synthetic font-rendered
> images and phase 3's analysis tests used hand-typed LaTeX directly — this
> file documents intended coverage across HSC algebra/calculus topics and
> error types for the hackathon writeup, but none of it has been run
> through a real photographed-handwriting pipeline yet. Do not present
> these as results from actual photographed handwriting.

Each problem has a statement, a step-by-step solution transcript (standing
in for a confirmed transcription), and a verdict. For seeded-error cases,
the expected error step index (0-based, matching the analyze route's
`firstErrorStepIndex`) and the specific misconception are named — each
error is a plausible real student slip, not an arbitrary corruption of the
correct answer.

---

## 1. Linear equation — correct
**Problem:** `3x + 7 = 22`
1. `3x = 22 - 7`
2. `3x = 15`
3. `x = 5`

## 2. Linear equation — seeded error, step 0
**Problem:** `2x - 5 = 11`
**Misconception:** sign error moving a term across the equals sign.
1. `2x = 11 - 5` — should be `11 + 5`; the `-5` flips sign when moved.
2. `2x = 6`
3. `x = 3`

## 3. Simultaneous equations (elimination) — correct
**Problem:** `x + y = 10, \ x - y = 2`
1. `2x = 12`
2. `x = 6`
3. `y = 10 - 6`
4. `y = 4`

## 4. Simultaneous equations (substitution) — seeded error, step 2
**Problem:** `2x + y = 9, \ x + y = 5`
**Misconception:** sign error substituting back into the second equation.
1. `x = 9 - 5` — from subtracting the equations to eliminate `y`.
2. `x = 4`
3. `y = 5 + 4` — should be `5 - 4`; added instead of subtracting `x`.
4. `y = 9`

## 5. Quadratic factorisation — correct
**Problem:** `x^2 - 5x + 6 = 0`
1. `(x-2)(x-3) = 0`
2. `x = 2 \text{ or } x = 3`

## 6. Quadratic factorisation — seeded error, step 0
**Problem:** `x^2 + x - 6 = 0`
**Misconception:** chose a factor pair of `-6` with the wrong sign split
(product right, sum wrong).
1. `(x+2)(x-3) = 0` — factors multiply to `-6` but sum to `-1`, not the
   required `+1`; should be `(x+3)(x-2)`.
2. `x = -2 \text{ or } x = 3`

## 7. Quadratic formula — correct
**Problem:** `2x^2 + 3x - 2 = 0`
1. `x = \frac{-3 \pm \sqrt{9 - 4(2)(-2)}}{4}`
2. `x = \frac{-3 \pm \sqrt{25}}{4}`
3. `x = \frac{-3 \pm 5}{4}`
4. `x = \frac{1}{2} \text{ or } x = -2`

## 8. Quadratic formula — seeded error, step 1
**Problem:** `x^2 - 4x + 1 = 0`
**Misconception:** dropped the negative sign on the `-4ac` term of the
discriminant.
1. `x = \frac{4 \pm \sqrt{16 - 4(1)(1)}}{2}`
2. `x = \frac{4 \pm \sqrt{16 + 4}}{2}` — should be `16 - 4 = 12`, not `+4`.
3. `x = \frac{4 \pm \sqrt{20}}{2}`
4. `x = 2 \pm \sqrt{5}`

## 9. Index laws — correct
**Problem:** `\text{Simplify } \frac{x^5 \cdot x^{-2}}{x^4}`
1. `= \frac{x^{3}}{x^4}`
2. `= x^{-1}`
3. `= \frac{1}{x}`

## 10. Index laws — seeded error, step 0
**Problem:** `\text{Simplify } (2x^3)^2`
**Misconception:** applied the outer power to the variable only, forgot
to square the coefficient.
1. `= 2x^6` — should be `4x^6`; `2^2 = 4` was dropped.

## 11. Logarithms — correct
**Problem:** `\log_2(x) + \log_2(x-2) = 3`
1. `\log_2(x(x-2)) = 3`
2. `x(x-2) = 8`
3. `x^2 - 2x - 8 = 0`
4. `(x-4)(x+2) = 0`
5. `x = 4 \text{ (rejecting } x=-2 \text{, log undefined)}`

## 12. Logarithms — seeded error, step 1
**Problem:** `\log_3(2x) = 2`
**Misconception:** evaluated `3^2` by multiplying base and exponent
instead of exponentiating.
1. `2x = 3^2`
2. `2x = 6` — should be `9`; `3^2 = 9`, not `3 \times 2`.
3. `x = 3`

## 13. Differentiation, product rule — correct
**Problem:** `y = x^2 \sin(x), \ \text{find } \frac{dy}{dx}`
1. `\frac{dy}{dx} = 2x\sin(x) + x^2\cos(x)`

## 14. Differentiation, product rule — seeded error, step 0
**Problem:** `y = x^3 \cos(x), \ \text{find } \frac{dy}{dx}`
**Misconception:** sign error on the derivative of `\cos(x)`.
1. `\frac{dy}{dx} = 3x^2\cos(x) + x^3\sin(x)` — should be `-x^3\sin(x)`;
   the derivative of `\cos(x)` is `-\sin(x)`, not `+\sin(x)`.

## 15. Differentiation, chain rule — correct
**Problem:** `y = (3x+1)^4, \ \text{find } \frac{dy}{dx}`
1. `\frac{dy}{dx} = 4(3x+1)^3 \cdot 3`
2. `\frac{dy}{dx} = 12(3x+1)^3`

## 16. Differentiation, chain rule — seeded error, step 0
**Problem:** `y = (2x-5)^3, \ \text{find } \frac{dy}{dx}`
**Misconception:** dropped the inner derivative factor (classic
chain-rule omission).
1. `\frac{dy}{dx} = 3(2x-5)^2` — missing `\cdot 2` for the derivative of
   the inner term `2x-5`; should be `6(2x-5)^2`.

## 17. Integration, basic polynomial — correct
**Problem:** `\int (3x^2 + 4x) \, dx`
1. `= x^3 + 2x^2 + C`

## 18. Integration, basic polynomial — seeded error, step 0
**Problem:** `\int (4x^3 - 2x) \, dx`
**Misconception:** forgot the constant of integration.
1. `= x^4 - x^2` — antiderivative terms are correct but missing `+ C`.

## 19. Trigonometric equations — correct
**Problem:** `2\sin(x) = 1, \ 0 \le x \le 2\pi`
1. `\sin(x) = \frac{1}{2}`
2. `x = \frac{\pi}{6} \text{ or } x = \pi - \frac{\pi}{6}`
3. `x = \frac{\pi}{6} \text{ or } x = \frac{5\pi}{6}`

## 20. Trigonometric equations — seeded error, step 1
**Problem:** `2\cos(x) = -1, \ 0 \le x \le 2\pi`
**Misconception:** used the reference-angle quadrants for a positive
cosine instead of a negative one.
1. `\cos(x) = -\frac{1}{2}`
2. `x = \frac{\pi}{3} \text{ or } x = 2\pi - \frac{\pi}{3}` — these are
   the first/fourth-quadrant solutions for `\cos(x) = \frac{1}{2}`;
   since cosine is negative here, the solutions should be in the
   second/third quadrants: `\pi - \frac{\pi}{3}` and `\pi + \frac{\pi}{3}`.
3. `x = \frac{\pi}{3} \text{ or } x = \frac{5\pi}{3}`
