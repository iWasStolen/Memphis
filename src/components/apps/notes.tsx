"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Check } from "lucide-react";

interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

const KEY = "memphis-notes";

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setNotes(JSON.parse(raw));
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  const persist = (next: Note[]) => {
    setNotes(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full */
    }
  };

  const active = notes.find((n) => n.id === activeId) ?? null;

  const create = () => {
    const n: Note = {
      id: crypto.randomUUID(),
      title: "Untitled note",
      body: "",
      updatedAt: Date.now(),
    };
    persist([n, ...notes]);
    setActiveId(n.id);
  };

  const update = (id: string, patch: Partial<Note>) => {
    persist(
      notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))
    );
  };

  const remove = (id: string) => {
    persist(notes.filter((n) => n.id !== id));
    if (activeId === id) setActiveId(null);
  };

  if (!loaded) return <div className="p-6 text-sm text-[#666]">Loading notes…</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 grid sm:grid-cols-[220px_1fr] gap-4 min-h-[70vh]">
      <div className="flex flex-col gap-2">
        <Button
          onClick={create}
          className="bg-white text-black hover:bg-[#e0e0e0] w-full"
        >
          <Plus className="size-4 mr-2" /> New note
        </Button>
        <div className="flex-1 overflow-y-auto max-h-64 sm:max-h-none rounded-lg border border-[#1a1a1a] bg-[#050505]">
          {notes.length === 0 ? (
            <p className="text-[11px] text-[#555] p-3">
              No notes yet. Create one — it stays in this browser.
            </p>
          ) : (
            <ul>
              {notes
                .slice()
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => setActiveId(n.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-[#101010] text-xs transition-colors ${
                        activeId === n.id
                          ? "bg-[#141414] text-white"
                          : "text-[#9a9a9a] hover:bg-[#0c0c0c] hover:text-white"
                      }`}
                    >
                      <span className="block truncate font-medium">
                        {n.title || "Untitled"}
                      </span>
                      <span className="block text-[10px] text-[#555] mt-0.5">
                        {new Date(n.updatedAt).toLocaleString()}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {active ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              value={active.title}
              onChange={(e) => update(active.id, { title: e.target.value })}
              placeholder="Note title"
              aria-label="Note title"
              className="flex-1 bg-transparent text-lg font-semibold text-white outline-none border-b border-transparent focus:border-[#333] py-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="text-[#777] hover:text-white"
              onClick={() => remove(active.id)}
              aria-label="Delete note"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <textarea
            value={active.body}
            onChange={(e) => update(active.id, { body: e.target.value })}
            placeholder="Start writing…"
            aria-label="Note body"
            className="flex-1 min-h-[50vh] rounded-lg border border-[#1f1f1f] bg-[#050505] p-4 text-sm text-[#d4d4d4] leading-relaxed outline-none focus:border-[#333] resize-none"
          />
          <div className="flex items-center gap-2 text-[11px] text-[#555]">
            <Check className="size-3" /> Saved automatically ·{" "}
            {active.body.trim().split(/\s+/).filter(Boolean).length} words
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-[#222] text-sm text-[#666]">
          Select or create a note
        </div>
      )}
    </div>
  );
}
