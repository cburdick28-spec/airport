"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { tileInfo } from "@/game/analysis";
import { BUILD } from "@/game/constants";
import { areaPlan, buildBlocker, projectBlocker } from "@/game/simulation";
import { claimable, claimablePlots, isOwned, plotOf, TERMINALS } from "@/game/projects";
import AirportPicker from "./AirportPicker";
import BuildMenu from "./BuildMenu";
import { duration, money } from "./format";
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

  const act = store.area ? store.areaAction() : null;
  if (store.area && act) {
    const plan = areaPlan(s, act, store.area.a, store.area.b);
    title = `${plan.width} × ${plan.height} area`;
    if (act === "bulldoze") rows.push({ text: `Clears ${plan.count} tile${plan.count === 1 ? "" : "s"}`, tone: "text-rose-300" });
    else {
      rows.push({ text: `${plan.count} ${BUILD[act].name} tile${plan.count === 1 ? "" : "s"} · ${s.sandbox ? "free" : money(plan.cost)}`, tone: "text-slate-200" });
      if (!plan.affordable) rows.push({ text: "Not enough money for all of it: builds until the money runs out", tone: "text-amber-300" });
      if (plan.count < plan.width * plan.height)
        rows.push({ text: `${plan.width * plan.height - plan.count} tiles skipped (taken or not your land)`, tone: "text-slate-400" });
    }
    rows.push({ text: "Let go to confirm · Esc to cancel", tone: "text-slate-400" });
  } else if (tool?.kind === "build") {
    const def = BUILD[tool.type];
    const why = buildBlocker(s, pointer.idx, tool.type);
    title = `Build ${def.name} · ${money(def.cost[0])} · ${duration(def.time[0])}`;
    rows.push(why ? { text: why, tone: "text-rose-300" } : { text: def.desc, tone: "text-slate-300" });
  } else if (tool?.kind === "project") {
    const t = TERMINALS.find((x) => x.id === tool.id);
    if (!t) return null;
    const why = projectBlocker(s, t.id, tool.rot, pointer.idx % s.w, Math.floor(pointer.idx / s.w));
    title = `${t.name} · ${money(t.cost)} · ${duration(t.time)}`;
    rows.push(why ? { text: why, tone: "text-rose-300" } : { text: "Click to start construction. R rotates.", tone: "text-emerald-300" });
    rows.push({ text: t.blurb, tone: "text-slate-300" });
    rows.push({ text: "Hook the apron up to your taxiways. Opens all at once and earns a land permit.", tone: "text-slate-400" });
  } else if (tool?.kind === "claim") {
    const p = plotOf(s, pointer.idx);
    title = s.owned[p] ? "Your land" : "Claim this plot";
    rows.push(
      s.owned[p]
        ? { text: "You already own this plot", tone: "text-slate-300" }
        : claimable(s, p)
          ? { text: `Click to spend a land permit (${s.landPermits} left)`, tone: "text-emerald-300" }
          : { text: "Must border land you already own", tone: "text-rose-300" },
    );
  } else if (!info) {
    if (s.owned.length && !isOwned(s, pointer.idx))
      return (
        <div
          className="pointer-events-none fixed z-40 rounded-md border border-slate-600 bg-slate-900/95 px-3 py-2 text-xs shadow-xl"
          style={{ left: pointer.x + 16, top: pointer.y + 16 }}
        >
          <div className="font-semibold text-white">Land you don&apos;t own</div>
          <div className="text-slate-300">Finish a terminal project to earn a land permit</div>
        </div>
      );
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        store.togglePause();
      } else if (e.key === "1" || e.key === "2" || e.key === "3") store.setSpeed(Number(e.key));
      else if (e.key === "Escape") store.setTool(null);
      else if (e.key === "b" || e.key === "B") store.setTool({ kind: "bulldoze" });
      else if (e.key === "u" || e.key === "U") store.setTool({ kind: "upgrade" });
      else if (e.key === "r" || e.key === "R") store.rotate();
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
              {tool.kind === "build" &&
                `Building: ${BUILD[tool.type].name}${BUILD[tool.type].paint ? " (drag to paint, shift-drag to fill an area)" : ""}`}
              {tool.kind === "bulldoze" && "Bulldozer: click or drag, shift-drag to clear an area"}
              {tool.kind === "upgrade" && "Upgrade: click a building"}
              {tool.kind === "project" && `Placing: ${TERMINALS.find((t) => t.id === tool.id)?.name} · R to rotate`}
              {tool.kind === "claim" && "Claim a plot: click a green plot"}
              <span className="text-slate-400"> · Esc to stop</span>
            </div>
          )}
          {s.landPermits > 0 && tool?.kind !== "claim" && claimablePlots(s).length > 0 && (
            <button
              onClick={() => store.setTool({ kind: "claim" })}
              className="absolute right-4 top-4 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-500"
            >
              Land permit ready: claim a new plot ({s.landPermits})
            </button>
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
      {s.bankrupt && !store.picker && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-rose-500 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="text-3xl font-black text-rose-400">Bankrupt</div>
            <p className="mt-2 text-sm text-slate-300">
              {s.name} ran out of money and the bank has taken over. You served {s.served.toLocaleString("en-US")} passengers
              and reached Tier {s.tier}.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                onClick={() => store.newGame(s.scenarioId)}
                className="rounded-md bg-sky-500 px-4 py-2 text-sm font-bold text-white hover:bg-sky-400"
              >
                Restart this airport
              </button>
              <button
                onClick={() => store.setPicker(true)}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm font-bold hover:bg-slate-800"
              >
                Pick another airport
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
