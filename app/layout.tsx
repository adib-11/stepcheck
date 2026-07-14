import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Kept: Geist Mono is still used for raw LaTeX/JSON debug output.
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Display face: stage headings and the correct/incorrect verdict.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600"],
});

// Body face: everything else — labels, buttons, feedback text.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-body",
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
      <body
        className={`${fraunces.variable} ${plexSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
