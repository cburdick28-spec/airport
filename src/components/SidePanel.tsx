"use client";

import { getAnalysis, TIER_UNLOCKS, tierProgress } from "@/game/analysis";
import { FEES, GATE_SIZE, LOAN_RATE, MAX_CONTRACTS, OVERDRAFT_RATE, PLANES, TIER_NAMES, TOWER_FORECAST_HOURS } from "@/game/constants";
import { bankruptAt, demandParts, hourlyUpkeep, maxLoan, parkingUsed, siteName } from "@/game/simulation";
import type { Flight, GameState } from "@/game/types";
import { compass, currentWeather, runwayStates, WEATHER } from "@/game/weather";
import { WindArrow } from "./WeatherBadge";
import { clock, duration, money } from "./format";
import { store } from "./store";

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
      if (s.time < f.arriveAt) return `Lands in ${Math.max(1, Math.round(f.arriveAt - s.time))}m`;
      return f.holdReason ? `Circling ${Math.round(f.holding)}m: ${f.holdReason}` : "Holding for runway";
    case "landing":
      return "Landing";
    case "taxiIn":
      return "Taxi to gate";
    case "deboarding":
      return "Deboarding";
    case "boarding":
      return `Boarding ${f.boarded}/${f.depBooked}`;
    case "taxiOut":
      return f.holdReason ? `Holding short: ${f.holdReason}` : "Taxi to runway";
    case "takeoff":
      return "Taking off";
  }
}

export default function SidePanel({ s }: { s: GameState }) {
  const a = getAnalysis(s);
  const progress = tierProgress(s);
  const events = s.events.slice(-7).reverse();
  const w = currentWeather(s);
  const runways = runwayStates(s, a);
  const horizon = s.time + TOWER_FORECAST_HOURS[a.tower] * 60;
  const coming = s.forecast.slice(1).filter((x) => x.start < horizon);
  const circling = s.flights.filter((f) => f.state === "scheduled" && f.holding > 0).length;
  const holdingShort = s.flights.filter((f) => f.state === "taxiOut" && f.holdReason).length;
  const hhmm = (t: number) => clock(t).split(" · ")[1];
  // construction grouped into projects (tiles painted together finish together)
  const projects = new Map<string, { name: string; count: number; done: number; start: number; cost: number }>();
  for (const i of s.sites) {
    const site = s.tiles[i].site;
    if (!site) continue;
    const pr = site.projectId ? s.projects.find((x) => x.id === site.projectId) : undefined;
    const key = pr ? `p${pr.id}` : `${site.type}:${site.level}:${Math.round(site.done / 15)}`;
    const p = projects.get(key);
    if (pr) {
      if (!p) projects.set(key, { name: `${pr.label} ${pr.name}`, count: 1, done: pr.done, start: pr.start, cost: pr.cost });
    } else if (p) {
      p.count++;
      p.cost += site.cost;
    } else projects.set(key, { name: siteName(site), count: 1, done: site.done, start: site.start, cost: site.cost });
  }
  const jobs = [...projects.values()].sort((p, q) => p.done - q.done);
  const dp = demandParts(s);

  return (
    <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-700 bg-slate-900 text-sm lg:flex">
      <Section title="Weather and runways">
        <div className="flex items-center gap-3">
          <WindArrow dir={w.windDir} size={36} />
          <div className="text-xs">
            <div className="text-sm font-semibold">{WEATHER[w.kind].name}</div>
            <div className="text-slate-300">
              Wind from the {compass(w.windDir)} at {w.windSpeed} kt
            </div>
            <div className="text-slate-500">until {hhmm(w.end)}</div>
          </div>
        </div>
        <ul className="mt-2 space-y-1">
          {runways.map((r) => (
            <li key={r.run.key} className="text-xs">
              <span className="font-semibold">
                {r.run.vertical ? "N-S" : "E-W"} {r.run.len}
              </span>
              <span className="text-slate-400">
                {" "}
                · {r.run.vertical ? (r.dir > 0 ? "landing south" : "landing north") : r.dir > 0 ? "landing east" : "landing west"} ·
                xwind {r.crosswind} kt
              </span>
              <span
                className={`block ${r.status === "open" ? "text-emerald-300" : r.status === "limited" ? "text-amber-300" : "text-rose-300"}`}
              >
                {r.status === "open" ? "Open" : `${r.status === "closed" ? "Closed" : "Limited"}: ${r.reason}`}
              </span>
            </li>
          ))}
          {runways.length === 0 && <li className="text-xs text-slate-400">No runways yet.</li>}
        </ul>
        {(circling > 0 || holdingShort > 0) && (
          <p className="mt-2 text-xs text-amber-300">
            {circling} circling · {holdingShort} holding short. Planes divert after 75 min.
          </p>
        )}
        <div className="mt-2 text-[11px] uppercase tracking-wider text-slate-500">
          Forecast ({TOWER_FORECAST_HOURS[a.tower]}h{a.tower === 0 ? ", build a tower for more" : ""})
        </div>
        <ul className="mt-1 space-y-0.5 text-xs">
          {coming.map((x) => (
            <li key={x.start} className="flex justify-between">
              <span className="text-slate-400">{hhmm(x.start)}</span>
              <span className={x.kind === "storm" || x.kind === "snow" || x.kind === "fog" ? "text-amber-300" : "text-slate-200"}>
                {WEATHER[x.kind].name}
              </span>
              <span className="text-slate-400">
                {x.windSpeed} kt {compass(x.windDir)}
              </span>
            </li>
          ))}
          {coming.length === 0 && <li className="text-slate-500">No change expected</li>}
        </ul>
      </Section>

      {jobs.length > 0 && (
        <Section title={`Construction (${jobs.length})`}>
          <ul className="space-y-1.5">
            {jobs.slice(0, 8).map((j, i) => {
              const pct = Math.min(100, Math.max(0, ((s.time - j.start) / Math.max(1, j.done - j.start)) * 100));
              return (
                <li key={i} className="text-xs">
                  <div className="flex justify-between">
                    <span className="font-semibold">
                      {j.name}
                      {j.count > 1 ? ` ×${j.count}` : ""}
                    </span>
                    <span className="tabular-nums text-slate-300">{duration(j.done - s.time)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-slate-700">
                    <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
            {jobs.length > 8 && <li className="text-xs text-slate-500">+{jobs.length - 8} more</li>}
          </ul>
        </Section>
      )}

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

      <Section title={s.tier < 5 ? `Next: Tier ${s.tier + 1} ${TIER_NAMES[s.tier + 1]}` : "Top tier reached"}>
        {progress.length === 0 ? (
          <p className="text-xs text-slate-400">You run a Global Mega-Hub. Keep it on time through the storms.</p>
        ) : (
          <ul className="space-y-1">
            <li className="text-xs text-sky-300">Unlocks: {TIER_UNLOCKS[s.tier + 1]}</li>
            {progress.map((p, i) => (
              <li key={i} className={`flex items-center gap-2 text-xs ${p.done ? "text-emerald-300" : "text-slate-300"}`}>
                <span className={`h-2 w-2 rounded-full ${p.done ? "bg-emerald-400" : "bg-slate-600"}`} />
                {p.label}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Airline contracts (${s.contracts.length}/${MAX_CONTRACTS})`}>
        {s.contracts.map((c) => {
          const left = Math.max(0, c.deadline - s.time);
          return (
            <div key={c.id} className="mb-2 rounded border border-sky-700 bg-sky-950/60 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{c.airlineName}</span>
                <span className={`text-xs tabular-nums ${left < 120 ? "text-rose-300" : "text-slate-300"}`}>
                  {Math.floor(left / 60)}h {Math.floor(left % 60)}m left
                </span>
              </div>
              <div className="text-xs text-slate-300">
                {PLANES[c.cls].short} · {c.done}/{c.flights} on-time flights · {money(c.reward)} bonus
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-700">
                <div className="h-full bg-sky-400" style={{ width: `${(c.done / c.flights) * 100}%` }} />
              </div>
            </div>
          );
        })}
        {s.contractOffers.length === 0 && s.contracts.length === 0 && (
          <p className="text-xs text-slate-400">No offers right now. Airlines check back every 6 hours.</p>
        )}
        {s.contractOffers.map((c) => (
          <div key={c.id} className="mb-2 rounded bg-slate-800 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{c.airlineName}</span>
              <button
                onClick={() => store.sign(c.id)}
                disabled={s.contracts.length >= MAX_CONTRACTS}
                className="rounded bg-sky-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-sky-400 disabled:opacity-40"
              >
                Sign
              </button>
            </div>
            <div className="text-xs text-slate-300">
              {c.flights} {PLANES[c.cls].short.toLowerCase()} flights in {c.hours}h
            </div>
            <div className="text-xs">
              <span className="text-emerald-300">+{money(c.reward)}</span>
              <span className="text-slate-500"> win · </span>
              <span className="text-rose-300">-{money(c.penalty)}</span>
              <span className="text-slate-500"> fail · </span>
              <span className="text-rose-300">-{money(c.latePenalty)}</span>
              <span className="text-slate-500"> per late flight</span>
            </div>
          </div>
        ))}
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
          <dt className="text-slate-400">Loan</dt>
          <dd className="text-right tabular-nums">
            {money(s.loan)} / {money(maxLoan(s))}
          </dd>
          <dt className="text-slate-400">Interest</dt>
          <dd className="text-right tabular-nums">
            {money(s.loan * LOAN_RATE + (s.money < 0 ? -s.money * OVERDRAFT_RATE : 0))}/day
          </dd>
          <dt className="text-slate-400">Bankrupt below</dt>
          <dd className="text-right tabular-nums text-rose-300">{money(bankruptAt(s))}</dd>
          <dt className="text-slate-400">Fees</dt>
          <dd className="text-right">{FEES[s.fees].name}</dd>
          <dt className="text-slate-400">Demand now</dt>
          <dd className="text-right tabular-nums" title="Tier base × satisfaction × on-time × time of day × fees × marketing × growth">
            {Math.round(dp.total)}/hr ({Math.round(dp.timeOfDay * 100)}% rush)
          </dd>
          <dt className="text-slate-400">On-time departures</dt>
          <dd className="text-right tabular-nums">{Math.round(s.otp)}%</dd>
          <dt className="text-slate-400">Diverted flights</dt>
          <dd className="text-right tabular-nums">{s.diversions}</dd>
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
