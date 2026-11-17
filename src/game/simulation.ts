// The simulation engine: state creation, the fixed-step update, and player actions.
// Pure TypeScript with no DOM access, so it can run headless (see scripts/sim-test.ts).

import { getAnalysis, TIER_UNLOCKS, tierRequirements } from "./analysis";
import {
  AIRLINE_NAMES,
  AIRLINES,
  BUILD,
  BUS_CAPACITY,
  BUS_DWELL,
  BUS_SPEED,
  CITIES,
  DRIVER_HIRE_COST,
  DRIVER_WAGE,
  FEES,
  GATE_SIZE,
  GRID_H,
  GRID_W,
  HOLD_LIMIT,
  HOURLY_DEMAND,
  LATE_LIMIT,
  LEAD_TIME,
  LOAN_RATE,
  LOAN_STEP,
  MARKETING_BOOST,
  MARKETING_COST,
  MARKETING_HOURS,
  MAX_CONTRACTS,
  OFFER_REFRESH,
  ON_TIME_GRACE,
  OVERDRAFT_RATE,
  PARKING_FEE,
  PLANES,
  REFUND_RATE,
  SERVICE_TIME,
  SNOW_CREW_HIRE,
  SNOW_CREW_WAGE,
  SPAWN_WINDOW,
  START_TIME,
  TAXI_SPEED,
  TIER_DEMAND,
  TIER_NAMES,
  WALK_SPEED,
} from "./constants";
import { derivePath, distanceField, distFrom, fieldTo, taxiPath } from "./pathfinding";
import { runHas, runHeadingDir, runIdx, runProgress, runStart } from "./runways";
import type { Analysis, Contract, Flight, GameState, Passenger, PlaneClass, RunwayRun, StepKind, TileType } from "./types";
import { currentWeather, initWeather, runwayBlock, runwayDir, updateWeather, WEATHER } from "./weather";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function createEmptyState(money = 60000): GameState {
  const tiles = [];
  for (let i = 0; i < GRID_W * GRID_H; i++) tiles.push({ type: "empty" as TileType, level: 1 });
  return {
    w: GRID_W,
    h: GRID_H,
    tiles,
    version: 1,
    money,
    time: START_TIME,
    tier: 1,
    served: 0,
    satisfaction: 90,
    drivers: 0,
    marketingUntil: 0,
    demandTokens: 20,
    passengers: [],
    flights: [],
    buses: [],
    facilities: {},
    gateFlight: {},
    gateCooldown: {},
    gateNote: {},
    runwayLocks: {},
    name: "My Airport",
    labels: [],
    nextId: 1,
    nextSchedule: START_TIME,
    nextHour: START_TIME + 60,
    incomeThisHour: 0,
    expenseThisHour: 0,
    incomeLastHour: 0,
    expenseLastHour: 0,
    flightsHandled: 0,
    missedFlights: 0,
    events: [],
    contractOffers: [],
    contracts: [],
    nextOffer: START_TIME,
    contractsCompleted: 0,
    climate: "temperate",
    forecast: [],
    snowCrews: 0,
    calmUntil: 0,
    snowCover: 0,
    loan: 0,
    fees: 1,
    otp: 92,
    diversions: 0,
    bankrupt: false,
    scenarioId: "blank",
  };
}

/** call after changing the climate of a fresh state */
export function resetWeather(s: GameState) {
  initWeather(s);
}

/** a runway is free when nobody is on it or on any runway that crosses it */
function runwayFree(s: GameState, r: RunwayRun): boolean {
  if (s.runwayLocks[r.key] !== undefined) return false;
  for (const k of r.crosses) if (s.runwayLocks[k] !== undefined) return false;
  return true;
}

function unlockRunway(s: GameState, f: Flight) {
  if (f.run && s.runwayLocks[f.run.key] === f.id) delete s.runwayLocks[f.run.key];
  f.onRunway = false;
}

export function addEvent(s: GameState, text: string, kind: "info" | "good" | "bad" = "info") {
  s.events.push({ id: s.nextId++, time: s.time, text, kind });
  if (s.events.length > 40) s.events.splice(0, s.events.length - 40);
}

function earn(s: GameState, amount: number) {
  s.money += amount;
  s.incomeThisHour += amount;
}

/** landing fees and ticket commissions scale with the airport's fee level */
function earnFee(s: GameState, amount: number) {
  earn(s, amount * FEES[s.fees].revenue);
}

function spend(s: GameState, amount: number) {
  s.money -= amount;
  s.expenseThisHour += amount;
}

function recordDeparture(s: GameState, onTime: boolean) {
  s.otp += ((onTime ? 100 : 0) - s.otp) * 0.04;
}

function rate(s: GameState, rating: number) {
  s.satisfaction += (rating - s.satisfaction) * 0.04;
  if (s.satisfaction < 0) s.satisfaction = 0;
  if (s.satisfaction > 100) s.satisfaction = 100;
}

function ratingOf(p: Passenger): number {
  return Math.max(10, 100 - p.wait * 3);
}

export interface DemandParts {
  base: number;
  satisfaction: number;
  onTime: number;
  timeOfDay: number;
  fees: number;
  marketing: number;
  growth: number;
  total: number;
}

export function demandParts(s: GameState): DemandParts {
  const base = TIER_DEMAND[s.tier];
  const satisfaction = 0.45 + 0.55 * (s.satisfaction / 100);
  // airlines and travellers drift away from an airport that runs late
  const onTime = 0.7 + 0.3 * (s.otp / 100);
  const timeOfDay = HOURLY_DEMAND[Math.floor(s.time / 60) % 24];
  const fees = FEES[s.fees].demand;
  const marketing = s.time < s.marketingUntil ? MARKETING_BOOST : 1;
  // word of mouth: a busy airport keeps attracting more travellers
  const growth = 1 + Math.min(1, s.served / 30000);
  return {
    base,
    satisfaction,
    onTime,
    timeOfDay,
    fees,
    marketing,
    growth,
    total: base * satisfaction * onTime * timeOfDay * fees * marketing * growth,
  };
}

export function currentDemand(s: GameState): number {
  return demandParts(s).total;
}

export function hourlyUpkeep(s: GameState): number {
  let total = s.drivers * DRIVER_WAGE + s.snowCrews * SNOW_CREW_WAGE;
  for (const t of s.tiles) {
    if (t.type === "empty") continue;
    const up = BUILD[t.type].upkeep;
    total += up[Math.min(t.level, up.length) - 1];
  }
  return total;
}

export function parkingUsed(s: GameState): number {
  let used = 0;
  for (const p of s.passengers) if (p.kind === "dep" && !p.dead && !p.missed) used++;
  for (const f of s.flights) used += f.depBooked - f.depSpawned;
  return used;
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

export interface ActionResult {
  ok: boolean;
  msg: string;
}

const ON_FLOOR: TileType[] = ["checkin", "tsa", "customs", "gate"];

export function buildBlocker(s: GameState, idx: number, type: Exclude<TileType, "empty">): string | null {
  const t = s.tiles[idx];
  if (t.type === type) return "Already built here";
  if (t.type !== "empty" && !(t.type === "floor" && ON_FLOOR.includes(type))) return "Tile is occupied";
  if (s.money < BUILD[type].cost[0]) return s.money < 0 ? "Overdrawn: take a loan or cut costs" : "Not enough money";
  return null;
}

export function build(s: GameState, idx: number, type: Exclude<TileType, "empty">): ActionResult {
  const why = buildBlocker(s, idx, type);
  if (why) return { ok: false, msg: why };
  const cost = BUILD[type].cost[0];
  s.money -= cost;
  s.expenseThisHour += cost;
  s.tiles[idx] = { type, level: 1 };
  s.version++;
  return { ok: true, msg: "" };
}

export function demolish(s: GameState, idx: number): ActionResult {
  const t = s.tiles[idx];
  if (t.type === "empty") return { ok: false, msg: "" };
  if (t.type === "gate" && s.gateFlight[idx] !== undefined) return { ok: false, msg: "Gate in use by a flight" };
  const def = BUILD[t.type];
  let invested = 0;
  for (let l = 0; l < t.level; l++) invested += def.cost[l] ?? 0;
  s.money += Math.round(invested * REFUND_RATE);
  s.tiles[idx] = { type: "empty", level: 1 };
  delete s.facilities[idx];
  delete s.gateCooldown[idx];
  delete s.gateNote[idx];
  s.version++;
  return { ok: true, msg: "" };
}

export function upgrade(s: GameState, idx: number): ActionResult {
  const t = s.tiles[idx];
  if (t.type === "empty") return { ok: false, msg: "" };
  const def = BUILD[t.type];
  if (def.maxLevel === 1) return { ok: false, msg: `${def.name} can't be upgraded` };
  if (t.level >= def.maxLevel) return { ok: false, msg: "Already max level" };
  const cost = def.cost[t.level];
  if (s.money < cost) return { ok: false, msg: `Need $${cost.toLocaleString()}` };
  s.money -= cost;
  s.expenseThisHour += cost;
  t.level++;
  s.version++;
  const label = t.type === "gate" ? `${GATE_SIZE[t.level]} Gate` : `${def.name} L${t.level}`;
  return { ok: true, msg: `Upgraded to ${label}` };
}

export function hireDriver(s: GameState): ActionResult {
  if (s.drivers >= 6) return { ok: false, msg: "Max 6 buses" };
  if (s.money < DRIVER_HIRE_COST) return { ok: false, msg: "Not enough money" };
  s.money -= DRIVER_HIRE_COST;
  s.expenseThisHour += DRIVER_HIRE_COST;
  s.drivers++;
  s.version++;
  return { ok: true, msg: "Shuttle driver hired" };
}

export function fireDriver(s: GameState): ActionResult {
  if (s.drivers <= 0) return { ok: false, msg: "No drivers to dismiss" };
  s.drivers--;
  s.version++;
  return { ok: true, msg: "Shuttle driver dismissed" };
}

export function hireSnowCrew(s: GameState): ActionResult {
  if (s.snowCrews >= 6) return { ok: false, msg: "Max 6 snow crews" };
  if (s.money < SNOW_CREW_HIRE) return { ok: false, msg: "Not enough money" };
  spend(s, SNOW_CREW_HIRE);
  s.snowCrews++;
  return { ok: true, msg: `Snow crew hired: ${s.snowCrews} runway${s.snowCrews === 1 ? "" : "s"} kept clear in snow` };
}

export function fireSnowCrew(s: GameState): ActionResult {
  if (s.snowCrews <= 0) return { ok: false, msg: "No snow crews to dismiss" };
  s.snowCrews--;
  return { ok: true, msg: "Snow crew dismissed" };
}

function roundTo(n: number, step: number) {
  return Math.max(step, Math.round(n / step) * step);
}

/** biggest loan the bank will give this airport */
export function maxLoan(s: GameState): number {
  return roundTo(30000 + 16 * hourlyUpkeep(s), LOAN_STEP);
}

/** the airport goes bankrupt when its balance drops below this */
export function bankruptAt(s: GameState): number {
  return -roundTo(15000 + 8 * hourlyUpkeep(s), 5000);
}

export function takeLoan(s: GameState): ActionResult {
  if (s.loan + LOAN_STEP > maxLoan(s))
    return { ok: false, msg: `The bank's limit is $${maxLoan(s).toLocaleString()} for an airport this size` };
  s.loan += LOAN_STEP;
  s.money += LOAN_STEP;
  return { ok: true, msg: `Borrowed $${LOAN_STEP.toLocaleString()} at ${LOAN_RATE * 100}% a day` };
}

export function repayLoan(s: GameState): ActionResult {
  if (s.loan <= 0) return { ok: false, msg: "No loan to repay" };
  const amount = Math.min(LOAN_STEP, s.loan);
  if (s.money < amount) return { ok: false, msg: "Not enough money" };
  s.loan -= amount;
  s.money -= amount;
  return { ok: true, msg: s.loan > 0 ? `Repaid $${amount.toLocaleString()}` : "Loan fully repaid" };
}

export function setFees(s: GameState, level: number): ActionResult {
  if (level < 0 || level >= FEES.length) return { ok: false, msg: "" };
  s.fees = level;
  const f = FEES[level];
  return { ok: true, msg: `${f.name} fees: ${Math.round(f.revenue * 100)}% revenue, ${Math.round(f.demand * 100)}% demand` };
}

export function runMarketing(s: GameState): ActionResult {
  if (s.time < s.marketingUntil) return { ok: false, msg: "Campaign already running" };
  if (s.money < MARKETING_COST) return { ok: false, msg: "Not enough money" };
  s.money -= MARKETING_COST;
  s.expenseThisHour += MARKETING_COST;
  s.marketingUntil = s.time + MARKETING_HOURS * 60;
  return { ok: true, msg: "Marketing campaign launched: +35% demand for 12h" };
}

// ---------------------------------------------------------------------------
// Passengers
// ---------------------------------------------------------------------------

function spawnPassenger(s: GameState, kind: "dep" | "arr", flightId: number, tile: number, plan: StepKind[]): Passenger {
  const p: Passenger = {
    id: s.nextId++,
    kind,
    flightId,
    x: tile % s.w,
    y: Math.floor(tile / s.w),
    tile,
    plan,
    step: 0,
    state: "idle",
    path: [],
    pathIdx: 0,
    pathVersion: s.version,
    target: -1,
    wait: 0,
    stuck: 0,
    retryAt: 0,
    busDest: -1,
    queueIndex: 0,
    missed: false,
    dead: false,
    ox: (Math.random() - 0.5) * 0.5,
    oy: (Math.random() - 0.5) * 0.5,
  };
  s.passengers.push(p);
  return p;
}

function missFlight(s: GameState, p: Passenger) {
  if (!p.missed) {
    p.missed = true;
    rate(s, 0);
  }
  p.plan = ["exit"];
  p.step = 0;
  p.state = "idle";
  p.stuck = 0;
}

function retryLater(s: GameState, p: Passenger) {
  p.retryAt = s.time + 1.5;
  p.stuck += 1.5;
  p.wait += 1.5;
  if (p.stuck > 45) {
    // hopelessly lost: they give up and go home angry
    if (!p.missed) rate(s, 0);
    p.dead = true;
  }
}

function planPassenger(s: GameState, a: Analysis, p: Passenger, flights: Map<number, Flight>) {
  if (s.time < p.retryAt) return;
  if (p.step >= p.plan.length) {
    p.dead = true;
    return;
  }
  const kind = p.plan[p.step];
  let field: Float64Array | null = null;
  let target = -1;

  if (kind === "gate") {
    const f = flights.get(p.flightId);
    if (!f) return missFlight(s, p);
    field = fieldTo(s, f.gate);
    target = f.gate;
  } else if (kind === "exit") {
    if (a.parking.length > 0) field = distanceField(s, "exit", a.parking);
    target = -2;
  } else {
    const list = kind === "checkin" ? a.checkins : kind === "tsa" ? a.tsas : a.customs;
    if (kind === "customs" && list.length === 0) {
      p.step++;
      return;
    }
    const f = p.kind === "dep" ? flights.get(p.flightId) : undefined;
    if (p.kind === "dep" && !f) return missFlight(s, p);
    // where this passenger heads after the desk: their gate, or the exit
    const gateField = f ? fieldTo(s, f.gate) : null;
    const onward = gateField ?? (a.parking.length > 0 ? distanceField(s, "exit", a.parking) : null);
    let bestScore = Infinity;
    for (const c of list) {
      if (gateField && !isFinite(gateField[c])) continue;
      const fld = fieldTo(s, c);
      const d = distFrom(s, fld, p.tile);
      if (!isFinite(d)) continue;
      const q = s.facilities[c]?.queue.length ?? 0;
      const svc = SERVICE_TIME[kind][s.tiles[c].level - 1];
      const after = onward && isFinite(onward[c]) ? onward[c] : 0;
      const score = d + after + q * svc * WALK_SPEED;
      if (score < bestScore) {
        bestScore = score;
        field = fld;
        target = c;
      }
    }
  }

  if (!field) return retryLater(s, p);
  const path = derivePath(s, field, p.tile);
  if (!path) return retryLater(s, p);
  p.path = path;
  p.pathIdx = 0;
  p.pathVersion = s.version;
  p.target = target;
  p.stuck = 0;
  if (path.length === 0) arrive(s, p);
  else p.state = "walk";
}

function arrive(s: GameState, p: Passenger) {
  const kind = p.plan[p.step];
  if (kind === "gate") {
    p.state = "atGate";
  } else if (kind === "exit") {
    p.dead = true;
    if (!p.missed) {
      s.served++;
      rate(s, ratingOf(p));
      earn(s, PARKING_FEE);
    }
  } else {
    const idx = p.tile;
    const fac = s.facilities[idx] ?? (s.facilities[idx] = { queue: [], progress: 0 });
    fac.queue.push(p.id);
    p.target = idx;
    p.state = "queue";
  }
}

function updatePassengers(s: GameState, a: Analysis, dt: number, flights: Map<number, Flight>) {
  for (const p of s.passengers) {
    if (p.dead) continue;
    switch (p.state) {
      case "idle":
        planPassenger(s, a, p, flights);
        break;
      case "walk": {
        if (p.pathVersion !== s.version) {
          p.state = "idle";
          break;
        }
        let remaining = WALK_SPEED * dt;
        while (remaining > 0) {
          const node = p.path[p.pathIdx];
          if (node.ride) {
            p.state = "waitBus";
            p.busDest = node.idx;
            break;
          }
          const tx = node.idx % s.w;
          const ty = (node.idx - tx) / s.w;
          const dx = tx - p.x;
          const dy = ty - p.y;
          const d = Math.hypot(dx, dy);
          if (d <= remaining) {
            p.x = tx;
            p.y = ty;
            p.tile = node.idx;
            remaining -= d;
            p.pathIdx++;
            if (p.pathIdx >= p.path.length) {
              arrive(s, p);
              break;
            }
          } else {
            p.x += (dx / d) * remaining;
            p.y += (dy / d) * remaining;
            remaining = 0;
          }
        }
        break;
      }
      case "waitBus":
        p.wait += dt;
        if (p.pathVersion !== s.version || !a.shuttleActive) p.state = "idle";
        break;
      case "queue":
        p.wait += dt;
        if (s.facilities[p.target] === undefined) p.state = "idle";
        break;
      case "atGate": {
        if (p.kind !== "dep") break;
        const f = flights.get(p.flightId);
        if (!f) missFlight(s, p);
        else if (s.time > f.schedDep) p.wait += dt * 0.5; // delayed
        break;
      }
      default:
        break;
    }
  }
}

function updateFacilities(s: GameState, dt: number, byId: Map<number, Passenger>) {
  for (const key of Object.keys(s.facilities)) {
    const idx = Number(key);
    const t = s.tiles[idx];
    if (t.type !== "checkin" && t.type !== "tsa" && t.type !== "customs") {
      delete s.facilities[idx];
      continue;
    }
    const fac = s.facilities[idx];
    fac.queue = fac.queue.filter((id) => {
      const p = byId.get(id);
      return !!p && !p.dead && p.state === "queue" && p.target === idx;
    });
    if (fac.queue.length === 0) {
      fac.progress = 0;
      continue;
    }
    const svc = SERVICE_TIME[t.type][t.level - 1];
    fac.progress += dt;
    while (fac.progress >= svc && fac.queue.length > 0) {
      fac.progress -= svc;
      const p = byId.get(fac.queue.shift() as number);
      if (p) {
        p.step++;
        p.state = "idle";
        p.stuck = 0;
        p.retryAt = 0;
      }
    }
    fac.queue.forEach((id, i) => {
      const p = byId.get(id);
      if (p) p.queueIndex = i;
    });
  }
}

// ---------------------------------------------------------------------------
// Shuttle buses
// ---------------------------------------------------------------------------

function updateBuses(s: GameState, a: Analysis, dt: number, byId: Map<number, Passenger>) {
  const want = a.shuttleActive ? s.drivers : 0;
  const dropAt = (id: number, stop: number) => {
    const p = byId.get(id);
    if (!p || p.dead) return;
    p.tile = stop;
    p.x = stop % s.w;
    p.y = Math.floor(stop / s.w);
    p.state = "idle";
    p.retryAt = 0;
  };
  while (s.buses.length > want) {
    const b = s.buses.pop();
    if (b) for (const id of b.riders) dropAt(id, b.lastStop);
  }
  while (s.buses.length < want) {
    const stop = a.stops[s.buses.length % a.stops.length];
    s.buses.push({ x: stop % s.w, y: Math.floor(stop / s.w), target: stop, lastStop: stop, dwell: BUS_DWELL, riders: [] });
  }
  for (const b of s.buses) {
    if (s.tiles[b.target].type !== "shuttle") b.target = a.stops[0];
    if (b.dwell > 0) {
      b.dwell -= dt;
      if (b.dwell <= 0) {
        const i = a.stops.indexOf(b.target);
        b.target = a.stops[(i + 1) % a.stops.length];
      }
    } else {
      const tx = b.target % s.w;
      const ty = Math.floor(b.target / s.w);
      const dx = tx - b.x;
      const dy = ty - b.y;
      const d = Math.hypot(dx, dy);
      const move = BUS_SPEED * dt;
      if (d <= move) {
        b.x = tx;
        b.y = ty;
        b.lastStop = b.target;
        b.dwell = BUS_DWELL;
        const stop = b.target;
        const keep: number[] = [];
        for (const id of b.riders) {
          const p = byId.get(id);
          if (!p || p.dead) continue;
          if (p.busDest === stop || p.pathVersion !== s.version) dropAt(id, stop);
          else keep.push(id);
        }
        b.riders = keep;
        for (const p of s.passengers) {
          if (b.riders.length >= BUS_CAPACITY) break;
          if (p.dead || p.state !== "waitBus" || p.tile !== stop) continue;
          p.state = "onBus";
          b.riders.push(p.id);
        }
      } else {
        b.x += (dx / d) * move;
        b.y += (dy / d) * move;
      }
    }
    for (const id of b.riders) {
      const p = byId.get(id);
      if (p) {
        p.x = b.x;
        p.y = b.y;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------------

const CLASS_WEIGHT = [1, 1.6, 2.2, 2.4, 0.4];

function scheduleFlights(s: GameState, a: Analysis) {
  let used = parkingUsed(s);
  for (const g of a.gates) {
    if (!g.functional || g.classes.length === 0) continue;
    if (s.gateFlight[g.idx] !== undefined) continue;
    if (s.time < (s.gateCooldown[g.idx] ?? 0)) {
      s.gateNote[g.idx] = "Turnaround break";
      continue;
    }
    // airlines won't book flights into a weather closure that will still be going on when they arrive
    const wx = currentWeather(s);
    const allowed = g.classes.filter(
      (c) =>
        PLANES[c].tier <= s.tier &&
        (wx.end < s.time + LEAD_TIME || g.runways.some((r) => r.len >= PLANES[c].minRunway && !runwayBlock(s, a, r, c, true))),
    );
    if (allowed.length === 0) {
      if (g.classes.length > 0) s.gateNote[g.idx] = `Airlines holding off: ${WEATHER[wx.kind].name.toLowerCase()}`;
      continue;
    }
    const free = a.parkingSpots - used;
    let created = false;

    // contract flights come first: the airline guarantees the passengers
    const contract = s.contracts.find(
      (c) => allowed.includes(c.cls) && c.done + contractFlightsInProgress(s, c.id) < c.flights,
    );
    if (contract) {
      const def = PLANES[contract.cls];
      const booked = Math.min(Math.round(def.seats * (0.8 + 0.2 * Math.random())), free);
      if (booked >= Math.ceil(def.seats * 0.35)) {
        createFlight(s, g.idx, g.stand, contract.cls, booked, contract);
        s.demandTokens = Math.max(0, s.demandTokens - booked);
        used += booked;
        delete s.gateNote[g.idx];
        continue;
      }
    }

    // airlines prefer the biggest plane the gate takes; supersonic flights are rare
    let r = Math.random() * allowed.reduce((t, c) => t + CLASS_WEIGHT[c], 0);
    let first = allowed[allowed.length - 1];
    for (const c of allowed) {
      r -= CLASS_WEIGHT[c];
      if (r <= 0) {
        first = c;
        break;
      }
    }
    const order = [first, ...allowed.filter((c) => c !== first).sort((p, q) => PLANES[q].seats - PLANES[p].seats)];
    for (const c of order) {
      const def = PLANES[c];
      const want = Math.round(def.seats * (0.7 + 0.3 * Math.random()));
      const booked = Math.min(want, free, Math.floor(s.demandTokens));
      if (booked < Math.ceil(def.seats * 0.35)) continue;
      createFlight(s, g.idx, g.stand, c as PlaneClass, booked);
      s.demandTokens -= booked;
      used += booked;
      created = true;
      delete s.gateNote[g.idx];
      break;
    }
    if (!created) {
      s.gateNote[g.idx] =
        free < Math.ceil(PLANES[0].seats * 0.35) ? "Parking full: add more spots" : "Waiting for passenger demand";
    }
  }
}

function createFlight(s: GameState, gate: number, stand: number, cls: PlaneClass, booked: number, contract?: Contract) {
  const def = PLANES[cls];
  const spawnTimes: number[] = [];
  for (let i = 0; i < booked; i++) spawnTimes.push(s.time + Math.random() * SPAWN_WINDOW);
  spawnTimes.sort((x, y) => x - y);
  const cities = CITIES[cls];
  const arriveAt = s.time + LEAD_TIME + Math.random() * 6;
  const f: Flight = {
    id: s.nextId++,
    code:
      (contract ? contract.airline : AIRLINES[Math.floor(Math.random() * AIRLINES.length)]) +
      " " +
      (100 + Math.floor(Math.random() * 900)),
    city: cities[Math.floor(Math.random() * cities.length)],
    cls,
    gate,
    stand,
    state: "scheduled",
    x: -100,
    y: -100,
    heading: 0,
    speed: 0,
    path: [],
    pathIdx: 0,
    arriveAt,
    departAt: 0,
    schedDep: arriveAt + 15 + def.ground,
    depBooked: booked,
    depSpawned: 0,
    spawnTimes,
    boarded: 0,
    arrTotal: Math.round(def.seats * (0.6 + 0.4 * Math.random())),
    arrLeft: 0,
    timer: 0,
    run: null,
    dir: 1,
    holding: 0,
    holdReason: "",
    onRunway: false,
    done: false,
    contractId: contract ? contract.id : 0,
  };
  f.arrLeft = f.arrTotal;
  s.flights.push(f);
  s.gateFlight[gate] = f.id;
}

function releaseGate(s: GameState, f: Flight) {
  if (s.gateFlight[f.gate] === f.id) {
    delete s.gateFlight[f.gate];
    s.gateCooldown[f.gate] = s.time + 4 + Math.random() * 8;
  }
}

function cancelFlight(s: GameState, f: Flight, why: string) {
  f.done = true;
  f.depBooked = f.depSpawned;
  f.spawnTimes = [];
  unlockRunway(s, f);
  releaseGate(s, f);
  addEvent(s, `Flight ${f.code} cancelled: ${why}`, "bad");
}

function turnToward(f: Flight, angle: number, dt: number) {
  let diff = angle - f.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const max = 5 * dt;
  f.heading += Math.max(-max, Math.min(max, diff));
}

/** move along f.path; returns true when the end is reached */
function followPath(s: GameState, f: Flight, dt: number): boolean {
  let remaining = f.speed * dt;
  while (remaining > 0 && f.pathIdx < f.path.length) {
    const node = f.path[f.pathIdx];
    const tx = node % s.w;
    const ty = (node - tx) / s.w;
    const dx = tx - f.x;
    const dy = ty - f.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) turnToward(f, Math.atan2(dy, dx), dt);
    if (d <= remaining) {
      f.x = tx;
      f.y = ty;
      remaining -= d;
      f.pathIdx++;
    } else {
      f.x += (dx / d) * remaining;
      f.y += (dy / d) * remaining;
      remaining = 0;
    }
  }
  return f.pathIdx >= f.path.length;
}

function spawnDepartures(s: GameState, a: Analysis, f: Flight) {
  while (f.spawnTimes.length > 0 && f.spawnTimes[0] <= s.time) {
    f.spawnTimes.shift();
    f.depSpawned++;
    const g = a.gateByIdx.get(f.gate);
    const lots = g && g.parking.length > 0 ? g.parking : a.parking;
    if (lots.length === 0) continue;
    const tile = lots[Math.floor(Math.random() * lots.length)];
    spawnPassenger(s, "dep", f.id, tile, ["checkin", "tsa", "gate"]);
    earn(s, PARKING_FEE);
  }
}

function updateFlights(s: GameState, a: Analysis, dt: number) {
  for (const f of s.flights) {
    if (f.done) continue;
    const def = PLANES[f.cls];
    if (f.state === "scheduled" || f.state === "landing" || f.state === "taxiIn" || f.state === "deboarding" || f.state === "boarding")
      spawnDepartures(s, a, f);

    switch (f.state) {
      case "scheduled": {
        if (s.time < f.arriveAt) break;
        const g = a.gateByIdx.get(f.gate);
        const usable = g && g.stand >= 0 ? g.runways.filter((r) => r.len >= def.minRunway) : [];
        if (!g || usable.length === 0) {
          cancelFlight(s, f, "no usable runway route to the gate");
          break;
        }
        // land into the wind on whichever open runway gives the shortest taxi to the stand
        let best: RunwayRun | null = null;
        let bestDir: 1 | -1 = 1;
        let bestPath: number[] = [];
        let waitReason = "";
        for (const run of usable) {
          const block = runwayBlock(s, a, run, f.cls, true);
          if (block) {
            if (!waitReason) waitReason = block;
            continue;
          }
          if (!runwayFree(s, run)) {
            if (!waitReason) waitReason = "Waiting for a free runway";
            continue;
          }
          const dir = runwayDir(s, run);
          const startA = runStart(run, dir);
          // touch down at the runway start, roll out a few tiles, then find the way to the stand
          const rollA = startA + dir * Math.min(run.len - 1, 6);
          const exit = taxiPath(s, runIdx(s, run, rollA), g.stand, { run, dir }) ?? taxiPath(s, runIdx(s, run, rollA), g.stand);
          if (!exit) continue;
          const path: number[] = [];
          for (let k = startA; k !== rollA; k += dir) path.push(runIdx(s, run, k));
          path.push(...exit);
          if (!best || path.length < bestPath.length) {
            best = run;
            bestDir = dir;
            bestPath = path;
          }
        }
        if (!best) {
          if (!waitReason) {
            cancelFlight(s, f, "no taxiway route to the gate");
            break;
          }
          // circle until a runway opens, then divert
          f.holding += dt;
          f.holdReason = waitReason;
          if (f.holding > HOLD_LIMIT) {
            s.diversions++;
            recordDeparture(s, false);
            for (const p of s.passengers) {
              if (p.dead || p.flightId !== f.id || p.missed) continue;
              p.missed = true;
              rate(s, 35);
              p.plan = ["exit"];
              p.step = 0;
              p.state = "idle";
            }
            cancelFlight(s, f, `diverted after ${Math.round(f.holding)} min holding (${waitReason})`);
          }
          break;
        }
        const start = runIdx(s, best, runStart(best, bestDir));
        f.stand = g.stand;
        f.run = best;
        f.dir = bestDir;
        // the timetable allows for the normal taxi in; time spent holding is delay
        f.schedDep = f.arriveAt + 3 + bestPath.length / TAXI_SPEED + def.ground;
        f.holdReason = "";
        f.path = bestPath;
        f.pathIdx = 0;
        f.heading = runHeadingDir(best, bestDir);
        f.x = (start % s.w) - 14 * Math.cos(f.heading);
        f.y = Math.floor(start / s.w) - 14 * Math.sin(f.heading);
        f.speed = 14;
        f.onRunway = true;
        f.state = "landing";
        s.runwayLocks[best.key] = f.id;
        break;
      }
      case "landing": {
        const down = !f.run || runProgress(f.run, f.dir, f.x, f.y) >= 0;
        if (down) f.speed = Math.max(3, f.speed - 16 * dt);
        const end = followPath(s, f, dt);
        const under = s.tiles[Math.round(f.y) * s.w + Math.round(f.x)];
        const offRunway = down && (!under || under.type !== "runway");
        if (offRunway || end) {
          unlockRunway(s, f);
          f.speed = TAXI_SPEED;
          f.state = "taxiIn";
        }
        break;
      }
      case "taxiIn": {
        if (followPath(s, f, dt)) {
          f.state = "deboarding";
          f.timer = 0;
          f.departAt = s.time + def.ground;
          earnFee(s, def.landingFee);
          s.flightsHandled++;
        }
        break;
      }
      case "deboarding": {
        faceGate(s, f, dt);
        f.timer += dt;
        while (f.timer >= 0.1 && f.arrLeft > 0) {
          f.timer -= 0.1;
          f.arrLeft--;
          const p = spawnPassenger(s, "arr", f.id, f.gate, def.intl ? ["customs", "exit"] : ["exit"]);
          // time spent circling counts against the trip
          p.wait = f.holding * 0.3;
        }
        if (f.arrLeft === 0) {
          f.state = "boarding";
          f.timer = 0;
        }
        break;
      }
      case "boarding": {
        faceGate(s, f, dt);
        f.timer += dt;
        let waiting = 0;
        for (const p of s.passengers) {
          if (p.dead || p.kind !== "dep" || p.flightId !== f.id || p.missed) continue;
          if (p.state === "atGate" && f.timer >= 0.12) {
            f.timer -= 0.12;
            p.dead = true;
            f.boarded++;
            s.served++;
            rate(s, ratingOf(p));
            earnFee(s, def.commission);
          } else {
            waiting++;
          }
        }
        if (f.timer > 0.12) f.timer = 0.12;
        const remaining = waiting + (f.depBooked - f.depSpawned);
        const ready = remaining === 0 && s.time >= f.departAt - def.ground * 0.5;
        if (ready || s.time >= f.departAt + LATE_LIMIT) {
          if (remaining > 0) {
            for (const p of s.passengers)
              if (!p.dead && p.kind === "dep" && p.flightId === f.id && !p.missed) missFlight(s, p);
            f.depBooked = f.depSpawned;
            f.spawnTimes = [];
            s.missedFlights += remaining;
            addEvent(s, `${f.code} left ${remaining} passenger${remaining === 1 ? "" : "s"} behind`, "bad");
          }
          settleContractFlight(s, f, remaining === 0);
          recordDeparture(s, s.time <= f.schedDep + ON_TIME_GRACE);
          // depart into the wind from the open runway with the shortest taxi
          const g = a.gateByIdx.get(f.gate);
          let path: number[] | null = null;
          let bestCost = Infinity;
          for (const run of g ? g.runways : []) {
            if (run.len < def.minRunway) continue;
            const dir = runwayDir(s, run);
            const candidate = taxiPath(s, f.stand, runIdx(s, run, runStart(run, dir)));
            if (!candidate) continue;
            const cost =
              candidate.length + (runwayFree(s, run) ? 0 : 12) + (runwayBlock(s, a, run, f.cls, false) ? 200 : 0);
            if (cost < bestCost) {
              bestCost = cost;
              path = candidate;
              f.run = run;
              f.dir = dir;
            }
          }
          releaseGate(s, f);
          if (!path) {
            f.done = true;
            break;
          }
          f.path = path;
          f.pathIdx = 0;
          f.speed = TAXI_SPEED;
          f.state = "taxiOut";
        }
        break;
      }
      case "taxiOut": {
        const run = f.run;
        if (!run) {
          f.done = true;
          break;
        }
        const next = f.path[f.pathIdx];
        const atEnd = f.pathIdx >= f.path.length;
        const entering = next !== undefined && runHas(run, next % s.w, Math.floor(next / s.w));
        if ((entering || atEnd) && s.runwayLocks[run.key] !== f.id) {
          // hold short until the weather allows it and the runway is free
          const block = runwayBlock(s, a, run, f.cls, false);
          f.holdReason = block ?? (runwayFree(s, run) ? "" : "Waiting for a free runway");
          if (block || !runwayFree(s, run)) break;
          s.runwayLocks[run.key] = f.id;
          f.onRunway = true;
          f.holdReason = "";
        }
        if (followPath(s, f, dt)) {
          f.onRunway = true;
          f.state = "takeoff";
          f.speed = 1.5;
        }
        break;
      }
      case "takeoff": {
        const run = f.run;
        if (!run) {
          f.done = true;
          break;
        }
        const hd = runHeadingDir(run, f.dir);
        turnToward(f, hd, dt);
        f.speed += 14 * dt;
        f.x += Math.cos(hd) * f.speed * dt;
        f.y += Math.sin(hd) * f.speed * dt;
        if (runProgress(run, f.dir, f.x, f.y) > run.len + 1) unlockRunway(s, f);
        if (f.x > s.w + 8 || f.y > s.h + 8 || f.x < -8 || f.y < -8) f.done = true;
        break;
      }
    }
  }
  // drop locks held by flights that no longer exist
  for (const key of Object.keys(s.runwayLocks)) {
    const id = s.runwayLocks[Number(key)];
    if (!s.flights.some((f) => f.id === id && !f.done)) delete s.runwayLocks[Number(key)];
  }
}

function faceGate(s: GameState, f: Flight, dt: number) {
  const gx = f.gate % s.w;
  const gy = Math.floor(f.gate / s.w);
  turnToward(f, Math.atan2(gy - f.y, gx - f.x), dt);
}

// ---------------------------------------------------------------------------
// Airline contracts
// ---------------------------------------------------------------------------

function contractFlightsInProgress(s: GameState, id: number): number {
  let n = 0;
  for (const f of s.flights)
    if (!f.done && f.contractId === id && f.state !== "taxiOut" && f.state !== "takeoff") n++;
  return n;
}

function makeOffer(s: GameState): Contract {
  const maxCls = s.tier - 1;
  const cls = Math.floor(Math.random() * (maxCls + 1)) as PlaneClass;
  const def = PLANES[cls];
  const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
  const flights = [5, 4, 3, 2, 2][cls] + Math.floor(Math.random() * 4);
  const hours = Math.round(flights * (1.0 + Math.random() * 0.7));
  const reward = Math.round((flights * def.landingFee * (0.9 + Math.random() * 0.6)) / 100) * 100;
  return {
    id: s.nextId++,
    airline,
    airlineName: AIRLINE_NAMES[airline],
    cls,
    flights,
    done: 0,
    hours,
    deadline: 0,
    bonusPerFlight: Math.round(def.landingFee * 0.3),
    reward,
    penalty: Math.round((reward * 0.5) / 100) * 100,
    latePenalty: Math.round(def.landingFee * 0.5),
  };
}

function updateContracts(s: GameState) {
  if (s.time >= s.nextOffer) {
    s.nextOffer = s.time + OFFER_REFRESH;
    const offers: Contract[] = [];
    for (let tries = 0; offers.length < 3 && tries < 30; tries++) {
      const o = makeOffer(s);
      if (!offers.some((x) => x.airline === o.airline) && !s.contracts.some((x) => x.airline === o.airline)) offers.push(o);
    }
    s.contractOffers = offers;
  }
  for (const c of s.contracts) {
    if (s.time > c.deadline) {
      spend(s, c.penalty);
      addEvent(s, `${c.airlineName} contract failed: ${c.done}/${c.flights} flights. Penalty $${c.penalty.toLocaleString()}.`, "bad");
      c.done = -1;
    }
  }
  if (s.contracts.some((c) => c.done < 0)) s.contracts = s.contracts.filter((c) => c.done >= 0);
}

function settleContractFlight(s: GameState, f: Flight, onTime: boolean) {
  if (!f.contractId) return;
  const c = s.contracts.find((x) => x.id === f.contractId);
  if (!c) return;
  if (!onTime) {
    spend(s, c.latePenalty);
    addEvent(s, `${c.airlineName} fined you $${c.latePenalty.toLocaleString()}: ${f.code} left passengers behind`, "bad");
    return;
  }
  c.done++;
  earn(s, c.bonusPerFlight);
  if (c.done >= c.flights) {
    earn(s, c.reward);
    s.contractsCompleted++;
    s.contracts = s.contracts.filter((x) => x !== c);
    addEvent(s, `${c.airlineName} contract complete! Bonus $${c.reward.toLocaleString()}.`, "good");
  }
}

export function signContract(s: GameState, id: number): ActionResult {
  const c = s.contractOffers.find((x) => x.id === id);
  if (!c) return { ok: false, msg: "Offer expired" };
  if (s.contracts.length >= MAX_CONTRACTS) return { ok: false, msg: `Max ${MAX_CONTRACTS} contracts at once` };
  if (PLANES[c.cls].tier > s.tier) return { ok: false, msg: "Airport tier too low" };
  s.contractOffers = s.contractOffers.filter((x) => x !== c);
  c.deadline = s.time + c.hours * 60;
  s.contracts.push(c);
  return { ok: true, msg: `Signed with ${c.airlineName}: ${c.flights} flights in ${c.hours}h` };
}

// ---------------------------------------------------------------------------
// Tiers + economy
// ---------------------------------------------------------------------------

function checkTier(s: GameState) {
  if (s.tier >= 5) return;
  const next = s.tier + 1;
  const reqs = tierRequirements(s, next);
  if (reqs.length === 0 || !reqs.every((r) => r.done)) return;
  s.tier = next as GameState["tier"];
  s.version++;
  addEvent(s, `Promoted to Tier ${next}: ${TIER_NAMES[next]}! Unlocked: ${TIER_UNLOCKS[next]}.`, "good");
}

function hourTick(s: GameState) {
  spend(s, hourlyUpkeep(s));
  const interest = (s.loan * LOAN_RATE) / 24 + (s.money < 0 ? (-s.money * OVERDRAFT_RATE) / 24 : 0);
  if (interest > 0) spend(s, interest);
  const limit = bankruptAt(s);
  if (s.money < limit) {
    s.bankrupt = true;
    addEvent(s, "Bankrupt! The bank has taken over the airport.", "bad");
  } else if (s.money < 0) {
    addEvent(s, `Overdrawn: ${OVERDRAFT_RATE * 100}% a day interest. Bankrupt below -$${(-limit).toLocaleString()}.`, "bad");
  }
  s.incomeLastHour = s.incomeThisHour;
  s.expenseLastHour = s.expenseThisHour;
  s.incomeThisHour = 0;
  s.expenseThisHour = 0;
  s.nextHour += 60;
}

// ---------------------------------------------------------------------------
// Main step
// ---------------------------------------------------------------------------

/** advance the simulation by dt game minutes (keep dt small, see MAX_STEP) */
export function step(s: GameState, dt: number) {
  if (s.bankrupt) return;
  s.time += dt;
  updateWeather(s, dt);
  let a = getAnalysis(s);

  const demand = currentDemand(s);
  s.demandTokens = Math.min(demand * 1.5, s.demandTokens + (demand / 60) * dt);

  if (s.time >= s.nextSchedule) {
    s.nextSchedule = s.time + 2;
    checkTier(s);
    updateContracts(s);
    a = getAnalysis(s);
    scheduleFlights(s, a);
  }

  updateFlights(s, a, dt);

  const byId = new Map<number, Passenger>();
  for (const p of s.passengers) byId.set(p.id, p);
  const flights = new Map<number, Flight>();
  for (const f of s.flights) if (!f.done && f.state !== "taxiOut" && f.state !== "takeoff") flights.set(f.id, f);
  updateBuses(s, a, dt, byId);
  updatePassengers(s, a, dt, flights);
  updateFacilities(s, dt, byId);

  if (s.passengers.some((p) => p.dead)) s.passengers = s.passengers.filter((p) => !p.dead);
  if (s.flights.some((f) => f.done)) s.flights = s.flights.filter((f) => !f.done);

  while (s.time >= s.nextHour) hourTick(s);
}
