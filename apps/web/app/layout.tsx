import type { Metadata } from "next";
import { dmSans, dmMono } from "./fonts";
import { TRPCReactProvider } from "@/lib/trpc/client";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Throughline — From request to shipped",
  description:
    "Throughline carries a feature request from intake through PRD, tasks, code, AI review, and human approval — in one connected workflow.",
  openGraph: {
    title: "Throughline — From request to shipped",
    description:
      "Throughline carries a feature request from intake through PRD, tasks, code, AI review, and human approval — in one connected workflow.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmMono.variable} h-full antialiased`}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- DM Serif Display's italic axis isn't exposed via next/font/google */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <TRPCReactProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </TRPCReactProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
