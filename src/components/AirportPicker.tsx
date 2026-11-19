"use client";

import { useState } from "react";
import { SCENARIOS } from "@/game/scenarios";
import { modeStore } from "./mode";
import { store } from "./store";

/** Dialog for jumping into one of the pre-built airports. */
export default function AirportPicker({ current }: { current: string }) {
  const [armed, setArmed] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);

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
        <button
          onClick={() => {
            store.setPicker(false);
            modeStore.set("airline");
          }}
          className="mb-4 flex w-full items-center gap-4 rounded-lg border border-sky-500/60 bg-gradient-to-r from-sky-600/30 to-indigo-600/20 p-4 text-left hover:border-sky-300"
        >
          <span className="text-4xl">🌍</span>
          <span className="flex-1">
            <span className="block text-lg font-black">New mode: Airline CEO</span>
            <span className="block text-sm text-slate-300">
              Run an airline instead of an airport. Pick a home airport and a starting fortune (broke to billionaire), open
              routes around a 3D globe, and set Basic, Average or Luxury prices and seating on every route.
            </span>
          </span>
          <span className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-bold">Play →</span>
        </button>
        <label
          className={`mb-4 flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
            sandbox ? "border-amber-400 bg-amber-500/10" : "border-slate-700 bg-slate-800/60"
          }`}
        >
          <input
            type="checkbox"
            checked={sandbox}
            onChange={(e) => {
              setSandbox(e.target.checked);
              setArmed(null);
            }}
            className="mt-1 h-4 w-4 accent-amber-400"
          />
          <span>
            <span className="block font-semibold">Sandbox mode</span>
            <span className="block text-sm text-slate-400">
              Unlimited money, every tier and plot unlocked, instant building, no bankruptcy or fines. Weather still
              happens.
            </span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((sc) => (
            <div key={sc.id} className="flex flex-col rounded-lg border border-slate-700 bg-slate-800 p-4">
              <span className="text-2xl font-black tracking-wider text-sky-300">{sc.code}</span>
              <span className="text-xs uppercase tracking-wide text-slate-400">{sc.tagline}</span>
              <div className="mt-1 font-semibold">{sc.name}</div>
              <p className="mt-1 flex-1 text-sm text-slate-300">{sc.blurb}</p>
              <div className="mt-2 text-xs text-slate-400">{sc.facts}</div>
              <button
                onClick={() => (armed === sc.id ? store.newGame(sc.id, sandbox) : setArmed(sc.id))}
                className={`mt-3 rounded-md px-3 py-1.5 text-sm font-bold ${
                  armed === sc.id ? "bg-amber-500 text-slate-900" : "bg-sky-500 text-white hover:bg-sky-400"
                }`}
              >
                {armed === sc.id ? "Click again to replace current game" : sandbox ? "Play sandbox" : "Play"}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Runway positions, lengths and crossings come from real runway coordinates (OurAirports open data), rotated to
          fit the grid. Terminal positions follow real gate locations (FlightGear open scenery data). Taxiways and gate
          counts are simplified by hand.
        </p>
      </div>
    </div>
  );
}
