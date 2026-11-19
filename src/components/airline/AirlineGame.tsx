"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AIRCRAFT, AIRCRAFT_BY_ID, AIRLINE_COLORS, CABIN, CITIES, CITY, FARE, LEVELS, TIER_NAMES, type Tier } from "@/airline/data";
import * as E from "@/airline/engine";
import { Globe } from "@/airline/globe";
import { modeStore } from "../mode";
import { airline } from "./airlineStore";

const money = E.money;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");
const TIER_TONE = ["text-sky-300", "text-slate-200", "text-amber-300"];

function useAirline() {
  useSyncExternalStore(airline.subscribe, airline.version, () => 0);
  return airline.state;
}

// ---------------------------------------------------------------------------

function GlobeView() {
  const host = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const g = new Globe(host.current);
    g.onPick = (code) => {
      airline.selectCity(code);
      if (code) airline.selectRoute(null);
    };
    g.onHover = (code, x, y) => setHover(code ? { code, x, y } : null);
    const first = airline.state?.hubs[0];
    if (first) g.focus(first);

    let raf = 0;
    let last = performance.now();
    let ui = 0;
    let save = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = airline.state;
      if (!s) return;
      if (!airline.paused && !airline.setup && !s.bankrupt) {
        let gm = dt * E.AIRLINE_RATE * airline.speed;
        while (gm > 1e-6) {
          const d = Math.min(2, gm);
          E.step(s, d);
          gm -= d;
        }
      }
      const preview: [string, string] | null =
        airline.city && airline.plan.hub && airline.city !== airline.plan.hub && !s.hubs.includes(airline.city)
          ? [airline.plan.hub, airline.city]
          : null;
      g.update(s, { city: airline.city, route: airline.route, preview });
      ui += dt;
      if (ui > 0.25) {
        ui = 0;
        const ev = s.events.at(-1);
        if (ev && ev.id > airline.lastEventId) {
          airline.lastEventId = ev.id;
          if (ev.kind !== "info") airline.flash = { text: ev.text, kind: ev.kind, until: now + 4500 };
        }
        if (airline.flash && now > airline.flash.until) airline.flash = null;
        airline.bump();
      }
      save += dt;
      if (save > 15) {
        save = 0;
        E.saveAirline(s);
      }
    };
    raf = requestAnimationFrame(frame);
    const onUnload = () => airline.state && E.saveAirline(airline.state);
    window.addEventListener("beforeunload", onUnload);
    const focus = (e: Event) => g.focus((e as CustomEvent<string>).detail);
    window.addEventListener("airline-focus", focus);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("airline-focus", focus);
      onUnload();
      g.dispose();
    };
  }, []);

  const c = hover ? CITY[hover.code] : null;
  return (
    <div ref={host} className="absolute inset-0">
      {c && hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-slate-600 bg-slate-900/95 px-2 py-1 text-xs shadow-lg"
          style={{ left: hover.x + 14, top: hover.y + 10 }}
        >
          <div className="font-bold">
            {c.code} · {c.name}
          </div>
          <div className="text-slate-400">
            {c.country} · {c.market}M people{c.boost ? ` · transfer hub ×${c.boost}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Chips({ value, onChange, labels, disabled }: { value: Tier; onChange: (t: Tier) => void; labels?: string[]; disabled?: boolean }) {
  return (
    <div className="flex gap-1">
      {([0, 1, 2] as Tier[]).map((t) => (
        <button
          key={t}
          disabled={disabled}
          onClick={() => onChange(t)}
          className={`flex-1 rounded px-2 py-1 text-xs font-semibold transition ${
            value === t ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          } disabled:opacity-50`}
        >
          {(labels ?? TIER_NAMES)[t]}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded bg-slate-800/70 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function satTone(v: number) {
  return v >= 70 ? "text-emerald-300" : v >= 50 ? "text-amber-300" : "text-rose-300";
}

// ---------------------------------------------------------------------------

function TopBar({ s }: { s: E.AirlineState }) {
  const t = E.totals(s);
  const next = LEVELS[s.level + 1];
  const prog = next ? Math.min(1, (s.totalPax - LEVELS[s.level].pax) / (next.pax - LEVELS[s.level].pax)) : 1;
  const fleet = Object.values(s.fleet).reduce((a, n) => a + n, 0);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900/95 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 pr-2">
        <span className="h-4 w-4 rounded-full border-2 border-white/70" style={{ background: s.color }} />
        <span className="font-black tracking-wide">{s.name}</span>
      </div>
      <Stat label="Cash" value={money(s.cash)} tone={s.cash < 0 ? "text-rose-300" : "text-emerald-300"} />
      <Stat label="Profit / day" value={money(t.profit)} tone={t.profit < 0 ? "text-rose-300" : "text-emerald-300"} />
      <Stat label="Passengers / day" value={num(t.pax)} />
      <Stat label="Reputation" value={`${Math.round(s.reputation)} / 100`} tone={satTone(s.reputation)} />
      <div className="min-w-[150px] rounded bg-slate-800/70 px-2 py-1" title={next ? `${num(next.pax - s.totalPax)} more passengers to ${next.name}` : "Top level"}>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">Level {s.level}</div>
        <div className="text-sm font-bold">{LEVELS[s.level].name}</div>
        <div className="mt-0.5 h-1 rounded bg-slate-700">
          <div className="h-1 rounded bg-sky-400" style={{ width: pct(prog) }} />
        </div>
      </div>
      <Stat label="Fleet" value={`${fleet} plane${fleet === 1 ? "" : "s"}`} />
      <Stat label="Fuel" value={`${Math.round(s.fuel * 100)}`} tone={s.fuel > 1.15 ? "text-rose-300" : s.fuel < 0.9 ? "text-emerald-300" : ""} />
      <div className="ml-auto flex items-center gap-1">
        <span className="mr-2 font-mono text-slate-300">{E.clockOf(s.time)}</span>
        {[0, 1, 3, 8].map((n) => (
          <button
            key={n}
            onClick={() => airline.setSpeed(n)}
            className={`rounded px-2 py-1 text-xs font-bold ${
              (n === 0 && airline.paused) || (n > 0 && !airline.paused && airline.speed === n) ? "bg-sky-500" : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            {n === 0 ? (airline.paused ? "▶" : "❚❚") : `${n}×`}
          </button>
        ))}
        <button onClick={() => airline.showSetup(true)} className="ml-2 rounded bg-slate-800 px-2 py-1 text-xs font-semibold hover:bg-slate-700">
          New airline
        </button>
        <button onClick={() => modeStore.set("airport")} className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold hover:bg-slate-700">
          Airport mode
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CityPanel({ s, code }: { s: E.AirlineState; code: string }) {
  const c = CITY[code];
  const plan = airline.plan;
  const isHub = s.hubs.includes(code);
  const routesHere = s.routes.filter((r) => r.a === code || r.b === code);
  const hub = s.hubs.includes(plan.hub) ? plan.hub : s.hubs[0];
  const km = E.distanceKm(hub, code);
  const already = s.routes.some((r) => (r.a === hub && r.b === code) || (r.a === code && r.b === hub));
  const why = E.routeBlocker(s, hub, code, plan.type);
  const preview = !isHub && !already ? E.previewRoute(s, hub, code, plan.type, plan.fare, plan.cabin) : null;
  const t = AIRCRAFT_BY_ID[plan.type];
  const upfront = E.slotFee(code) + (E.idlePlanes(s, plan.type) > 0 ? 0 : E.leaseCost(plan.type));
  const hubWhy = E.hubBlocker(s, code);

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-20 max-h-[calc(100%-1.5rem)] w-[340px] overflow-y-auto rounded-xl border border-slate-600 bg-slate-900/95 p-4 shadow-2xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-black tracking-wider text-sky-300">{c.code}</div>
          <div className="font-semibold">
            {c.name}, {c.country}
          </div>
          <div className="text-xs text-slate-400">
            {c.market}M people{c.boost ? ` · transfer hub (×${c.boost} traffic)` : ""}
            {E.stormAt(s, code) && <span className="ml-1 font-bold text-rose-300">· STORM</span>}
          </div>
        </div>
        <button onClick={() => airline.selectCity(null)} className="rounded px-2 text-slate-400 hover:bg-slate-800 hover:text-white">
          ✕
        </button>
      </div>

      {isHub && <div className="mt-3 rounded bg-sky-500/15 px-2 py-1 text-sm font-semibold text-sky-200">Your hub: routes start here.</div>}

      {routesHere.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-xs uppercase tracking-wide text-slate-400">Your routes here</div>
          {routesHere.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                airline.selectRoute(r.id);
                airline.setTab("routes");
              }}
              className="flex w-full justify-between rounded bg-slate-800 px-2 py-1 text-left text-sm hover:bg-slate-700"
            >
              <span>
                {r.a} ⇄ {r.b}
              </span>
              <span className={E.routeStats(s, r).profitPerDay < 0 ? "text-rose-300" : "text-emerald-300"}>{money(E.routeStats(s, r).profitPerDay)}/day</span>
            </button>
          ))}
        </div>
      )}

      {!isHub && !already && (
        <div className="mt-4 space-y-3">
          <div className="text-xs uppercase tracking-wide text-slate-400">Open a route</div>
          {s.hubs.length > 1 && (
            <div className="flex gap-1">
              {s.hubs.map((h) => (
                <button
                  key={h}
                  onClick={() => airline.setPlan({ hub: h })}
                  className={`rounded px-2 py-1 text-xs font-bold ${h === hub ? "bg-sky-500" : "bg-slate-800 hover:bg-slate-700"}`}
                >
                  from {h}
                </button>
              ))}
            </div>
          )}
          <div className="text-sm">
            {hub} ⇄ {code} · <span className="font-semibold">{num(km)} km</span>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Plane</div>
            <div className="grid grid-cols-2 gap-1">
              {AIRCRAFT.map((a) => {
                const locked = s.level < a.level;
                const far = km > a.rangeKm;
                return (
                  <button
                    key={a.id}
                    disabled={locked || far}
                    onClick={() => airline.setPlan({ type: a.id })}
                    title={locked ? `Needs level ${a.level}: ${LEVELS[a.level].name}` : far ? `Range ${num(a.rangeKm)} km` : a.name}
                    className={`rounded px-2 py-1 text-left text-xs ${
                      plan.type === a.id ? "bg-sky-500 text-white" : "bg-slate-800 hover:bg-slate-700"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <div className="font-bold">
                      {a.short} {locked ? "🔒" : ""}
                    </div>
                    <div className="opacity-80">
                      {a.seats} seats · {far ? "too far" : `${num(a.rangeKm)} km`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Ticket prices</div>
            <Chips value={plan.fare} onChange={(f) => airline.setPlan({ fare: f })} />
            <div className="text-xs text-slate-400">{FARE.blurb[plan.fare]}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-400">Seating</div>
            <Chips value={plan.cabin} onChange={(f) => airline.setPlan({ cabin: f })} />
            <div className="text-xs text-slate-400">{CABIN.blurb[plan.cabin]}</div>
          </div>
          {preview && (
            <div className="grid grid-cols-3 gap-1">
              <Stat label="Pax / day" value={num(preview.paxPerDay)} />
              <Stat label="Full" value={pct(preview.load)} tone={preview.load < 0.6 ? "text-amber-300" : ""} />
              <Stat label="Ticket" value={money(preview.fare)} />
              <Stat label="Happiness" value={`${Math.round(preview.satisfaction)}`} tone={satTone(preview.satisfaction)} />
              <Stat
                label="Profit / day"
                value={money(preview.profitPerDay - t.leasePerDay)}
                tone={preview.profitPerDay - t.leasePerDay < 0 ? "text-rose-300" : "text-emerald-300"}
              />
              <Stat label="Flights / day" value={preview.legsPerDay.toFixed(1)} />
            </div>
          )}
          <div className="text-xs text-slate-400">
            Upfront: {money(upfront)} (landing slots {money(E.slotFee(code))}
            {E.idlePlanes(s, plan.type) > 0 ? ", using an idle plane" : `, lease deposit ${money(E.leaseCost(plan.type))}`}). Profit includes the {money(t.leasePerDay)}/day lease.
          </div>
          <button
            disabled={!!why}
            onClick={() => {
              const r = airline.act((st) => E.openRoute(st, hub, code, plan.type, plan.fare, plan.cabin));
              if (r?.ok) {
                airline.selectRoute(s.routes.at(-1)!.id);
                airline.setTab("routes");
              }
            }}
            className="w-full rounded-md bg-emerald-500 py-2 font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {why ?? `Open route · ${money(upfront)}`}
          </button>
        </div>
      )}

      {!isHub && (
        <div className="mt-4 border-t border-slate-700 pt-3">
          <div className="text-xs text-slate-400">
            A hub lets you start routes from {code}. Costs {money(E.hubCost(code))} + {money(60_000)}/day.
          </div>
          <button
            disabled={!!hubWhy}
            onClick={() => airline.act((st) => E.openHub(st, code))}
            className="mt-2 w-full rounded-md bg-sky-600 py-1.5 text-sm font-bold hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {hubWhy ?? `Make ${code} a hub · ${money(E.hubCost(code))}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function RouteCard({ s, r }: { s: E.AirlineState; r: E.Route }) {
  const st = E.routeStats(s, r);
  const open = airline.route === r.id;
  const [closing, setClosing] = useState(false);
  const lease = Object.entries(r.planes).reduce((a, [id, n]) => a + AIRCRAFT_BY_ID[id].leasePerDay * n, 0);
  const net = st.profitPerDay - lease;
  const km = st.km;
  return (
    <div className={`rounded-lg border ${open ? "border-sky-400 bg-slate-800" : "border-slate-700 bg-slate-800/60"} p-2`}>
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => {
          airline.selectRoute(open ? null : r.id);
          if (!open) window.dispatchEvent(new CustomEvent("airline-focus", { detail: r.b }));
        }}
      >
        <div>
          <div className="font-bold">
            {r.a} ⇄ {r.b} <span className="text-xs font-normal text-slate-400">{num(km)} km</span>
          </div>
          <div className="text-xs">
            <span className={TIER_TONE[r.fare]}>{TIER_NAMES[r.fare]} prices</span> ·{" "}
            <span className={TIER_TONE[r.cabin]}>{TIER_NAMES[r.cabin]} seats</span>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-bold ${net < 0 ? "text-rose-300" : "text-emerald-300"}`}>{money(net)}/day</div>
          <div className="text-xs text-slate-400">
            {num(st.paxPerDay)} pax · {pct(st.load)} full
          </div>
        </div>
      </button>
      {st.grounded && <div className="mt-1 rounded bg-rose-500/15 px-2 py-0.5 text-xs text-rose-200">{st.grounded}</div>}
      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-700 pt-2">
          <div className="grid grid-cols-3 gap-1">
            <Stat label="Ticket" value={money(st.fare)} />
            <Stat label="Happiness" value={`${Math.round(r.satisfaction)}`} tone={satTone(r.satisfaction)} />
            <Stat label="Flights / day" value={st.legsPerDay.toFixed(1)} />
            <Stat label="Demand / day" value={num(st.demandPerDay)} />
            <Stat label="Seats / day" value={num(st.seatsPerDay)} />
            <Stat label="Revenue / day" value={money(st.revenuePerDay)} />
          </div>
          {st.demandPerDay > st.seatsPerDay * 1.1 && !st.grounded && (
            <div className="text-xs text-emerald-300">Demand is bigger than your seats: add a plane!</div>
          )}
          {st.load < 0.55 && !st.grounded && <div className="text-xs text-amber-300">Planes are half empty: cheaper tickets, comfier seats, or fewer planes.</div>}
          <div>
            <div className="mb-1 text-xs text-slate-400">Ticket prices (free to change)</div>
            <Chips value={r.fare} onChange={(f) => airline.act((x) => E.setFare(x, r.id, f))} />
            <div className="mt-1 text-xs text-slate-400">{FARE.blurb[r.fare]}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-400">Seating (refit grounds the route for 12h)</div>
            <Chips
              value={r.cabin}
              onChange={(c) => airline.act((x) => E.setCabin(x, r.id, c))}
              labels={([0, 1, 2] as Tier[]).map((c) => (c === r.cabin ? TIER_NAMES[c] : `${TIER_NAMES[c]} ${money(E.refitCost(r, c))}`))}
            />
            <div className="mt-1 text-xs text-slate-400">{CABIN.blurb[r.cabin]}</div>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-400">Planes on this route</div>
            {AIRCRAFT.filter((a) => (r.planes[a.id] ?? 0) > 0 || (s.level >= a.level && km <= a.rangeKm)).map((a) => (
              <div key={a.id} className="flex items-center justify-between py-0.5 text-sm">
                <span>
                  {a.short} <span className="text-xs text-slate-400">({E.idlePlanes(s, a.id)} idle)</span>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    onClick={() => airline.act((x) => E.removePlane(x, r.id, a.id))}
                    disabled={!(r.planes[a.id] > 0)}
                    className="h-6 w-6 rounded bg-slate-700 font-bold hover:bg-slate-600 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-bold">{r.planes[a.id] ?? 0}</span>
                  <button
                    onClick={() => airline.act((x) => E.addPlane(x, r.id, a.id))}
                    title={E.idlePlanes(s, a.id) > 0 ? "Use an idle plane" : `Lease one: ${money(E.leaseCost(a.id))} deposit`}
                    className="h-6 w-6 rounded bg-slate-700 font-bold hover:bg-slate-600"
                  >
                    +
                  </button>
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              if (closing) airline.act((x) => E.closeRoute(x, r.id));
              else setClosing(true);
            }}
            className={`w-full rounded py-1 text-xs font-bold ${closing ? "bg-rose-500 text-white" : "bg-slate-700 hover:bg-slate-600"}`}
          >
            {closing ? "Click again to close the route" : "Close route"}
          </button>
        </div>
      )}
    </div>
  );
}

function RoutesTab({ s }: { s: E.AirlineState }) {
  if (s.routes.length === 0)
    return (
      <div className="space-y-2 text-sm text-slate-300">
        <p>No routes yet.</p>
        <p>Click any yellow city on the globe, pick a plane, prices and seating, then open the route.</p>
        <p className="text-slate-400">Tip: big cities close to your hub are the safest first routes.</p>
      </div>
    );
  const sorted = [...s.routes].sort((a, b) => E.routeStats(s, b).profitPerDay - E.routeStats(s, a).profitPerDay);
  return (
    <div className="space-y-2">
      {sorted.map((r) => (
        <RouteCard key={r.id} s={s} r={r} />
      ))}
    </div>
  );
}

function FleetTab({ s }: { s: E.AirlineState }) {
  return (
    <div className="space-y-2">
      {AIRCRAFT.map((a) => {
        const owned = s.fleet[a.id] ?? 0;
        const idle = E.idlePlanes(s, a.id);
        const locked = s.level < a.level;
        return (
          <div key={a.id} className={`rounded-lg border border-slate-700 bg-slate-800/60 p-2 ${locked ? "opacity-60" : ""}`}>
            <div className="flex justify-between">
              <div className="font-bold">
                {a.name} {locked && "🔒"}
              </div>
              <div className="text-sm">
                {owned} leased{owned ? ` · ${idle} idle` : ""}
              </div>
            </div>
            <div className="text-xs text-slate-400">
              {a.seats} seats · {num(a.rangeKm)} km range · {num(a.speed)} km/h · {money(a.leasePerDay)}/day lease
            </div>
            {locked ? (
              <div className="mt-1 text-xs text-amber-300">Unlocks at level {a.level}: {LEVELS[a.level].name}</div>
            ) : (
              <div className="mt-2 flex gap-1">
                <button onClick={() => airline.act((x) => E.leasePlane(x, a.id))} className="flex-1 rounded bg-sky-600 py-1 text-xs font-bold hover:bg-sky-500">
                  Lease · {money(E.leaseCost(a.id))}
                </button>
                <button
                  disabled={idle <= 0}
                  onClick={() => airline.act((x) => E.returnPlane(x, a.id))}
                  className="flex-1 rounded bg-slate-700 py-1 text-xs font-bold hover:bg-slate-600 disabled:opacity-40"
                >
                  Return idle plane
                </button>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-slate-400">Idle planes still cost their lease. Put them on a route or send them back.</p>
    </div>
  );
}

function MoneyTab({ s }: { s: E.AirlineState }) {
  const t = E.totals(s);
  const hist = s.history.slice(-30);
  const max = Math.max(1, ...hist.map((d) => Math.abs(d.revenue - d.costs)));
  const rows: [string, number][] = [
    ["Ticket sales", t.revenue],
    ["Fuel, crew, food, fees", -t.costs],
    ["Plane leases", -t.lease],
    ["HQ, hubs & sales", -t.overhead],
    ["Loan interest", -t.interest],
  ];
  const marketing = s.time < s.marketingUntil;
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Per day right now</div>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-slate-300">{k}</span>
            <span className={v < 0 ? "text-rose-300" : "text-emerald-300"}>{money(v)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-slate-700 pt-1 font-bold">
          <span>Profit</span>
          <span className={t.profit < 0 ? "text-rose-300" : "text-emerald-300"}>{money(t.profit)}</span>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">Last {hist.length} days</div>
        <div className="flex h-20 items-center gap-px rounded bg-slate-800/60 p-1">
          {hist.length === 0 && <span className="text-xs text-slate-500">Finish your first day</span>}
          {hist.map((d, i) => {
            const p = d.revenue - d.costs;
            return (
              <div key={i} className="flex h-full flex-1 flex-col justify-center" title={`Day ${s.history.length - hist.length + i + 1}: ${money(p)}`}>
                <div className="flex flex-1 items-end">
                  {p > 0 && <div className="w-full rounded-t bg-emerald-400" style={{ height: pct(p / max) }} />}
                </div>
                <div className="flex flex-1 items-start">
                  {p < 0 && <div className="w-full rounded-b bg-rose-400" style={{ height: pct(-p / max) }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-lg border border-slate-700 p-2">
        <div className="flex justify-between">
          <span>Loan</span>
          <span className="font-bold">{money(s.loan)}</span>
        </div>
        <div className="text-xs text-slate-400">
          {E.LOAN_RATE * 100}% interest a day. Bankrupt below {money(E.BANKRUPT_AT)} cash.
        </div>
        <div className="mt-2 flex gap-1">
          <button onClick={() => airline.act(E.takeLoan)} className="flex-1 rounded bg-slate-700 py-1 text-xs font-bold hover:bg-slate-600">
            Borrow {money(E.LOAN_STEP)}
          </button>
          <button onClick={() => airline.act(E.repayLoan)} disabled={s.loan <= 0} className="flex-1 rounded bg-slate-700 py-1 text-xs font-bold hover:bg-slate-600 disabled:opacity-40">
            Repay {money(Math.min(E.LOAN_STEP, s.loan))}
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-slate-700 p-2">
        <div className="font-semibold">Ad campaign</div>
        <div className="text-xs text-slate-400">+25% passengers on every route for {E.MARKETING_DAYS} days.</div>
        <button
          disabled={marketing}
          onClick={() => airline.act(E.runMarketing)}
          className="mt-2 w-full rounded bg-fuchsia-600 py-1 text-xs font-bold hover:bg-fuchsia-500 disabled:bg-slate-700"
        >
          {marketing ? `Running until ${E.clockOf(s.marketingUntil)}` : `Launch · ${money(E.MARKETING_COST)}`}
        </button>
      </div>
    </div>
  );
}

function NewsTab({ s }: { s: E.AirlineState }) {
  return (
    <div className="space-y-1">
      {[...s.events].reverse().map((e) => (
        <div key={e.id} className="rounded bg-slate-800/60 px-2 py-1 text-sm">
          <div className="text-[10px] text-slate-500">{E.clockOf(e.time)}</div>
          <div className={e.kind === "bad" ? "text-rose-300" : e.kind === "good" ? "text-emerald-300" : "text-slate-200"}>{e.text}</div>
        </div>
      ))}
    </div>
  );
}

function SidePanel({ s }: { s: E.AirlineState }) {
  const tabs: [typeof airline.tab, string][] = [
    ["routes", `Routes (${s.routes.length})`],
    ["fleet", "Fleet"],
    ["money", "Money"],
    ["news", "News"],
  ];
  return (
    <div className="flex w-[360px] shrink-0 flex-col border-l border-slate-700 bg-slate-900/95">
      <div className="flex border-b border-slate-700">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => airline.setTab(id)}
            className={`flex-1 py-2 text-sm font-semibold ${airline.tab === id ? "border-b-2 border-sky-400 text-white" : "text-slate-400 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {airline.tab === "routes" && <RoutesTab s={s} />}
        {airline.tab === "fleet" && <FleetTab s={s} />}
        {airline.tab === "money" && <MoneyTab s={s} />}
        {airline.tab === "news" && <NewsTab s={s} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Setup({ canClose }: { canClose: boolean }) {
  const [hub, setHub] = useState("JFK");
  const [name, setName] = useState("");
  const [color, setColor] = useState(AIRLINE_COLORS[0]);
  const [preset, setPreset] = useState("millionaire");
  const regions: [string, string[]][] = [
    ["North America", ["USA", "Canada", "Mexico"]],
    ["South America", ["Brazil", "Argentina"]],
    ["Europe", ["UK", "France", "Spain", "Germany", "Turkey"]],
    ["Africa & Middle East", ["Egypt", "South Africa", "UAE"]],
    ["Asia & Pacific", []],
  ];
  const regionOf = (country: string) => regions.find(([, cs]) => cs.includes(country))?.[0] ?? "Asia & Pacific";
  const p = E.PRESET_BY_ID[preset];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="max-h-full w-full max-w-5xl overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">Airline CEO</h2>
            <p className="text-sm text-slate-400">
              Pick your home airport and how rich you are. Then build routes, set ticket prices and seating, and grow into a global giant.
            </p>
          </div>
          <div className="flex gap-2">
            {canClose && (
              <button onClick={() => airline.showSetup(false)} className="rounded-md border border-slate-600 px-3 py-1 text-sm font-semibold hover:bg-slate-800">
                Back to my airline
              </button>
            )}
            <button onClick={() => modeStore.set("airport")} className="rounded-md border border-slate-600 px-3 py-1 text-sm font-semibold hover:bg-slate-800">
              Airport mode
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs uppercase tracking-wide text-slate-400">1 · Starting money</div>
        <div className="mt-1 grid gap-2 sm:grid-cols-5">
          {E.PRESETS.map((x) => (
            <button
              key={x.id}
              onClick={() => setPreset(x.id)}
              className={`rounded-lg border p-2 text-left ${preset === x.id ? "border-amber-400 bg-amber-500/10" : "border-slate-700 bg-slate-800 hover:border-slate-500"}`}
            >
              <div className="font-bold">{x.name}</div>
              <div className="text-lg font-black text-emerald-300">{money(x.cash)}</div>
              {x.loan > 0 && <div className="text-xs font-bold text-rose-300">{money(x.loan)} debt</div>}
              <div className="mt-1 text-xs text-slate-400">{x.blurb}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 text-xs uppercase tracking-wide text-slate-400">2 · Home airport</div>
        <div className="mt-1 space-y-2">
          {regions.map(([rg]) => (
            <div key={rg}>
              <div className="mb-1 text-xs text-slate-500">{rg}</div>
              <div className="flex flex-wrap gap-1">
                {CITIES.filter((c) => regionOf(c.country) === rg).map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setHub(c.code)}
                    title={`${c.name}, ${c.country} · ${c.market}M people`}
                    className={`rounded px-2 py-1 text-sm ${hub === c.code ? "bg-sky-500 font-bold text-white" : "bg-slate-800 hover:bg-slate-700"}`}
                  >
                    <span className="font-bold">{c.code}</span> <span className="text-xs opacity-80">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">3 · Airline name</div>
            <input
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${CITY[hub].name} Air`}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">4 · Colors</div>
            <div className="mt-1 flex gap-2">
              {AIRLINE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-9 w-9 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => airline.start(hub, name, color, preset)}
          className="mt-5 w-full rounded-lg bg-emerald-500 py-3 text-lg font-black text-slate-950 hover:bg-emerald-400"
        >
          {canClose ? "Replace my airline and start " : "Start "}
          {(name.trim() || `${CITY[hub].name} Air`)} at {hub} with {money(p.cash)}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function AirlineGame() {
  const s = useAirline();
  useEffect(() => airline.init(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === " ") {
        e.preventDefault();
        airline.setSpeed(0);
      } else if (e.key === "Escape") {
        airline.selectCity(null);
        airline.selectRoute(null);
      } else if (["1", "2", "3"].includes(e.key)) airline.setSpeed([1, 3, 8][+e.key - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!airline.ready) return <div className="h-full bg-slate-950" />;

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      {s && <TopBar s={s} />}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <GlobeView />
          {s && airline.city && <CityPanel s={s} code={airline.city} />}
          {s && s.routes.length === 0 && !airline.city && !airline.setup && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-sky-500/90 px-4 py-2 text-sm font-bold shadow-lg">
              Click a city on the globe to open your first route from {s.hubs[0]}
            </div>
          )}
          {airline.flash && (
            <div
              className={`pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-semibold shadow-xl ${
                airline.flash.kind === "bad" ? "bg-rose-600" : airline.flash.kind === "good" ? "bg-emerald-600" : "bg-slate-700"
              }`}
            >
              {airline.flash.text}
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 text-xs text-slate-500">Drag to spin · scroll to zoom · Space pauses</div>
        </div>
        {s && <SidePanel s={s} />}
      </div>
      {(airline.setup || !s) && <Setup canClose={!!s} />}
      {s?.bankrupt && !airline.setup && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/80 p-4">
          <div className="max-w-md rounded-xl border border-rose-500 bg-slate-900 p-6 text-center">
            <div className="text-3xl font-black text-rose-400">Bankrupt</div>
            <p className="mt-2 text-slate-300">
              {s.name} ran out of money. It flew {num(s.totalPax)} passengers before the creditors grounded the fleet.
            </p>
            <button onClick={() => airline.showSetup(true)} className="mt-4 rounded-lg bg-sky-500 px-4 py-2 font-bold hover:bg-sky-400">
              Start a new airline
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
