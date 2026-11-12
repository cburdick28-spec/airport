"use client";

import { useState } from "react";
import { SCENARIOS } from "@/game/scenarios";
import { store } from "./store";

/** Dialog for jumping into one of the pre-built airports. */
export default function AirportPicker({ current }: { current: string }) {
  const [armed, setArmed] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={() => store.setPicker(false)}
    >
      <div
        className="max-h-full w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Choose an airport</h2>
            <p className="text-sm text-slate-400">
              Each one is pre-built and already running. Loading one replaces your current game ({current}).
            </p>
          </div>
          <button
            onClick={() => store.setPicker(false)}
            className="rounded-md border border-slate-600 px-3 py-1 text-sm font-semibold hover:bg-slate-800"
          >
            Close
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((sc) => (
            <div key={sc.id} className="flex flex-col rounded-lg border border-slate-700 bg-slate-800 p-4">
              <span className="text-2xl font-black tracking-wider text-sky-300">{sc.code}</span>
              <span className="text-xs uppercase tracking-wide text-slate-400">{sc.tagline}</span>
              <div className="mt-1 font-semibold">{sc.name}</div>
              <p className="mt-1 flex-1 text-sm text-slate-300">{sc.blurb}</p>
              <div className="mt-2 text-xs text-slate-400">{sc.facts}</div>
              <button
                onClick={() => (armed === sc.id ? store.newGame(sc.id) : setArmed(sc.id))}
                className={`mt-3 rounded-md px-3 py-1.5 text-sm font-bold ${
                  armed === sc.id ? "bg-amber-500 text-slate-900" : "bg-sky-500 text-white hover:bg-sky-400"
                }`}
              >
                {armed === sc.id ? "Click again to replace current game" : "Play"}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Layouts are simplified versions of the real airports. Runways in this game run left to right, so crossing
          runways are shown as parallel ones.
        </p>
      </div>
    </div>
  );
}
