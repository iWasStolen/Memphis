"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function TextTools() {
  const [text, setText] = useState("");

  const stats = useMemo(() => {
    const chars = text.length;
    const noSpaces = text.replace(/\s/g, "").length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const sentences = text.trim()
      ? (text.match(/[.!?]+(\s|$)/g) ?? []).length || 1
      : 0;
    const paragraphs = text.trim()
      ? text.split(/\n\s*\n/).filter((p) => p.trim()).length
      : 0;
    const lines = text ? text.split("\n").length : 0;
    const readMins = Math.max(1, Math.round(words / 200));
    return { chars, noSpaces, words, sentences, paragraphs, lines, readMins };
  }, [text]);

  const transforms: { label: string; fn: (t: string) => string }[] = [
    { label: "UPPERCASE", fn: (t) => t.toUpperCase() },
    { label: "lowercase", fn: (t) => t.toLowerCase() },
    { label: "Title Case", fn: (t) => t.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()) },
    { label: "Sentence case", fn: (t) => t.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase()) },
    { label: "camelCase", fn: (t) => t.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase()) },
    { label: "snake_case", fn: (t) => t.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") },
    { label: "kebab-case", fn: (t) => t.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") },
    { label: "Reverse", fn: (t) => [...t].reverse().join("") },
    { label: "Trim lines", fn: (t) => t.split("\n").map((l) => l.trim()).join("\n") },
    { label: "Remove blank lines", fn: (t) => t.split("\n").filter((l) => l.trim()).join("\n") },
    { label: "Sort lines", fn: (t) => t.split("\n").sort((a, b) => a.localeCompare(b)).join("\n") },
    { label: "Dedupe lines", fn: (t) => [...new Set(t.split("\n"))].join("\n") },
  ];

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-4">
        {(
          [
            ["words", stats.words],
            ["chars", stats.chars],
            ["no spaces", stats.noSpaces],
            ["sentences", stats.sentences],
            ["paragraphs", stats.paragraphs],
            ["lines", stats.lines],
            ["read time", `${stats.readMins}m`],
          ] as const
        ).map(([label, val]) => (
          <div
            key={label}
            className="rounded-lg border border-[#1a1a1a] bg-[#080808] p-2.5 text-center"
          >
            <div className="font-mono text-lg text-white tabular-nums">{val}</div>
            <div className="text-[9px] text-[#666] uppercase tracking-wider mt-0.5">
              {label}
            </div>
          </div>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste or type text here…"
        aria-label="Text input"
        className="w-full min-h-[40vh] rounded-lg border border-[#1f1f1f] bg-[#050505] p-4 text-sm text-[#d4d4d4] leading-relaxed outline-none focus:border-[#333] resize-none"
      />
      <div className="flex flex-wrap gap-1.5 mt-3">
        {transforms.map((t) => (
          <button
            key={t.label}
            onClick={() => setText(t.fn(text))}
            className="px-2.5 py-1 rounded-md text-[11px] border border-[#262626] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a] transition-colors disabled:opacity-40"
            disabled={!text}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="border-[#262626] text-[#9a9a9a] hover:text-white"
          disabled={!text}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast.success("Copied to clipboard");
            } catch {
              toast.error("Clipboard unavailable");
            }
          }}
        >
          <Copy className="size-3.5 mr-1.5" /> Copy
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-[#262626] text-[#9a9a9a] hover:text-white"
          disabled={!text}
          onClick={() => setText("")}
        >
          <Trash2 className="size-3.5 mr-1.5" /> Clear
        </Button>
      </div>
    </div>
  );
}
