"use client";

import { getAnalysis, tierProgress } from "@/game/analysis";
import { GATE_SIZE, PLANES, TIER_NAMES } from "@/game/constants";
import { hourlyUpkeep, parkingUsed } from "@/game/simulation";
import type { Flight, GameState } from "@/game/types";
import { clock, money } from "./format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-700 px-3 py-3">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function flightStatus(s: GameState, f: Flight): string {
  switch (f.state) {
    case "scheduled":
      return s.time >= f.arriveAt ? "Holding for runway" : `Lands in ${Math.max(1, Math.round(f.arriveAt - s.time))}m`;
    case "landing":
      return "Landing";
    case "taxiIn":
      return "Taxi to gate";
    case "deboarding":
      return "Deboarding";
    case "boarding":
      return `Boarding ${f.boarded}/${f.depBooked}`;
    case "taxiOut":
      return "Taxi to runway";
    case "takeoff":
      return "Taking off";
  }
}

export default function SidePanel({ s }: { s: GameState }) {
  const a = getAnalysis(s);
  const progress = tierProgress(s);
  const events = s.events.slice(-7).reverse();

  return (
    <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-700 bg-slate-900 text-sm lg:flex">
      <Section title="Flight ops: why planes do or don't come">
        <ul className="space-y-1.5">
          {a.classStatus.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span
                className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  c.ok ? "bg-emerald-500 text-white" : "bg-slate-600 text-slate-200"
                }`}
              >
                {c.ok ? "✓" : "!"}
              </span>
              <span>
                <span className="font-semibold">{PLANES[i].short}</span>
                <span className={`block text-xs ${c.ok ? "text-slate-400" : "text-amber-300"}`}>{c.reason}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={s.tier < 3 ? `Next: Tier ${s.tier + 1} ${TIER_NAMES[s.tier + 1]}` : "Top tier reached"}>
        {progress.length === 0 ? (
          <p className="text-xs text-slate-400">You run an International Airport. Now make it huge.</p>
        ) : (
          <ul className="space-y-1">
            {progress.map((p, i) => (
              <li key={i} className={`flex items-center gap-2 text-xs ${p.done ? "text-emerald-300" : "text-slate-300"}`}>
                <span className={`h-2 w-2 rounded-full ${p.done ? "bg-emerald-400" : "bg-slate-600"}`} />
                {p.label}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Gates and flights">
        {a.gates.length === 0 && <p className="text-xs text-slate-400">No gates yet.</p>}
        <ul className="space-y-1.5">
          {a.gates.map((g) => {
            const fid = s.gateFlight[g.idx];
            const f = fid !== undefined ? s.flights.find((x) => x.id === fid) : undefined;
            return (
              <li key={g.idx} className="rounded bg-slate-800 px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {g.name} <span className="text-xs font-normal text-slate-400">{GATE_SIZE[g.level]}</span>
                  </span>
                  {f && <span className="text-xs text-sky-300">{f.code}</span>}
                </div>
                {f ? (
                  <div className="text-xs text-slate-300">
                    {PLANES[f.cls].short} · {f.city} · {flightStatus(s, f)}
                  </div>
                ) : g.functional ? (
                  <div className="text-xs text-slate-400">{s.gateNote[g.idx] ?? "Open, waiting for a flight"}</div>
                ) : (
                  <div className="text-xs text-rose-300">{g.issues[0]}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Finances">
        <dl className="grid grid-cols-2 gap-y-1 text-xs">
          <dt className="text-slate-400">Income last hour</dt>
          <dd className="text-right tabular-nums text-emerald-300">{money(s.incomeLastHour)}</dd>
          <dt className="text-slate-400">Spending last hour</dt>
          <dd className="text-right tabular-nums text-rose-300">{money(s.expenseLastHour)}</dd>
          <dt className="text-slate-400">Staff + upkeep</dt>
          <dd className="text-right tabular-nums">{money(hourlyUpkeep(s))}/hr</dd>
          <dt className="text-slate-400">Parking in use</dt>
          <dd className="text-right tabular-nums">
            {parkingUsed(s)}/{a.parkingSpots}
          </dd>
          <dt className="text-slate-400">Flights handled</dt>
          <dd className="text-right tabular-nums">{s.flightsHandled}</dd>
          <dt className="text-slate-400">Missed flights (pax)</dt>
          <dd className="text-right tabular-nums">{s.missedFlights}</dd>
        </dl>
      </Section>

      <Section title="Log">
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              className={`text-xs ${e.kind === "good" ? "text-emerald-300" : e.kind === "bad" ? "text-rose-300" : "text-slate-300"}`}
            >
              <span className="text-slate-500">{clock(e.time).split(" · ")[1]} </span>
              {e.text}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-snug text-slate-500">
          Blue dots are departing passengers, orange are arriving, red missed their flight.
        </p>
      </Section>
    </aside>
  );
}
