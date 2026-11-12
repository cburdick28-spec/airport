"use client";

import { useEffect, useRef } from "react";
import { GRID_H, GRID_W } from "@/game/constants";
import { Scene3D } from "@/render/scene3d";
import { startLoop } from "./loop";
import { store } from "./store";

interface Props {
  onPointer: (p: { idx: number; x: number; y: number } | null) => void;
}

const PAN_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];

/** 3D view: owns the WebGL canvas, camera input and tile picking. */
export default function Game3D({ onPointer }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let scene: Scene3D;
    try {
      scene = new Scene3D(canvas, GRID_W, GRID_H);
    } catch {
      store.setView3d(false, "3D isn't available on this device, switched to the 2D map");
      return;
    }

    const resize = () => scene.resize(wrap.clientWidth, wrap.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const stop = startLoop((s, _now, dt) => scene.render(s, { hover: store.hover, tool: store.tool }, dt));

    let down = false;
    let lastIdx = -1;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !store.tool) return;
      const idx = scene.pick(e.clientX, e.clientY);
      if (idx < 0) return;
      down = true;
      lastIdx = idx;
      store.applyTool(idx, false);
    };
    const onMove = (e: PointerEvent) => {
      const idx = scene.pick(e.clientX, e.clientY);
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
    const onLost = (e: Event) => {
      e.preventDefault();
      store.setView3d(false, "3D graphics stopped working, switched to the 2D map");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (PAN_KEYS.includes(k)) {
        scene.keys.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => scene.keys.delete(e.key.toLowerCase());
    const onBlur = () => scene.keys.clear();

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("webglcontextlost", onLost);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      scene.dispose();
    };
  }, [onPointer]);

  return (
    <div ref={wrapRef} className="h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
    </div>
  );
}
