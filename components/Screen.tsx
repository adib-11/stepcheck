/**
 * Full-viewport screen wrapper. Every screen change in the app (landing ->
 * upload -> confirm -> results, and back) mounts through this component,
 * so there is exactly one transition pattern (slide + fade, `screen-in` in
 * globals.css) reused everywhere — no per-screen bespoke animation.
 *
 * `screenKey` should change whenever the visible screen changes; React
 * remounts the div on key change, which re-triggers the CSS animation.
 */
export default function Screen({
  screenKey,
  children,
}: {
  screenKey: string;
  children: React.ReactNode;
}) {
  return (
    <div key={screenKey} className="screen-transition flex min-h-screen w-full flex-col">
      {children}
    </div>
  );
}
