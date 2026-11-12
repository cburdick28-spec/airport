"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { tileInfo } from "@/game/analysis";
import { BUILD } from "@/game/constants";
import { buildBlocker } from "@/game/simulation";
import AirportPicker from "./AirportPicker";
import BuildMenu from "./BuildMenu";
import { money } from "./format";
import Game3D from "./Game3D";
import GameCanvas from "./GameCanvas";
import SidePanel from "./SidePanel";
import { store } from "./store";
import TopBar from "./TopBar";

interface Pointer {
  idx: number;
  x: number;
  y: number;
}

function Tooltip({ pointer }: { pointer: Pointer }) {
  const s = store.state;
  if (!s) return null;
  const tool = store.tool;
  const info = tileInfo(s, pointer.idx);
  const rows: { text: string; tone: string }[] = [];
  let title = info?.title ?? "";

  if (tool?.kind === "build") {
    const def = BUILD[tool.type];
    const why = buildBlocker(s, pointer.idx, tool.type);
    title = `Build ${def.name} · ${money(def.cost[0])}`;
    rows.push(why ? { text: why, tone: "text-rose-300" } : { text: def.desc, tone: "text-slate-300" });
  } else if (!info) {
    return null;
  } else {
    if (tool?.kind === "bulldoze") rows.push({ text: "Click to demolish (50% refund)", tone: "text-rose-300" });
    if (tool?.kind === "upgrade") rows.push({ text: "Click to upgrade", tone: "text-violet-300" });
    for (const l of info.lines) rows.push({ text: l, tone: "text-slate-300" });
    for (const i of info.issues) rows.push({ text: "⚠ " + i, tone: "text-amber-300" });
    if (info.issues.length === 0 && s.tiles[pointer.idx].type === "gate")
      rows.push({ text: "✓ Fully connected", tone: "text-emerald-300" });
  }

  const flipX = typeof window !== "undefined" && pointer.x > window.innerWidth - 300;
  const flipY = typeof window !== "undefined" && pointer.y > window.innerHeight - 220;
  return (
    <div
      className="pointer-events-none fixed z-40 w-64 rounded-md border border-slate-600 bg-slate-900/95 px-3 py-2 text-xs shadow-xl"
      style={{
        left: flipX ? pointer.x - 272 : pointer.x + 16,
        top: flipY ? undefined : pointer.y + 16,
        bottom: flipY ? window.innerHeight - pointer.y + 12 : undefined,
      }}
    >
      <div className="mb-1 text-sm font-semibold text-white">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className={`leading-snug ${r.tone}`}>
          {r.text}
        </div>
      ))}
    </div>
  );
}

export default function Game() {
  useSyncExternalStore(store.subscribe, store.getTick, () => 0);
  const [pointer, setPointer] = useState<Pointer | null>(null);
  const onPointer = useCallback((p: Pointer | null) => setPointer(p), []);

  useEffect(() => {
    store.init();
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        store.togglePause();
      } else if (e.key === "1" || e.key === "2" || e.key === "3") store.setSpeed(Number(e.key));
      else if (e.key === "Escape") store.setTool(null);
      else if (e.key === "b" || e.key === "B") store.setTool({ kind: "bulldoze" });
      else if (e.key === "u" || e.key === "U") store.setTool({ kind: "upgrade" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const s = store.state;
  if (!s) {
    return <div className="grid h-dvh place-items-center bg-slate-900 text-slate-300">Loading airport…</div>;
  }

  const flash = store.flash;
  const tool = store.tool;
  return (
    <div className="flex h-dvh flex-col bg-slate-900 text-slate-100">
      <TopBar s={s} />
      <div className="flex min-h-0 flex-1">
        <main className={`relative min-w-0 flex-1 ${store.view3d ? "" : "p-2"}`}>
          {store.view3d ? <Game3D onPointer={onPointer} /> : <GameCanvas onPointer={onPointer} />}
          {store.view3d && (
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-slate-900/70 px-3 py-1.5 text-[11px] text-slate-300">
              Right-drag: rotate · Scroll: zoom · WASD or drag (Inspect mode): move
            </div>
          )}
          {tool && (
            <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-slate-900/85 px-3 py-1.5 text-xs text-slate-200">
              {tool.kind === "build" && `Building: ${BUILD[tool.type].name}${BUILD[tool.type].paint ? " (drag to paint)" : ""}`}
              {tool.kind === "bulldoze" && "Bulldozer: click or drag"}
              {tool.kind === "upgrade" && "Upgrade: click a building"}
              <span className="text-slate-400"> · Esc to stop</span>
            </div>
          )}
          {flash && (
            <div
              className={`pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-semibold shadow-lg ${
                flash.kind === "good" ? "bg-emerald-600" : flash.kind === "bad" ? "bg-rose-600" : "bg-slate-700"
              }`}
            >
              {flash.text}
            </div>
          )}
        </main>
        <SidePanel s={s} />
      </div>
      <BuildMenu s={s} />
      {pointer && !store.picker && <Tooltip pointer={pointer} />}
      {store.picker && <AirportPicker current={s.name} />}
    </div>
  );
}
