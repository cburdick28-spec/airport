// The simulation engine: state creation, the fixed-step update, and player actions.
// Pure TypeScript with no DOM access, so it can run headless (see scripts/sim-test.ts).

import { getAnalysis } from "./analysis";
import {
  AIRLINES,
  BUILD,
  BUS_CAPACITY,
  BUS_DWELL,
  BUS_SPEED,
  CITIES,
  DRIVER_HIRE_COST,
  DRIVER_WAGE,
  GATE_SIZE,
  GRID_H,
  GRID_W,
  LATE_LIMIT,
  LEAD_TIME,
  MARKETING_BOOST,
  MARKETING_COST,
  MARKETING_HOURS,
  PARKING_FEE,
  PLANES,
  REFUND_RATE,
  SERVICE_TIME,
  SPAWN_WINDOW,
  START_TIME,
  TAXI_SPEED,
  TIER2_PAX,
  TIER2_SAT,
  TIER3_PAX,
  TIER_DEMAND,
  TIER_NAMES,
  WALK_SPEED,
} from "./constants";
import { derivePath, distanceField, distFrom, fieldTo, taxiPath } from "./pathfinding";
import type { Analysis, Flight, GameState, Passenger, PlaneClass, StepKind, TileType } from "./types";

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
    runwayLock: null,
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
  };
}

export function addEvent(s: GameState, text: string, kind: "info" | "good" | "bad" = "info") {
  s.events.push({ id: s.nextId++, time: s.time, text, kind });
  if (s.events.length > 40) s.events.splice(0, s.events.length - 40);
}

function earn(s: GameState, amount: number) {
  s.money += amount;
  s.incomeThisHour += amount;
}

function rate(s: GameState, rating: number) {
  s.satisfaction += (rating - s.satisfaction) * 0.04;
  if (s.satisfaction < 0) s.satisfaction = 0;
  if (s.satisfaction > 100) s.satisfaction = 100;
}

function ratingOf(p: Passenger): number {
  return Math.max(10, 100 - p.wait * 3);
}

export function currentDemand(s: GameState): number {
  const sat = 0.5 + 0.5 * (s.satisfaction / 100);
  const mk = s.time < s.marketingUntil ? MARKETING_BOOST : 1;
  return TIER_DEMAND[s.tier] * sat * mk;
}

export function hourlyUpkeep(s: GameState): number {
  let total = s.drivers * DRIVER_WAGE;
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
  if (s.money < BUILD[type].cost[0]) return "Not enough money";
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
    const gateField = f ? fieldTo(s, f.gate) : null;
    let bestScore = Infinity;
    for (const c of list) {
      if (gateField && !isFinite(gateField[c])) continue;
      const fld = fieldTo(s, c);
      const d = distFrom(s, fld, p.tile);
      if (!isFinite(d)) continue;
      const q = s.facilities[c]?.queue.length ?? 0;
      const svc = SERVICE_TIME[kind][s.tiles[c].level - 1];
      const score = d + q * svc * WALK_SPEED;
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
      case "atGate":
        if (p.kind === "dep" && !flights.has(p.flightId)) missFlight(s, p);
        break;
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

function scheduleFlights(s: GameState, a: Analysis) {
  let used = parkingUsed(s);
  for (const g of a.gates) {
    if (!g.functional || g.maxClass < 0) continue;
    if (s.gateFlight[g.idx] !== undefined) continue;
    if (s.time < (s.gateCooldown[g.idx] ?? 0)) {
      s.gateNote[g.idx] = "Turnaround break";
      continue;
    }
    const allowed: number[] = [];
    for (let c = 0; c <= g.maxClass; c++) if (PLANES[c].tier <= s.tier) allowed.push(c);
    if (allowed.length === 0) continue;
    const top = allowed[allowed.length - 1];
    const first = Math.random() < 0.7 ? top : allowed[Math.floor(Math.random() * allowed.length)];
    const free = a.parkingSpots - used;
    let created = false;
    for (let c = first; c >= 0; c--) {
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

function createFlight(s: GameState, gate: number, stand: number, cls: PlaneClass, booked: number) {
  const def = PLANES[cls];
  const spawnTimes: number[] = [];
  for (let i = 0; i < booked; i++) spawnTimes.push(s.time + Math.random() * SPAWN_WINDOW);
  spawnTimes.sort((x, y) => x - y);
  const cities = CITIES[cls];
  const f: Flight = {
    id: s.nextId++,
    code: AIRLINES[Math.floor(Math.random() * AIRLINES.length)] + " " + (100 + Math.floor(Math.random() * 900)),
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
    arriveAt: s.time + LEAD_TIME + Math.random() * 6,
    departAt: 0,
    depBooked: booked,
    depSpawned: 0,
    spawnTimes,
    boarded: 0,
    arrTotal: Math.round(def.seats * (0.6 + 0.4 * Math.random())),
    arrLeft: 0,
    timer: 0,
    runwayRow: 0,
    runwayX0: 0,
    runwayX1: 0,
    onRunway: false,
    done: false,
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
  if (s.runwayLock === f.id) s.runwayLock = null;
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
        if (s.time < f.arriveAt || s.runwayLock !== null) break;
        const g = a.gateByIdx.get(f.gate);
        if (!g || g.stand < 0 || !g.runway || g.runway.len < def.minRunway) {
          cancelFlight(s, f, "no usable runway route to the gate");
          break;
        }
        const run = g.runway;
        // touch down at the runway start, roll out a few tiles, then find the way to the stand
        const rollEnd = run.row * s.w + run.x0 + Math.min(run.len - 1, 6);
        const exit = taxiPath(s, rollEnd, g.stand, run) ?? taxiPath(s, rollEnd, g.stand);
        if (!exit) {
          cancelFlight(s, f, "no taxiway route to the gate");
          break;
        }
        const path: number[] = [];
        for (let i = run.row * s.w + run.x0; i < rollEnd; i++) path.push(i);
        path.push(...exit);
        f.stand = g.stand;
        f.runwayRow = run.row;
        f.runwayX0 = run.x0;
        f.runwayX1 = run.x1;
        f.path = path;
        f.pathIdx = 0;
        f.x = run.x0 - 14;
        f.y = run.row;
        f.heading = 0;
        f.speed = 14;
        f.onRunway = true;
        f.state = "landing";
        s.runwayLock = f.id;
        break;
      }
      case "landing": {
        if (f.x >= f.runwayX0) f.speed = Math.max(3, f.speed - 16 * dt);
        const end = followPath(s, f, dt);
        const under = s.tiles[Math.round(f.y) * s.w + Math.round(f.x)];
        const offRunway = f.x >= f.runwayX0 && (!under || under.type !== "runway");
        if (offRunway || end) {
          if (s.runwayLock === f.id) s.runwayLock = null;
          f.onRunway = false;
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
          earn(s, def.landingFee);
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
          spawnPassenger(s, "arr", f.id, f.gate, f.cls === 2 ? ["customs", "exit"] : ["exit"]);
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
            earn(s, def.commission);
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
          const start = f.runwayRow * s.w + f.runwayX0;
          const path = taxiPath(s, f.stand, start);
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
        const next = f.path[f.pathIdx];
        if (next !== undefined && s.tiles[next].type === "runway" && s.runwayLock !== f.id) {
          if (s.runwayLock !== null) break; // hold short
          s.runwayLock = f.id;
          f.onRunway = true;
        }
        if (followPath(s, f, dt)) {
          if (s.runwayLock === null) s.runwayLock = f.id;
          if (s.runwayLock !== f.id) break;
          f.onRunway = true;
          f.state = "takeoff";
          f.speed = 1.5;
        }
        break;
      }
      case "takeoff": {
        turnToward(f, 0, dt);
        f.speed += 14 * dt;
        f.x += f.speed * dt;
        if (f.x > f.runwayX1 + 2 && s.runwayLock === f.id) {
          s.runwayLock = null;
          f.onRunway = false;
        }
        if (f.x > s.w + 6) f.done = true;
        break;
      }
    }
  }
  if (s.runwayLock !== null && !s.flights.some((f) => f.id === s.runwayLock && !f.done)) s.runwayLock = null;
}

function faceGate(s: GameState, f: Flight, dt: number) {
  const gx = f.gate % s.w;
  const gy = Math.floor(f.gate / s.w);
  turnToward(f, Math.atan2(gy - f.y, gx - f.x), dt);
}

// ---------------------------------------------------------------------------
// Tiers + economy
// ---------------------------------------------------------------------------

function checkTier(s: GameState, a: Analysis) {
  if (s.tier === 1 && s.served >= TIER2_PAX && s.satisfaction >= TIER2_SAT && a.gates.some((g) => g.level >= 2)) {
    s.tier = 2;
    s.version++;
    addEvent(s, `Promoted to Tier 2: ${TIER_NAMES[2]}! Narrow-body flights unlocked.`, "good");
  } else if (s.tier === 2 && s.served >= TIER3_PAX && a.customs.length > 0 && a.gates.some((g) => g.level >= 3)) {
    s.tier = 3;
    s.version++;
    addEvent(s, `Promoted to Tier 3: ${TIER_NAMES[3]}! Wide-body flights unlocked.`, "good");
  }
}

function hourTick(s: GameState) {
  const upkeep = hourlyUpkeep(s);
  s.money -= upkeep;
  s.expenseThisHour += upkeep;
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
  s.time += dt;
  let a = getAnalysis(s);

  const demand = currentDemand(s);
  s.demandTokens = Math.min(demand * 1.5, s.demandTokens + (demand / 60) * dt);

  if (s.time >= s.nextSchedule) {
    s.nextSchedule = s.time + 2;
    checkTier(s, a);
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
