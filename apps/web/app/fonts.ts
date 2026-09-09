import { DM_Sans, DM_Mono } from "next/font/google";

export const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

// DM Serif Display's italic axis isn't reliably exposed via next/font/google;
// it's loaded via a <link> tag in app/layout.tsx instead.
