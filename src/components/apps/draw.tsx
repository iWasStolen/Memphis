"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Eraser, Trash2 } from "lucide-react";

const PALETTE = ["#ffffff", "#c8c8c8", "#969696", "#5c5c5c", "#2c2c2c"];

export default function Draw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState("#ffffff");
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = tool === "eraser" ? "#000000" : color;
    ctx.lineWidth = tool === "eraser" ? size * 3 : size;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    const canvas = canvasRef.current!;
    const link = document.createElement("a");
    link.download = `memphis-drawing-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1.5" role="radiogroup" aria-label="Brush color">
          {PALETTE.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              onClick={() => {
                setColor(c);
                setTool("brush");
              }}
              className={`size-6 rounded-full border-2 transition-transform ${
                color === c && tool === "brush" ? "border-white scale-110" : "border-[#333]"
              }`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <label htmlFor="brush-size" className="mono-label">size</label>
          <input
            id="brush-size"
            type="range"
            min={1}
            max={24}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-24 accent-white"
          />
          <span className="font-mono text-[11px] text-[#8f8f8f] w-5">{size}</span>
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className={`border-[#262626] ${
            tool === "eraser" ? "text-white border-white" : "text-[#9a9a9a] hover:text-white"
          }`}
          onClick={() => setTool((t) => (t === "eraser" ? "brush" : "eraser"))}
        >
          <Eraser className="size-3.5 mr-1.5" /> Eraser
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-[#262626] text-[#9a9a9a] hover:text-white"
          onClick={clear}
        >
          <Trash2 className="size-3.5 mr-1.5" /> Clear
        </Button>
        <Button
          size="sm"
          className="bg-white text-black hover:bg-[#e0e0e0]"
          onClick={save}
        >
          <Download className="size-3.5 mr-1.5" /> PNG
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full aspect-[4/3] rounded-lg border border-[#1f1f1f] touch-none cursor-crosshair bg-black"
        aria-label="Drawing canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <p className="mt-2 text-[11px] text-[#555]">
        Draw with mouse, pen or finger. Export saves a PNG to your downloads.
      </p>
    </div>
  );
}
