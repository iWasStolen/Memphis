"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Trash2 } from "lucide-react";

const STARTER = `// Memphis code sandbox — runs in your browser
const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
console.log("fib(10) =", fib(10));

const words = ["memphis", "unblacked", "study", "portal"];
console.log("lengths:", words.map((w) => w.length));

console.warn("warnings work too");
return "return values are printed";
`;

export default function CodeSandbox() {
  const [code, setCode] = useState(STARTER);
  const [output, setOutput] = useState<
    { kind: "log" | "warn" | "error" | "return"; text: string }[]
  >([]);

  const run = () => {
    const lines: { kind: "log" | "warn" | "error" | "return"; text: string }[] = [];
    const fmt = (v: unknown): string => {
      if (typeof v === "string") return v;
      try {
        return JSON.stringify(v, null, 2) ?? String(v);
      } catch {
        return String(v);
      }
    };
    const shim = (kind: "log" | "warn" | "error") =>
      (...args: unknown[]) => lines.push({ kind, text: args.map(fmt).join(" ") });
    try {
      const fn = new Function("console", `"use strict";\n${code}`);
      const result = fn({ log: shim("log"), warn: shim("warn"), error: shim("error") });
      if (result !== undefined) lines.push({ kind: "return", text: fmt(result) });
    } catch (err) {
      lines.push({ kind: "error", text: String(err) });
    }
    setOutput(lines);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 grid lg:grid-cols-2 gap-4 min-h-[70vh]">
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="mono-label">javascript</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-[#262626] text-[#9a9a9a] hover:text-white"
              onClick={() => {
                setOutput([]);
                setCode("");
              }}
            >
              <Trash2 className="size-3.5 mr-1.5" /> Clear
            </Button>
            <Button
              size="sm"
              className="bg-white text-black hover:bg-[#e0e0e0]"
              onClick={run}
            >
              <Play className="size-3.5 mr-1.5" /> Run
            </Button>
          </div>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          aria-label="JavaScript source"
          className="flex-1 min-h-[55vh] rounded-lg border border-[#1f1f1f] bg-[#050505] p-4 font-mono text-[13px] text-[#d4d4d4] leading-relaxed outline-none focus:border-[#333] resize-none"
        />
      </div>
      <div className="flex flex-col">
        <div className="mono-label mb-2">console</div>
        <div
          className="flex-1 min-h-[55vh] rounded-lg border border-[#1f1f1f] bg-[#050505] p-4 overflow-y-auto font-mono text-[12px] space-y-2"
          aria-live="polite"
          aria-label="Console output"
        >
          {output.length === 0 ? (
            <p className="text-[#555]">Press Run to execute. Output appears here.</p>
          ) : (
            output.map((l, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap break-all ${
                  l.kind === "error"
                    ? "text-[#c9c9c9] border-l-2 border-[#4a4a4a] pl-2"
                    : l.kind === "warn"
                      ? "text-[#a8a8a8] border-l-2 border-[#333] pl-2"
                      : l.kind === "return"
                        ? "text-white border-l-2 border-white pl-2"
                        : "text-[#c9c9c9]"
                }`}
              >
                {l.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
