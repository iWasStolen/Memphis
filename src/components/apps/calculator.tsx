"use client";

import { useEffect, useState } from "react";

export default function Calculator() {
  const [display, setDisplay] = useState("0");
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  const press = (key: string) => {
    if (key === "C") {
      setDisplay("0");
      setExpr("");
      return;
    }
    if (key === "⌫") {
      setDisplay((d) => (d.length > 1 ? d.slice(0, -1) : "0"));
      return;
    }
    if (key === "=") {
      try {
        /* sanitize: digits, operators, parens, dot only */
        if (!/^[-+*/().\d\s]+$/.test(expr)) throw new Error("bad");
        const result = Function(`"use strict"; return (${expr})`)();
        if (!Number.isFinite(result)) throw new Error("bad");
        const shown = String(Math.round(result * 1e10) / 1e10);
        setHistory((h) => [`${expr} = ${shown}`, ...h].slice(0, 12));
        setDisplay(shown);
        setExpr(shown);
      } catch {
        setDisplay("Error");
        setExpr("");
      }
      return;
    }
    const isOp = ["+", "-", "*", "/", "(", ")"].includes(key);
    if (isOp) {
      setExpr((e) => e + key);
      setDisplay((d) => (d === "0" || d === "Error" ? key : d + key));
    } else {
      setExpr((e) => (e === "0" && key === "." ? "0." : e + key));
      setDisplay((d) =>
        d === "0" && key !== "." ? key : d === "Error" ? key : d + key
      );
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const map: Record<string, string> = {
        Enter: "=", "=": "=", Backspace: "⌫", Escape: "C", c: "C", C: "C",
      };
      const key = map[e.key] ?? (/^[-+*/().\d]$/.test(e.key) ? e.key : null);
      if (key) {
        e.preventDefault();
        press(key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }); // re-bind each render to capture current expr

  const KEYS = [
    "C", "(", ")", "⌫",
    "7", "8", "9", "/",
    "4", "5", "6", "*",
    "1", "2", "3", "-",
    "0", ".", "=", "+",
  ];

  return (
    <div className="max-w-md mx-auto p-4 grid sm:grid-cols-[1fr_160px] gap-5">
      <div>
        <div className="rounded-lg border border-[#1f1f1f] bg-[#050505] p-4 mb-3 text-right">
          <div className="text-[11px] font-mono text-[#555] h-4 truncate" aria-live="polite">
            {expr || "\u00a0"}
          </div>
          <div className="text-3xl font-mono text-white truncate" aria-label="Display">
            {display}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              aria-label={`Key ${k}`}
              className={`h-13 py-3 rounded-md border font-mono text-lg transition-colors ${
                k === "="
                  ? "bg-white text-black border-white hover:bg-[#e0e0e0]"
                  : ["C", "⌫", "(", ")"].includes(k)
                    ? "bg-[#141414] text-[#bbb] border-[#262626] hover:bg-[#1a1a1a]"
                    : "bg-[#0a0a0a] text-white border-[#262626] hover:bg-[#141414]"
              }`}
            >
              {k === "*" ? "×" : k === "/" ? "÷" : k}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mono-label mb-2">History</div>
        <div className="rounded-lg border border-[#1a1a1a] bg-[#050505] p-2 h-64 sm:h-[calc(100%-24px)] overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-[11px] text-[#555] p-2">No calculations yet.</p>
          ) : (
            <ul className="space-y-1">
              {history.map((h, i) => (
                <li key={i} className="text-[11px] font-mono text-[#8f8f8f] px-1.5 py-1 rounded hover:bg-[#0e0e0e] truncate">
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
