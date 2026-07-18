"use client";

// This component is only ever loaded client-side (via `next/dynamic` with
// `ssr: false` in app/page.tsx), so importing mathlive at module scope is
// safe and ensures the `<math-div>` custom element is registered before
// it's ever rendered or connected to the DOM. Importing "mathlive" (rather
// than just the static-elements submodule) also registers `MathfieldElement`
// and sets its fonts directory, matching MathInput.tsx — this keeps font
// resolution consistent across both the editable and read-only elements.
import { MathfieldElement } from "mathlive";

MathfieldElement.fontsDirectory = "/mathlive-fonts";

type MathDivProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-div": MathDivProps;
    }
  }
}

/**
 * Read-only rendering of a LaTeX string as proper math notation (fractions,
 * integrals, superscripts, etc.), for display contexts where MathInput's
 * editable `<math-field>` would be wrong — results screen step content,
 * final answers, and correct-continuation text. Uses MathLive's static
 * `<math-div>` element, which has no cursor, no virtual keyboard, and no
 * other editing affordance.
 */
export default function MathView({ latex }: { latex: string }) {
  return <math-div>{latex}</math-div>;
}
