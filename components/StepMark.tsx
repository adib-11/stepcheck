/**
 * The marking-rail tick/cross — StepCheck's signature visual (see
 * DESIGN.md §4). A single inline stroke, styled like a marker's pen mark
 * in the margin next to a step, not an icon-font glyph.
 *
 * `delayMs` drives the one orchestrated transition in the app: results
 * reveal top to bottom as if a marker's pen is moving down the page (see
 * DESIGN.md §5). No other component animates on load/hover.
 */
export default function StepMark({
  status,
  delayMs,
}: {
  status: "correct" | "incorrect" | "not_reached";
  delayMs: number;
}) {
  if (status === "not_reached") {
    return (
      <span
        aria-hidden
        className="block h-3 w-3 rounded-full border border-ink-muted/40"
      />
    );
  }

  const isCorrect = status === "correct";

  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-5 w-5 shrink-0 ${isCorrect ? "text-mark-correct" : "text-mark-error"}`}
      style={{
        animation: "mark-in 0.3s ease-out both",
        animationDelay: `${delayMs}ms`,
      }}
      aria-hidden
    >
      {isCorrect ? (
        <path
          d="M3 10.5 L8 15.5 L17 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <>
          <path
            d="M4 4 L16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
          <path
            d="M16 4 L4 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
