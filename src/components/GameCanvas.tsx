"use client";

import { useEffect, useRef } from "react";
import { GRID_H, GRID_W } from "@/game/constants";
import { plotRect } from "@/game/projects";
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
    // the part of the map on screen, in tiles: the built area plus room to grow
    const view = { x: 0, y: 0, w: GRID_W, h: GRID_H };
    let framedVersion = -1;
    let framedState: unknown = null;
    const fit = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      tile = Math.max(6, Math.floor(Math.min(w / view.w, h / view.h)));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = tile * view.w + "px";
      canvas.style.height = tile * view.h + "px";
      canvas.width = tile * view.w * dpr;
      canvas.height = tile * view.h * dpr;
    };
    const reframe = () => {
      const s = store.state;
      if (!s) return;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      s.tiles.forEach((t, i) => {
        if (t.type === "empty" && !t.site) return;
        x0 = Math.min(x0, i % s.w);
        x1 = Math.max(x1, i % s.w);
        y0 = Math.min(y0, Math.floor(i / s.w));
        y1 = Math.max(y1, Math.floor(i / s.w));
      });
      // your land is where you can build, so keep all of it on screen
      s.owned.forEach((own, p) => {
        if (!own) return;
        const r = plotRect(s, p);
        x0 = Math.min(x0, r.x + 4);
        y0 = Math.min(y0, r.y + 4);
        x1 = Math.max(x1, r.x + r.w - 5);
        y1 = Math.max(y1, r.y + r.h - 5);
      });
      if (!isFinite(x0)) {
        view.x = 0;
        view.y = 0;
        view.w = GRID_W;
        view.h = GRID_H;
      } else {
        const m = 10;
        view.x = Math.max(0, x0 - m);
        view.y = Math.max(0, y0 - m);
        view.w = Math.min(GRID_W, x1 + m + 1) - view.x;
        view.h = Math.min(GRID_H, y1 + m + 1) - view.y;
        // keep roughly the screen's shape so tiles stay big
        const ratio = wrap.clientWidth / Math.max(1, wrap.clientHeight);
        while (view.w / view.h < ratio * 0.9 && view.w < GRID_W) {
          if (view.x > 0) view.x--;
          view.w = Math.min(GRID_W - view.x, view.w + 2);
        }
        while (view.w / view.h > ratio * 1.1 && view.h < GRID_H) {
          if (view.y > 0) view.y--;
          view.h = Math.min(GRID_H - view.y, view.h + 1);
        }
      }
      fit();
    };
    reframe();
    const ro = new ResizeObserver(reframe);
    ro.observe(wrap);

    const stop = startLoop((s) => {
      // grow the view when the layout grows (never shrink mid-game, so nothing jumps around)
      if (s !== framedState || s.version !== framedVersion) {
        const before = { ...view };
        reframe();
        if (s === framedState) {
          const x1 = Math.max(before.x + before.w, view.x + view.w);
          const y1 = Math.max(before.y + before.h, view.y + view.h);
          view.x = Math.min(before.x, view.x);
          view.y = Math.min(before.y, view.y);
          view.w = x1 - view.x;
          view.h = y1 - view.y;
          fit();
        }
        framedState = s;
        framedVersion = s.version;
      }
      ctx.setTransform(dpr, 0, 0, dpr, -view.x * tile * dpr, -view.y * tile * dpr);
      render(ctx, s, { tile, hover: store.hover, tool: store.tool, clip: view });
    });

    // ---- input ----
    let down = false;
    let lastIdx = -1;
    const tileAt = (e: PointerEvent): number => {
      const r = canvas.getBoundingClientRect();
      const x = view.x + Math.floor(((e.clientX - r.left) / r.width) * view.w);
      const y = view.y + Math.floor(((e.clientY - r.top) / r.height) * view.h);
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
