"use client";

import { useEffect, useRef } from "react";
import { GRID_H, GRID_W } from "@/game/constants";
import { render } from "@/render/renderer";
import { startLoop } from "./loop";
import { store } from "./store";

interface Props {
  onPointer: (p: { idx: number; x: number; y: number } | null) => void;
}

/** Owns the canvas, the requestAnimationFrame game loop and mouse input. */
export default function GameCanvas({ onPointer }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let tile = 16;
    let dpr = 1;
    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      tile = Math.max(6, Math.floor(Math.min(w / GRID_W, h / GRID_H)));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = tile * GRID_W + "px";
      canvas.style.height = tile * GRID_H + "px";
      canvas.width = tile * GRID_W * dpr;
      canvas.height = tile * GRID_H * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const stop = startLoop((s) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, s, { tile, hover: store.hover, tool: store.tool });
    });

    // ---- input ----
    let down = false;
    let lastIdx = -1;
    const tileAt = (e: PointerEvent): number => {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * GRID_W);
      const y = Math.floor(((e.clientY - r.top) / r.height) * GRID_H);
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return -1;
      return y * GRID_W + x;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) {
        store.setTool(null);
        return;
      }
      if (e.button !== 0) return;
      const idx = tileAt(e);
      if (idx < 0) return;
      down = true;
      lastIdx = idx;
      canvas.setPointerCapture(e.pointerId);
      store.applyTool(idx, false);
    };
    const onMove = (e: PointerEvent) => {
      const idx = tileAt(e);
      store.hover = idx;
      onPointer(idx >= 0 ? { idx, x: e.clientX, y: e.clientY } : null);
      if (down && idx >= 0 && idx !== lastIdx) {
        lastIdx = idx;
        store.applyTool(idx, true);
      }
    };
    const onUp = () => {
      down = false;
      lastIdx = -1;
    };
    const onLeave = () => {
      store.hover = -1;
      onPointer(null);
    };
    const onContext = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("contextmenu", onContext);

    return () => {
      stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("contextmenu", onContext);
    };
  }, [onPointer]);

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="touch-none rounded-lg shadow-lg shadow-black/40" />
    </div>
  );
}
