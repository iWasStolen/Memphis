import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Memphis unBLACKed",
  description:
    "Memphis unBLACKed — 74 popular games, 50 apps, Spotify, YouTube, unlimited GLM AI chat and a Scramjet web proxy.",
  icons: {
    icon: "/memphis.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        {/* compat shim (localStorage guard — keeps settings persistence
            alive on storage-blocked browsers) — blocking on purpose,
            it is tiny. No SharedWorker polyfill needed anymore: the
            Scramjet v2 transports run in the page, not a worker. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/sharedworker-shim.js" />
        {/* Scramjet v2 engine files are ALL injected dynamically by
            bootProxy() (post-hydration — the v1 bundle deleted its own
            <script> tag and broke React hydration). These hints keep
            the bundles warm so proxy boot stays fast:
            core → controller API → utils → wasm (fetched in wait()) →
            epoxy transport module (the default). */}
        <link rel="preload" as="script" href="/scram2/scramjet.js" />
        <link rel="preload" as="script" href="/controller/controller.api.js" />
        <link rel="preload" as="script" href="/utils/scramjet-utils.js" />
        <link rel="preload" as="fetch" href="/scram2/scramjet.wasm" />
        <link rel="modulepreload" href="/epoxy/index.mjs" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
