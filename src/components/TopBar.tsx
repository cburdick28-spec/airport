"use client";

import { useState } from "react";
import { TIER_NAMES } from "@/game/constants";
import { currentDemand } from "@/game/simulation";
import type { GameState } from "@/game/types";
import { clock, money } from "./format";
import { store } from "./store";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone ?? "text-slate-100"}`}>{value}</span>
    </div>
  );
}

export default function TopBar({ s }: { s: GameState }) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"tutorial" | "blank" | null>(null);
  const sat = Math.round(s.satisfaction);
  const satTone = sat >= 80 ? "text-emerald-400" : sat >= 60 ? "text-amber-400" : "text-rose-400";

  const restart = (kind: "tutorial" | "blank") => {
    if (confirm !== kind) return setConfirm(kind);
    store.newGame(kind);
    setConfirm(null);
    setMenu(false);
  };

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-700 bg-slate-900 px-4 py-2">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-sky-500 text-sm font-black text-white">A</div>
        <span className="hidden text-sm font-bold tracking-wide sm:block">Airport Tycoon</span>
      </div>
      <Stat label="Money" value={money(s.money)} tone={s.money < 0 ? "text-rose-400" : "text-emerald-300"} />
      <Stat label={`Tier ${s.tier}`} value={TIER_NAMES[s.tier]} tone="text-sky-300" />
      <Stat label="Passengers served" value={s.served.toLocaleString("en-US")} />
      <Stat label="Satisfaction" value={`${sat}%`} tone={satTone} />
      <Stat label="Demand" value={`${Math.round(currentDemand(s))} pax/hr`} />
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm font-medium tabular-nums text-slate-300">{clock(s.time)}</span>
        <div className="flex overflow-hidden rounded-md border border-slate-600 text-sm">
          <button
            onClick={() => store.togglePause()}
            title="Play / Pause (Space)"
            className={`px-3 py-1 font-semibold ${store.paused ? "bg-amber-500 text-slate-900" : "bg-slate-800 hover:bg-slate-700"}`}
          >
            {store.paused ? "Play" : "Pause"}
          </button>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => store.setSpeed(n)}
              title={`Speed ${n}x (key ${n})`}
              className={`border-l border-slate-600 px-3 py-1 font-semibold ${
                !store.paused && store.speed === n ? "bg-sky-500 text-white" : "bg-slate-800 hover:bg-slate-700"
              }`}
            >
              {n}x
            </button>
          ))}
        </div>
        <button
          onClick={() => store.setView3d(!store.view3d)}
          title="Switch between the 3D view and the lighter 2D map"
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-sm font-semibold hover:bg-slate-700"
        >
          {store.view3d ? "2D map" : "3D view"}
        </button>
        <div className="relative">
          <button
            onClick={() => {
              setMenu(!menu);
              setConfirm(null);
            }}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-sm font-semibold hover:bg-slate-700"
          >
            Menu
          </button>
          {menu && (
            <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-slate-600 bg-slate-800 p-1 text-sm shadow-xl">
              <button
                className="block w-full rounded px-3 py-2 text-left hover:bg-slate-700"
                onClick={() => {
                  store.save();
                  setMenu(false);
                }}
              >
                Save now
              </button>
              <button className="block w-full rounded px-3 py-2 text-left hover:bg-slate-700" onClick={() => restart("tutorial")}>
                {confirm === "tutorial" ? "Click again to wipe and restart" : "Restart tutorial airport"}
              </button>
              <button className="block w-full rounded px-3 py-2 text-left hover:bg-slate-700" onClick={() => restart("blank")}>
                {confirm === "blank" ? "Click again to wipe and start blank" : "Start a blank airport"}
              </button>
              <p className="px-3 py-2 text-xs text-slate-400">Autosaves to this browser every 20 seconds.</p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
