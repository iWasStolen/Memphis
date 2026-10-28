"use client";

import { useState } from "react";

const CATEGORIES: Record<string, { units: string[]; factors: Record<string, number> }> = {
  Length: {
    units: ["mm", "cm", "m", "km", "in", "ft", "yd", "mi"],
    factors: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  },
  Mass: {
    units: ["mg", "g", "kg", "t", "oz", "lb"],
    factors: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.0283495, lb: 0.453592 },
  },
  Area: {
    units: ["cm²", "m²", "km²", "ft²", "ac", "ha"],
    factors: { "cm²": 1e-4, "m²": 1, "km²": 1e6, "ft²": 0.092903, ac: 4046.86, ha: 10000 },
  },
  Volume: {
    units: ["ml", "l", "m³", "tsp", "tbsp", "cup", "pt", "qt", "gal"],
    factors: { ml: 1, l: 1000, "m³": 1e6, tsp: 4.92892, tbsp: 14.7868, cup: 236.588, pt: 473.176, qt: 946.353, gal: 3785.41 },
  },
  Speed: {
    units: ["m/s", "km/h", "mph", "kn", "ft/s"],
    factors: { "m/s": 1, "km/h": 0.277778, mph: 0.44704, kn: 0.514444, "ft/s": 0.3048 },
  },
  Data: {
    units: ["B", "KB", "MB", "GB", "TB", "KiB", "MiB", "GiB"],
    factors: { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824 },
  },
  Time: {
    units: ["ms", "s", "min", "h", "day", "wk"],
    factors: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, wk: 604800 },
  },
};

export default function UnitConverter() {
  const [cat, setCat] = useState("Length");
  const isTemp = cat === "Temperature";
  const [from, setFrom] = useState("m");
  const [to, setTo] = useState("ft");
  const [value, setValue] = useState("1");

  const cats = [...Object.keys(CATEGORIES), "Temperature"];

  const switchCat = (c: string) => {
    setCat(c);
    if (c === "Temperature") {
      setFrom("°C");
      setTo("°F");
    } else {
      setFrom(CATEGORIES[c].units[0]);
      setTo(CATEGORIES[c].units[1] ?? CATEGORIES[c].units[0]);
    }
  };

  const units = isTemp
    ? ["°C", "°F", "K"]
    : CATEGORIES[cat].units;

  const toCelsius = (v: number, u: string) =>
    u === "°C" ? v : u === "°F" ? ((v - 32) * 5) / 9 : v - 273.15;
  const fromCelsius = (c: number, u: string) =>
    u === "°C" ? c : u === "°F" ? (c * 9) / 5 + 32 : c + 273.15;

  const convert = (): string => {
    const v = parseFloat(value);
    if (!Number.isFinite(v)) return "—";
    let result: number;
    if (isTemp) {
      result = fromCelsius(toCelsius(v, from), to);
    } else {
      const f = CATEGORIES[cat].factors;
      result = (v * f[from]) / f[to];
    }
    if (Math.abs(result) >= 1e9 || (Math.abs(result) < 1e-6 && result !== 0))
      return result.toExponential(6);
    return String(Math.round(result * 1e8) / 1e8);
  };

  const Select = ({
    val,
    onChange,
    ariaLabel,
  }: {
    val: string;
    onChange: (v: string) => void;
    ariaLabel: string;
  }) => (
    <select
      value={val}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="bg-[#050505] border border-[#262626] rounded-md px-3 py-2.5 text-sm text-white outline-none focus:border-[#3a3a3a]"
    >
      {units.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </select>
  );

  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="flex flex-wrap gap-1.5 mb-4">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => switchCat(c)}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
              cat === c
                ? "bg-white text-black border-white"
                : "border-[#262626] text-[#9a9a9a] hover:text-white"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-[#1a1a1a] bg-[#050505] p-5">
        <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label className="mono-label block mb-1.5" htmlFor="conv-from">from</label>
            <input
              id="conv-from"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              className="w-full bg-black border border-[#262626] rounded-md px-3 py-2.5 text-lg font-mono text-white outline-none focus:border-[#3a3a3a]"
            />
            <div className="mt-2">
              <Select val={from} onChange={setFrom} ariaLabel="From unit" />
            </div>
          </div>
          <div className="hidden sm:block pb-24 text-center text-[#555] font-mono">→</div>
          <div>
            <label className="mono-label block mb-1.5" htmlFor="conv-to">to</label>
            <div
              id="conv-to"
              className="w-full bg-black border border-[#1c1c1c] rounded-md px-3 py-2.5 text-lg font-mono text-white overflow-x-auto"
              aria-live="polite"
            >
              {convert()}
            </div>
            <div className="mt-2">
              <Select val={to} onChange={setTo} ariaLabel="To unit" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
