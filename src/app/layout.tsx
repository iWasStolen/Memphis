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
    "Memphis unBLACKed — 2700+ games, 50 apps, Spotify, YouTube, unlimited GLM AI chat and a Scramjet web proxy.",
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
        {/* compat shim (SharedWorker polyfill + localStorage guard) — MUST run
            before every other script; blocking on purpose, it is tiny */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/sharedworker-shim.js" />
        {/* Scramjet proxy engine (page context) + bare-mux transport manager */}
        <script src="/scram/scramjet.all.js" defer />
        <script src="/baremux/index.js" defer />
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
