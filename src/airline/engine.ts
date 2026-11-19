// Airline CEO mode: the simulation. Pure TypeScript, no React or DOM.
//
// You run an airline from a hub airport. Each route links one of your hubs to another city,
// flown by leased planes. Every route has a ticket price tier and a seating tier:
//   - price tier (Basic / Average / Luxury) trades passenger numbers for revenue per ticket
//   - seating tier (Basic / Average / Luxury) trades seats per plane for comfort and costs
// Satisfaction from each route feeds the airline's reputation, which drives demand everywhere.

import { AIRCRAFT, AIRCRAFT_BY_ID, CABIN, CITY, FARE, LEVELS, TIER_NAMES, type AircraftType, type Tier } from "./data";

export const AIRLINE_SAVE_KEY = "airline-ceo-save-v1";

/** game minutes per real second at 1x (one day a minute) */
export const AIRLINE_RATE = 24;
export const START_CASH = 30_000_000;
export const LEASE_DEPOSIT_DAYS = 20;
export const HQ_PER_DAY = 40_000;
export const LOAN_STEP = 20_000_000;
export const LOAN_RATE = 0.005; // per day
export const MAX_LOAN = 100_000_000;
export const BANKRUPT_AT = -50_000_000;
export const MARKETING_COST = 3_000_000;
export const MARKETING_DAYS = 7;
/** hours a day planes can fly (night curfews, maintenance) */
const FLYING_HOURS = 18;

/** how rich you are when you start */
export interface StartPreset {
  id: string;
  name: string;
  blurb: string;
  cash: number;
  loan: number;
  reputation: number;
  /** starting airline level (unlocks planes and hubs) */
  level: number;
}

export const PRESETS: StartPreset[] = [
  { id: "broke", name: "Broke founder", blurb: "Maxed-out credit cards and one turboprop's worth of cash. Every dollar counts.", cash: 4_000_000, loan: 0, reputation: 40, level: 1 },
  { id: "bailout", name: "Bailout", blurb: "You bought a dying airline for $1. It came with a terrible reputation and an $80M loan.", cash: 8_000_000, loan: 80_000_000, reputation: 25, level: 2 },
  { id: "millionaire", name: "Millionaire", blurb: "The classic start: enough for a few routes, not enough for mistakes.", cash: 30_000_000, loan: 0, reputation: 50, level: 1 },
  { id: "multi", name: "Multi-millionaire", blurb: "Serious money. Open a network on day one and grow fast.", cash: 150_000_000, loan: 0, reputation: 55, level: 2 },
  { id: "billionaire", name: "Billionaire", blurb: "Money is no object. 787s unlocked, 3 hubs allowed. Can you still lose it all?", cash: 1_500_000_000, loan: 0, reputation: 60, level: 3 },
];
export const PRESET_BY_ID: Record<string, StartPreset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

export interface Route {
  id: number;
  /** your hub */
  a: string;
  b: string;
  /** planes on this route, by aircraft id */
  planes: Record<string, number>;
  fare: Tier;
  cabin: Tier;
  opened: number;
  /** cabin refit in progress until this time */
  refitUntil: number;
  /** smoothed satisfaction 0..100 */
  satisfaction: number;
}

export interface AirlineEvent {
  id: number;
  time: number;
  text: string;
  kind: "info" | "good" | "bad";
}

export interface DayBook {
  revenue: number;
  costs: number;
  pax: number;
}

export interface AirlineState {
  version: 1;
  name: string;
  color: string;
  hubs: string[];
  cash: number;
  loan: number;
  /** game minutes since the airline was founded */
  time: number;
  routes: Route[];
  /** leased aircraft by type */
  fleet: Record<string, number>;
  reputation: number;
  totalPax: number;
  level: number;
  /** fuel price index (1 = normal) */
  fuel: number;
  storms: { city: string; until: number }[];
  marketingUntil: number;
  today: DayBook;
  /** last 30 days, newest last */
  history: DayBook[];
  events: AirlineEvent[];
  nextId: number;
  bankrupt: boolean;
  preset: string;
}

export interface Result {
  ok: boolean;
  msg: string;
}

// ---------------------------------------------------------------------------
// Geography and money helpers
// ---------------------------------------------------------------------------

export function distanceKm(a: string, b: string): number {
  const p = CITY[a];
  const q = CITY[b];
  const r = Math.PI / 180;
  const dLat = (q.lat - p.lat) * r;
  const dLon = (q.lon - p.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(q.lat * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** average one-way ticket at Average prices */
export function baseFare(km: number): number {
  return 80 + 0.11 * km;
}

/** passengers a day each way across the whole market (all airlines) */
export function marketSize(a: string, b: string): number {
  const p = CITY[a];
  const q = CITY[b];
  const d = distanceKm(a, b);
  const size = Math.sqrt(p.market * q.market * (p.boost ?? 1) * (q.boost ?? 1));
  const shortHop = Math.min(1, 0.3 + d / 600); // people drive short trips
  return (260 * size * shortHop) / Math.pow(1 + d / 4000, 0.7);
}

export function slotFee(city: string): number {
  return Math.round((1_000_000 + CITY[city].market * 120_000) / 100_000) * 100_000;
}

export function hubCost(city: string): number {
  return Math.round((20_000_000 + CITY[city].market * 1_000_000) / 1_000_000) * 1_000_000;
}

export function levelOf(pax: number): number {
  let l = 1;
  for (let i = 1; i < LEVELS.length; i++) if (pax >= LEVELS[i].pax) l = i;
  return l;
}

export function idlePlanes(s: AirlineState, type: string): number {
  let used = 0;
  for (const r of s.routes) used += r.planes[type] ?? 0;
  return (s.fleet[type] ?? 0) - used;
}

export function planesOn(r: Route): number {
  return Object.values(r.planes).reduce((t, n) => t + n, 0);
}

export function stormAt(s: AirlineState, city: string): boolean {
  return s.storms.some((x) => x.city === city && x.until > s.time);
}

// ---------------------------------------------------------------------------
// Route economics
// ---------------------------------------------------------------------------

export interface RouteStats {
  km: number;
  /** one-way flights a day, all planes */
  legsPerDay: number;
  seatsPerDay: number;
  /** passengers a day (both ways) who want to fly with you */
  demandPerDay: number;
  paxPerDay: number;
  load: number;
  fare: number;
  revenuePerDay: number;
  costs: { fuel: number; crew: number; catering: number; fees: number };
  costPerDay: number;
  profitPerDay: number;
  satisfaction: number;
  /** why the route is not flying right now */
  grounded: string;
}

function blockHours(km: number, t: AircraftType): number {
  return km / t.speed + 0.5;
}

/** how attractive the route is to passengers, before seat limits */
function shareOf(s: AirlineState, r: { fare: Tier; cabin: Tier }, legsEachWay: number, sst: number): number {
  const freq = Math.min(1.35, 0.55 + 0.22 * legsEachWay);
  const rep = 0.3 + s.reputation / 70;
  const marketing = s.time < s.marketingUntil ? 1.25 : 1;
  // supersonic jets pull in premium flyers, but only at premium prices with proper seats
  const sstPull = sst > 0 ? (r.fare === 2 && r.cabin >= 1 ? 1 + 0.6 * sst : 1 - 0.5 * sst) : 1;
  return 0.16 * FARE.demand[r.fare] * CABIN.demand[r.cabin] * rep * freq * marketing * sstPull;
}

export function satisfactionFor(fare: Tier, cabin: Tier, hours: number, load: number, sst: number): number {
  let v = 70 + CABIN.comfort[cabin] + FARE.value[fare];
  if (cabin === 0) v -= Math.min(20, hours * 3); // cramped seats hurt on long flights
  if (fare === 2 && cabin === 0) v -= 30; // luxury prices for basic seats: furious
  if (fare === 2 && cabin === 1) v -= 12;
  if (fare === 0 && cabin === 2) v += 6; // a bargain
  if (load > 0.95) v -= 4; // packed full
  if (sst > 0 && cabin >= 1) v += 8 * sst;
  return Math.max(0, Math.min(100, v));
}

export function routeStats(s: AirlineState, r: Route): RouteStats {
  const km = distanceKm(r.a, r.b);
  let legs = 0;
  let seats = 0;
  let fuel = 0;
  let crew = 0;
  let fees = 0;
  let hoursTotal = 0;
  let sstLegs = 0;
  const fuelFactor = 0.5 + 0.5 * s.fuel;
  for (const [id, n] of Object.entries(r.planes)) {
    const t = AIRCRAFT_BY_ID[id];
    if (!t || n <= 0) continue;
    const h = blockHours(km, t);
    const turn = t.seats > 250 ? 1.5 : 1;
    const l = (n * FLYING_HOURS) / (h + turn);
    legs += l;
    seats += l * Math.round(t.seats * CABIN.seats[r.cabin]);
    fuel += l * h * t.hourCost * fuelFactor;
    crew += l * h * CABIN.crew[r.cabin] * (t.seats / 180);
    fees += l * t.fee;
    hoursTotal += l * h;
    if (id === "sst") sstLegs += l;
  }
  const avgHours = legs > 0 ? hoursTotal / legs : km / 800 + 0.5;
  const sst = legs > 0 ? sstLegs / legs : 0;

  let grounded = "";
  if (legs === 0) grounded = "No planes on this route";
  else if (r.refitUntil > s.time) grounded = `Cabin refit until ${clockOf(r.refitUntil)}`;
  else if (stormAt(s, r.a) || stormAt(s, r.b)) grounded = `Storm at ${stormAt(s, r.a) ? r.a : r.b}: flights cancelled`;

  const demand = 2 * marketSize(r.a, r.b) * shareOf(s, r, legs / 2, sst);
  const pax = Math.min(seats * 0.97, demand);
  const load = seats > 0 ? pax / seats : 0;
  const fare = baseFare(km) * FARE.price[r.fare] * (0.8 + s.reputation / 250) * (sst > 0 && r.cabin >= 1 ? 1 + 0.8 * sst : 1);
  const catering = pax * avgHours * CABIN.catering[r.cabin];
  const sat = satisfactionFor(r.fare, r.cabin, avgHours, load, sst);
  const flying = !grounded;
  const revenue = flying ? pax * fare : 0;
  const costs = flying ? { fuel, crew, catering, fees } : { fuel: 0, crew: 0, catering: 0, fees: 0 };
  const costPerDay = costs.fuel + costs.crew + costs.catering + costs.fees;
  return {
    km,
    legsPerDay: legs,
    seatsPerDay: seats,
    demandPerDay: demand,
    paxPerDay: flying ? pax : 0,
    load,
    fare,
    revenuePerDay: revenue,
    costs,
    costPerDay,
    profitPerDay: revenue - costPerDay,
    satisfaction: sat - (grounded && legs > 0 ? 15 : 0),
    grounded,
  };
}

/** what a new route would look like, for the planner */
export function previewRoute(s: AirlineState, a: string, b: string, type: string, fare: Tier, cabin: Tier): RouteStats {
  const r: Route = { id: -1, a, b, planes: { [type]: 1 }, fare, cabin, opened: s.time, refitUntil: 0, satisfaction: 70 };
  return routeStats({ ...s, storms: [] }, r);
}

export function leaseTotal(s: AirlineState): number {
  let t = 0;
  for (const [id, n] of Object.entries(s.fleet)) t += (AIRCRAFT_BY_ID[id]?.leasePerDay ?? 0) * n;
  return t;
}

export interface Totals {
  revenue: number;
  costs: number;
  pax: number;
  overhead: number;
  lease: number;
  interest: number;
  profit: number;
}

/** airline-wide money per day right now */
export function totals(s: AirlineState): Totals {
  let revenue = 0;
  let costs = 0;
  let pax = 0;
  for (const r of s.routes) {
    const st = routeStats(s, r);
    revenue += st.revenuePerDay;
    costs += st.costPerDay;
    pax += st.paxPerDay;
  }
  const overhead = HQ_PER_DAY + revenue * 0.02 + s.hubs.length * 60_000;
  const lease = leaseTotal(s);
  const interest = s.loan * LOAN_RATE;
  return { revenue, costs, pax, overhead, lease, interest, profit: revenue - costs - overhead - lease - interest };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function createAirline(hub: string, name: string, color: string, presetId = "millionaire"): AirlineState {
  const p = PRESET_BY_ID[presetId] ?? PRESET_BY_ID.millionaire;
  const s: AirlineState = {
    version: 1,
    name: name.trim() || `${CITY[hub].name} Air`,
    color,
    hubs: [hub],
    cash: p.cash,
    loan: p.loan,
    time: 6 * 60,
    routes: [],
    fleet: {},
    reputation: p.reputation,
    totalPax: 0,
    level: p.level,
    fuel: 1,
    storms: [],
    marketingUntil: 0,
    today: { revenue: 0, costs: 0, pax: 0 },
    history: [],
    events: [],
    nextId: 1,
    bankrupt: false,
    preset: p.id,
  };
  addEvent(s, `${s.name} is founded at ${CITY[hub].name} (${hub}) with ${money(p.cash)}${p.loan ? ` and ${money(p.loan)} of debt` : ""}.`, "good");
  addEvent(s, "Click a city on the globe to open your first route.", "info");
  return s;
}

export function addEvent(s: AirlineState, text: string, kind: AirlineEvent["kind"] = "info") {
  s.events.push({ id: s.nextId++, time: s.time, text, kind });
  if (s.events.length > 50) s.events.splice(0, s.events.length - 50);
}

export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const trim = (v: number, d: number) => String(parseFloat(v.toFixed(d)));
  if (a >= 1e9) return `${sign}$${trim(a / 1e9, 2)}B`;
  if (a >= 1e6) return `${sign}$${trim(a / 1e6, a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

export function clockOf(t: number): string {
  const day = Math.floor(t / 1440) + 1;
  const m = Math.floor(t % 1440);
  return `Day ${day} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function spend(s: AirlineState, amount: number) {
  s.cash -= amount;
  s.today.costs += amount;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function canFly(type: AircraftType, km: number): boolean {
  return km <= type.rangeKm;
}

export function leaseCost(type: string): number {
  return AIRCRAFT_BY_ID[type].leasePerDay * LEASE_DEPOSIT_DAYS;
}

export function leasePlane(s: AirlineState, type: string): Result {
  const t = AIRCRAFT_BY_ID[type];
  if (!t) return { ok: false, msg: "" };
  if (s.level < t.level) return { ok: false, msg: `${t.short} needs a level ${t.level} airline (${LEVELS[t.level].name})` };
  const deposit = leaseCost(type);
  if (s.cash < deposit) return { ok: false, msg: `Lease deposit is ${money(deposit)}` };
  spend(s, deposit);
  s.fleet[type] = (s.fleet[type] ?? 0) + 1;
  return { ok: true, msg: `Leased an ${t.short}: ${money(t.leasePerDay)} a day` };
}

export function returnPlane(s: AirlineState, type: string): Result {
  if (idlePlanes(s, type) <= 0) return { ok: false, msg: "Take it off a route first" };
  s.fleet[type]--;
  const back = Math.round(leaseCost(type) * 0.5);
  s.cash += back;
  return { ok: true, msg: `Plane returned to the lessor: ${money(back)} of the deposit back` };
}

export function routeBlocker(s: AirlineState, hub: string, dest: string, type: string): string | null {
  if (!s.hubs.includes(hub)) return "Routes have to start at one of your hubs";
  if (hub === dest) return "Pick a different city";
  if (s.routes.some((r) => (r.a === hub && r.b === dest) || (r.a === dest && r.b === hub))) return "You already fly this route";
  const t = AIRCRAFT_BY_ID[type];
  if (!t) return "Pick a plane";
  if (s.level < t.level) return `${t.short} needs a level ${t.level} airline`;
  if (!canFly(t, distanceKm(hub, dest))) return `Too far for the ${t.short} (${Math.round(distanceKm(hub, dest)).toLocaleString("en-US")} km, range ${t.rangeKm.toLocaleString("en-US")} km)`;
  const cost = slotFee(dest) + (idlePlanes(s, type) > 0 ? 0 : leaseCost(type));
  if (s.cash < cost) return `Needs ${money(cost)}`;
  return null;
}

/** open a route, leasing a plane for it if you have none free */
export function openRoute(s: AirlineState, hub: string, dest: string, type: string, fare: Tier, cabin: Tier): Result {
  const why = routeBlocker(s, hub, dest, type);
  if (why) return { ok: false, msg: why };
  if (idlePlanes(s, type) <= 0) leasePlane(s, type);
  spend(s, slotFee(dest));
  const r: Route = {
    id: s.nextId++,
    a: hub,
    b: dest,
    planes: { [type]: 1 },
    fare,
    cabin,
    opened: s.time,
    refitUntil: 0,
    satisfaction: 70,
  };
  r.satisfaction = routeStats(s, r).satisfaction;
  s.routes.push(r);
  addEvent(s, `New route: ${hub} ⇄ ${dest} with an ${AIRCRAFT_BY_ID[type].short} (${TIER_NAMES[fare]} prices, ${TIER_NAMES[cabin]} seats)`, "good");
  return { ok: true, msg: `${hub} ⇄ ${dest} is open` };
}

export function closeRoute(s: AirlineState, id: number): Result {
  const r = s.routes.find((x) => x.id === id);
  if (!r) return { ok: false, msg: "" };
  s.routes = s.routes.filter((x) => x.id !== id);
  addEvent(s, `Route ${r.a} ⇄ ${r.b} closed. Its planes are free for other routes.`, "info");
  return { ok: true, msg: `${r.a} ⇄ ${r.b} closed` };
}

/** put another plane on a route (leases one if none of that type is free) */
export function addPlane(s: AirlineState, id: number, type: string): Result {
  const r = s.routes.find((x) => x.id === id);
  const t = AIRCRAFT_BY_ID[type];
  if (!r || !t) return { ok: false, msg: "" };
  if (!canFly(t, distanceKm(r.a, r.b))) return { ok: false, msg: `Too far for the ${t.short}` };
  if (idlePlanes(s, type) <= 0) {
    const res = leasePlane(s, type);
    if (!res.ok) return res;
  }
  // new planes arrive in the route's current seat layout
  r.planes[type] = (r.planes[type] ?? 0) + 1;
  return { ok: true, msg: `Another ${t.short} on ${r.a} ⇄ ${r.b}` };
}

export function removePlane(s: AirlineState, id: number, type: string): Result {
  const r = s.routes.find((x) => x.id === id);
  if (!r || !(r.planes[type] > 0)) return { ok: false, msg: "" };
  if (planesOn(r) <= 1) return { ok: false, msg: "A route needs at least one plane (close the route instead)" };
  r.planes[type]--;
  if (r.planes[type] === 0) delete r.planes[type];
  return { ok: true, msg: `${AIRCRAFT_BY_ID[type].short} taken off ${r.a} ⇄ ${r.b} (now idle)` };
}

export function setFare(s: AirlineState, id: number, fare: Tier): Result {
  const r = s.routes.find((x) => x.id === id);
  if (!r) return { ok: false, msg: "" };
  r.fare = fare;
  return { ok: true, msg: `${r.a} ⇄ ${r.b}: ${TIER_NAMES[fare]} prices` };
}

export function refitCost(r: Route, cabin: Tier): number {
  return planesOn(r) * CABIN.refit[cabin];
}

/** change the seat layout: costs money per plane and grounds the route for 12 hours */
export function setCabin(s: AirlineState, id: number, cabin: Tier): Result {
  const r = s.routes.find((x) => x.id === id);
  if (!r) return { ok: false, msg: "" };
  if (r.cabin === cabin) return { ok: false, msg: "" };
  const cost = refitCost(r, cabin);
  if (s.cash < cost) return { ok: false, msg: `Refit costs ${money(cost)}` };
  spend(s, cost);
  r.cabin = cabin;
  r.refitUntil = s.time + 12 * 60;
  return { ok: true, msg: `Refitting ${r.a} ⇄ ${r.b} to ${TIER_NAMES[cabin]} seats: ${money(cost)}, back in 12h` };
}

export function hubBlocker(s: AirlineState, city: string): string | null {
  if (s.hubs.includes(city)) return "Already a hub";
  if (!s.routes.some((r) => r.b === city || r.a === city)) return "Fly there first, then you can base planes there";
  const max = LEVELS[s.level].hubs;
  if (s.hubs.length >= max) return `A ${LEVELS[s.level].name} can run ${max} hub${max === 1 ? "" : "s"}. Grow to unlock more.`;
  if (s.cash < hubCost(city)) return `Needs ${money(hubCost(city))}`;
  return null;
}

export function openHub(s: AirlineState, city: string): Result {
  const why = hubBlocker(s, city);
  if (why) return { ok: false, msg: why };
  spend(s, hubCost(city));
  s.hubs.push(city);
  addEvent(s, `New hub at ${CITY[city].name}: you can now start routes from ${city}.`, "good");
  return { ok: true, msg: `${city} is now a hub` };
}

export function takeLoan(s: AirlineState): Result {
  if (s.loan + LOAN_STEP > Math.max(MAX_LOAN, s.loan)) return { ok: false, msg: `The bank stops at ${money(MAX_LOAN)}` };
  s.loan += LOAN_STEP;
  s.cash += LOAN_STEP;
  return { ok: true, msg: `Borrowed ${money(LOAN_STEP)} at ${LOAN_RATE * 100}% a day` };
}

export function repayLoan(s: AirlineState): Result {
  if (s.loan <= 0) return { ok: false, msg: "No loan" };
  const amt = Math.min(LOAN_STEP, s.loan);
  if (s.cash < amt) return { ok: false, msg: "Not enough cash" };
  s.cash -= amt;
  s.loan -= amt;
  return { ok: true, msg: `Repaid ${money(amt)}` };
}

export function runMarketing(s: AirlineState): Result {
  if (s.time < s.marketingUntil) return { ok: false, msg: "A campaign is already running" };
  if (s.cash < MARKETING_COST) return { ok: false, msg: `Needs ${money(MARKETING_COST)}` };
  spend(s, MARKETING_COST);
  s.marketingUntil = s.time + MARKETING_DAYS * 1440;
  return { ok: true, msg: `Ad campaign: +25% passengers on every route for ${MARKETING_DAYS} days` };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** advance by dt game minutes */
export function step(s: AirlineState, dt: number) {
  if (s.bankrupt) return;
  const before = s.time;
  s.time += dt;
  const f = dt / 1440;

  // storms: each city gets roughly one every ten days
  if (Math.floor(before / 60) !== Math.floor(s.time / 60)) {
    s.storms = s.storms.filter((x) => x.until > s.time);
    for (const code of Object.keys(CITY)) {
      if (Math.random() < 0.004 && !stormAt(s, code)) {
        const hours = 3 + Math.floor(Math.random() * 7);
        s.storms.push({ city: code, until: s.time + hours * 60 });
        if (s.routes.some((r) => r.a === code || r.b === code))
          addEvent(s, `Storm at ${CITY[code].name}: flights cancelled for about ${hours}h.`, "bad");
      }
    }
  }

  // money and passengers
  let revenue = 0;
  let costs = 0;
  let pax = 0;
  let satWeighted = 0;
  let weight = 0;
  for (const r of s.routes) {
    const st = routeStats(s, r);
    revenue += st.revenuePerDay;
    costs += st.costPerDay;
    pax += st.paxPerDay;
    r.satisfaction += (st.satisfaction - r.satisfaction) * Math.min(1, f * 4);
    satWeighted += r.satisfaction * Math.max(1, st.paxPerDay);
    weight += Math.max(1, st.paxPerDay);
  }
  const fixed = HQ_PER_DAY + revenue * 0.02 + s.hubs.length * 60_000 + leaseTotal(s) + s.loan * LOAN_RATE;
  s.cash += (revenue - costs - fixed) * f;
  s.today.revenue += revenue * f;
  s.today.costs += (costs + fixed) * f;
  s.today.pax += pax * f;
  s.totalPax += pax * f;

  // reputation drifts toward how happy your passengers are
  if (s.routes.length > 0) {
    const target = satWeighted / weight;
    s.reputation += (target - s.reputation) * Math.min(1, f * 0.15);
  }

  // new day
  if (Math.floor(before / 1440) !== Math.floor(s.time / 1440)) newDay(s);

  const lvl = levelOf(s.totalPax);
  if (lvl > s.level) {
    s.level = lvl;
    const unlocked = AIRCRAFT.filter((a) => a.level === lvl).map((a) => a.short);
    addEvent(
      s,
      `You're now a ${LEVELS[lvl].name}! ${unlocked.length ? `Unlocked: ${unlocked.join(", ")}. ` : ""}You can run ${LEVELS[lvl].hubs} hubs.`,
      "good",
    );
  }

  if (s.cash < BANKRUPT_AT) {
    s.bankrupt = true;
    addEvent(s, "Bankrupt. The creditors have grounded the fleet.", "bad");
  }
}

function newDay(s: AirlineState) {
  s.history.push(s.today);
  if (s.history.length > 30) s.history.shift();
  const y = s.today;
  s.today = { revenue: 0, costs: 0, pax: 0 };
  // fuel prices wander
  s.fuel = Math.max(0.7, Math.min(1.6, s.fuel * (1 + (Math.random() - 0.5) * 0.08)));
  if (Math.random() < 0.06) {
    const jump = Math.random() < 0.5 ? 1.15 : 0.88;
    s.fuel = Math.max(0.7, Math.min(1.6, s.fuel * jump));
    addEvent(s, jump > 1 ? "Oil shock: fuel prices jump 15%." : "Fuel prices drop 12%.", jump > 1 ? "bad" : "good");
  }
  if (s.routes.length > 0)
    addEvent(s, `Yesterday: ${Math.round(y.pax).toLocaleString("en-US")} passengers, profit ${money(y.revenue - y.costs)}.`, y.revenue >= y.costs ? "info" : "bad");
  if (s.cash < 0) addEvent(s, `Cash is negative. Bankrupt below ${money(BANKRUPT_AT)}.`, "bad");
}

// ---------------------------------------------------------------------------
// Save / load
// ---------------------------------------------------------------------------

export function saveAirline(s: AirlineState): boolean {
  try {
    localStorage.setItem(AIRLINE_SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function loadAirline(): AirlineState | null {
  try {
    const raw = localStorage.getItem(AIRLINE_SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AirlineState;
    if (s.version !== 1 || !Array.isArray(s.routes) || !s.hubs?.length) return null;
    s.preset ??= "millionaire";
    return s;
  } catch {
    return null;
  }
}

export function clearAirline() {
  try {
    localStorage.removeItem(AIRLINE_SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}
