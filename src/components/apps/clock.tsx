"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

interface Zone {
  id: string;
  tz: string;
  label: string;
}

const SUGGESTED = [
  { tz: "America/Los_Angeles", label: "Los Angeles" },
  { tz: "America/Denver", label: "Denver" },
  { tz: "America/Chicago", label: "Chicago" },
  { tz: "America/New_York", label: "New York" },
  { tz: "Europe/London", label: "London" },
  { tz: "Europe/Paris", label: "Paris" },
  { tz: "Europe/Berlin", label: "Berlin" },
  { tz: "Africa/Cairo", label: "Cairo" },
  { tz: "Asia/Dubai", label: "Dubai" },
  { tz: "Asia/Kolkata", label: "Mumbai" },
  { tz: "Asia/Shanghai", label: "Shanghai" },
  { tz: "Asia/Tokyo", label: "Tokyo" },
  { tz: "Australia/Sydney", label: "Sydney" },
  { tz: "Pacific/Auckland", label: "Auckland" },
];

const KEY = "memphis-worldclock";

export default function WorldClock() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [now, setNow] = useState(new Date());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setZones(JSON.parse(raw));
      else {
        const def = [
          { id: "1", tz: "America/Los_Angeles", label: "Los Angeles" },
          { id: "2", tz: "America/New_York", label: "New York" },
          { id: "3", tz: "Europe/London", label: "London" },
        ];
        setZones(def);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const persist = (z: Zone[]) => {
    setZones(z);
    localStorage.setItem(KEY, JSON.stringify(z));
  };

  const timeIn = (tz: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now);
    } catch {
      return "--:--:--";
    }
  };

  const dayIn = (tz: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(now);
    } catch {
      return "";
    }
  };

  const available = SUGGESTED.filter((s) => !zones.some((z) => z.tz === s.tz));

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="mono-label">your zones</span>
        <button
          onClick={() => setAdding((a) => !a)}
          className="text-xs text-[#9a9a9a] hover:text-white u-link"
        >
          {adding ? "done" : "add zone"}
        </button>
      </div>

      {adding && (
        <div className="flex flex-wrap gap-1.5 mb-4 p-3 rounded-lg border border-[#1f1f1f] bg-[#050505]">
          {available.length === 0 ? (
            <span className="text-xs text-[#666]">All suggested zones added.</span>
          ) : (
            available.map((s) => (
              <button
                key={s.tz}
                onClick={() =>
                  persist([...zones, { id: crypto.randomUUID(), ...s }])
                }
                className="flex items-center gap-1 px-2 py-1 rounded border border-[#262626] text-[11px] text-[#9a9a9a] hover:text-white hover:border-[#3a3a3a]"
              >
                <Plus className="size-3" /> {s.label}
              </button>
            ))
          )}
        </div>
      )}

      <ul className="space-y-2">
        {zones.map((z) => (
          <li
            key={z.id}
            className="group flex items-center justify-between rounded-lg border border-[#1a1a1a] bg-[#080808] px-4 py-3.5"
          >
            <div>
              <div className="text-sm text-white">{z.label}</div>
              <div className="text-[11px] text-[#666] font-mono">
                {z.tz} · {dayIn(z.tz)}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl text-white tabular-nums">
                {timeIn(z.tz)}
              </span>
              <button
                onClick={() => persist(zones.filter((x) => x.id !== z.id))}
                aria-label={`Remove ${z.label}`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#666] hover:text-white transition-opacity"
              >
                <X className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
