"use client";

import { useEffect, useRef } from "react";
// This component is only ever loaded client-side (via `next/dynamic` with
// `ssr: false` in app/page.tsx), so importing mathlive at module scope is
// safe and ensures the <math-field> custom element and its font path are
// registered before the element is ever rendered or connected to the DOM.
import { MathfieldElement } from "mathlive";

// MathLive's default font path doesn't resolve under Next.js's webpack
// output. The font files are copied into /public/mathlive-fonts (see
// scripts/copy-mathlive-fonts.mjs, run on postinstall) and served from
// there instead.
MathfieldElement.fontsDirectory = "/mathlive-fonts";

// Register the <math-field> custom element and give TypeScript/JSX
// knowledge of its tag so it can be used like any other JSX element.
// `placeholder` is a mathfield-specific attribute, not part of the standard
// HTML attribute set, so it's added explicitly here.
type MathFieldProps = React.DetailedHTMLProps<
  React.HTMLAttributes<MathfieldElement>,
  MathfieldElement
> & { placeholder?: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-field": MathFieldProps;
    }
  }
}

interface MathInputProps {
  /** Called whenever the LaTeX value of the field changes. */
  onChange: (latex: string) => void;
  /** Optional initial LaTeX value. */
  defaultValue?: string;
  /** Optional placeholder shown when the field is empty. */
  placeholder?: string;
}

export default function MathInput({
  onChange,
  defaultValue = "",
  placeholder = "Type a math expression\u2026",
}: MathInputProps) {
  const mathFieldRef = useRef<MathfieldElement | null>(null);

  useEffect(() => {
    const mf = mathFieldRef.current;
    if (!mf) return;

    // Show the virtual keyboard whenever the field is focused, on both
    // touch and non-touch devices, and hide it again on blur.
    mf.mathVirtualKeyboardPolicy = "manual";

    const handleFocus = () => window.mathVirtualKeyboard?.show();
    const handleBlur = () => window.mathVirtualKeyboard?.hide();

    mf.addEventListener("focusin", handleFocus);
    mf.addEventListener("focusout", handleBlur);

    return () => {
      mf.removeEventListener("focusin", handleFocus);
      mf.removeEventListener("focusout", handleBlur);
    };
  }, []);

  return (
    <div className="w-full">
      <math-field
        ref={mathFieldRef as React.Ref<MathfieldElement>}
        onInput={(evt) => onChange((evt.target as MathfieldElement).value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          minHeight: "3.5rem",
          fontSize: "1.25rem",
          padding: "0.65rem 1rem",
          borderRadius: "0.5rem", // 8px — neobrutalist base radius
          border: "2px solid #001820", // {colors.ink} — raw hex: MathLive host style can't use Tailwind
          backgroundColor: "#ffffff",
        }}
      >
        {defaultValue}
      </math-field>
    </div>
  );
}
