"use client";

import { useEffect, useRef } from "react";
import { BASE_RATE, GRID_H, GRID_W, MAX_STEP } from "@/game/constants";
import { saveGame } from "@/game/save";
import { step } from "@/game/simulation";
import { render } from "@/render/renderer";
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

    let raf = 0;
    let last = performance.now();
    let uiTimer = 0;
    let saveTimer = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = store.state;
      if (!s) return;

      if (!store.paused) {
        let gm = dtReal * BASE_RATE * store.speed;
        while (gm > 1e-6) {
          const d = Math.min(MAX_STEP, gm);
          step(s, d);
          gm -= d;
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, s, { tile, hover: store.hover, tool: store.tool });

      uiTimer += dtReal;
      if (uiTimer > 0.2) {
        uiTimer = 0;
        // surface important engine events as toasts
        const ev = s.events[s.events.length - 1];
        if (ev && ev.id > store.lastEventId) {
          store.lastEventId = ev.id;
          if (ev.kind !== "info") store.flash = { text: ev.text, kind: ev.kind, until: now + 4000 };
        }
        if (store.flash && now > store.flash.until) store.flash = null;
        store.bump();
      }
      saveTimer += dtReal;
      if (saveTimer > 20) {
        saveTimer = 0;
        saveGame(s);
      }
    };
    raf = requestAnimationFrame(frame);

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

    const onUnload = () => {
      if (store.state) saveGame(store.state);
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("contextmenu", onContext);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [onPointer]);

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="touch-none rounded-lg shadow-lg shadow-black/40" />
    </div>
  );
}
