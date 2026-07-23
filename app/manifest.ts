import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StepCheck",
    short_name: "StepCheck",
    description: "Photograph your working and get a tick or a cross on every step.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    // ponytail: single SVG icon — add PNG sizes only if an install prompt
    // audit on a real device demands them.
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
