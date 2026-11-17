// Layout analysis: which gates work, why they don't, and what each flight class is waiting on.
// Cached per layout version, so it is cheap to call every frame.

import { BUILD, GATE_SIZE, PARKING_SPOTS, PLANES, SERVICE_TIME, TOWER_FORECAST_HOURS, type Tier } from "./constants";
import { fieldTo, isWalkable, neighbors, shuttleActive, taxiReach } from "./pathfinding";
import { findRunways, runHas, runIdx } from "./runways";
import { crosswind, crosswindLimit, runwayBlock, runwayDir } from "./weather";
import type { Analysis, ClassStatus, GameState, GateInfo, RunwayRun, TileInfo } from "./types";

const cache = new WeakMap<GameState, Analysis>();

function anyFinite(field: Float64Array, list: number[]): boolean {
  for (const i of list) if (isFinite(field[i])) return true;
  return false;
}

export function getAnalysis(s: GameState): Analysis {
  const hit = cache.get(s);
  if (hit && hit.version === s.version) return hit;

  const parking: number[] = [];
  const checkins: number[] = [];
  const tsas: number[] = [];
  const customs: number[] = [];
  const stops: number[] = [];
  const gateIdx: number[] = [];
  let parkingSpots = 0;
  let tower = 0;
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    switch (t.type) {
      case "parking":
        parking.push(i);
        parkingSpots += PARKING_SPOTS[t.level - 1];
        break;
      case "checkin":
        checkins.push(i);
        break;
      case "tsa":
        tsas.push(i);
        break;
      case "customs":
        customs.push(i);
        break;
      case "shuttle":
        stops.push(i);
        break;
      case "gate":
        gateIdx.push(i);
        break;
      case "tower":
        tower = Math.max(tower, t.level);
        break;
    }
  }

  const runways = findRunways(s);
  const nb = [0, 0, 0, 0];
  const gates: GateInfo[] = [];
  const usedStands = new Set<number>();

  gateIdx.forEach((idx, n) => {
    const level = s.tiles[idx].level;
    const issues: string[] = [];

    // --- airside -----------------------------------------------------------
    let stand = -1;
    const cnt = neighbors(s, idx, nb);
    for (let k = 0; k < cnt; k++) {
      if (s.tiles[nb[k]].type === "taxiway" && !usedStands.has(nb[k])) {
        stand = nb[k];
        break;
      }
    }
    let runway: RunwayRun | null = null;
    const reachable: RunwayRun[] = [];
    if (stand < 0) {
      issues.push("No taxiway next to gate");
    } else {
      usedStands.add(stand);
      const reach = taxiReach(s, stand);
      for (const r of runways) {
        let touches = false;
        for (let k = r.a0; k <= r.a1; k++) {
          if (reach[runIdx(s, r, k)]) {
            touches = true;
            break;
          }
        }
        if (touches) reachable.push(r);
        if (touches && (!runway || r.len > runway.len)) runway = r;
      }
      if (!runway) issues.push("No runway access");
      else if (runway.len < PLANES[0].minRunway)
        issues.push(`Runway too short (${runway.len}/${PLANES[0].minRunway} tiles in a straight line)`);
    }

    // --- landside ----------------------------------------------------------
    const field = fieldTo(s, idx);
    const hasTsa = anyFinite(field, tsas);
    const hasCheckin = anyFinite(field, checkins);
    const reachParking = parking.filter((p) => isFinite(field[p]));
    if (!hasTsa) issues.push("Needs TSA connection");
    if (!hasCheckin) issues.push("Needs check-in connection");
    if (reachParking.length === 0)
      issues.push(
        parking.length === 0
          ? "No parking lot built"
          : "No parking connected (add walkway, or 2 shuttle stops + a driver)",
      );

    const functional = issues.length === 0;
    const hasCustoms = anyFinite(field, customs);
    const classes: number[] = [];
    if (functional && runway) {
      PLANES.forEach((def, c) => {
        if (level >= def.gate && runway.len >= def.minRunway && (!def.intl || hasCustoms)) classes.push(c);
      });
      // soft hints: the gate works, just not for its biggest planes
      PLANES.forEach((def, c) => {
        if (c === 0 || level < def.gate || classes.includes(c)) return;
        if (runway.len < def.minRunway)
          issues.push(`${def.name} needs a ${def.minRunway}-tile runway (longest here is ${runway.len})`);
        else if (def.intl && !hasCustoms) issues.push(`${def.short} flights need a connected Customs zone`);
      });
      PLANES.forEach((def, c) => {
        if (classes.includes(c) && s.tier < def.tier) issues.push(`${def.short} flights require Tier ${def.tier}`);
      });
    }

    gates.push({ idx, name: "G" + (n + 1), level, stand, runway, runways: reachable, issues, functional, classes, parking: reachParking });
  });

  const classStatus = buildClassStatus(s, gates, parking, checkins, tsas, customs, runways);
  const result: Analysis = {
    version: s.version,
    gates,
    gateByIdx: new Map(gates.map((g) => [g.idx, g])),
    runways,
    parking,
    parkingSpots,
    checkins,
    tsas,
    customs,
    stops,
    shuttleActive: shuttleActive(s),
    classStatus,
    tower,
  };
  cache.set(s, result);
  return result;
}

function buildClassStatus(
  s: GameState,
  gates: GateInfo[],
  parking: number[],
  checkins: number[],
  tsas: number[],
  customs: number[],
  runways: RunwayRun[],
): ClassStatus[] {
  const out: ClassStatus[] = [];
  const longest = runways.reduce((m, r) => Math.max(m, r.len), 0);

  // Regional
  let reason = "";
  if (parking.length === 0) reason = "Build a Parking Lot";
  else if (checkins.length === 0) reason = "Build a Check-in Desk";
  else if (tsas.length === 0) reason = "Build a TSA Checkpoint";
  else if (gates.length === 0) reason = "Build a Small Gate";
  else if (runways.length === 0) reason = "Build a Runway (8+ tiles in a straight line)";
  else if (!gates.some((g) => g.functional)) reason = `${gates[0].name}: ${gates[0].issues[0]}`;
  out.push({ ok: reason === "", reason: reason || "Regional flights operating" });

  for (let c = 1; c < PLANES.length; c++) {
    const def = PLANES[c];
    reason = "";
    if (s.tier < def.tier) reason = `Requires Tier ${def.tier} Airport`;
    else if (!gates.some((g) => g.level >= def.gate)) reason = `Needs a ${GATE_SIZE[def.gate]} gate`;
    else if (def.intl && customs.length === 0) reason = "Needs a Customs / Immigration zone";
    else if (longest < def.minRunway) reason = `Runway too short (${longest}/${def.minRunway})`;
    else if (!gates.some((g) => g.classes.includes(c))) {
      const g = gates.find((x) => x.level >= def.gate);
      reason = g ? `${g.name}: ${g.issues[0] ?? "not connected"}` : `Needs a ${GATE_SIZE[def.gate]} gate`;
    }
    out.push({ ok: reason === "", reason: reason || `${def.short} flights operating` });
  }
  return out;
}

export interface TierProgress {
  label: string;
  done: boolean;
}

export const TIER_UNLOCKS = [
  "",
  "Regional turboprops",
  "Narrow-body jets",
  "Wide-body international jets",
  "Super Jumbos (Jumbo gate, 22-tile runway) and much more demand",
  "Supersonic jets (24-tile runway): tiny planes, huge fares",
];

/** what it takes to reach `tier` (empty for tier 1 or beyond the top) */
export function tierRequirements(s: GameState, tier: number): TierProgress[] {
  const a = getAnalysis(s);
  const served = (n: number) => ({ label: `${Math.min(s.served, n).toLocaleString("en-US")}/${n.toLocaleString("en-US")} passengers served`, done: s.served >= n });
  const sat = (n: number) => ({ label: `${Math.round(s.satisfaction)}% / ${n}% satisfaction`, done: s.satisfaction >= n });
  const longRunways = a.runways.filter((r) => r.len >= 12).length;
  const working = a.gates.filter((g) => g.functional).length;
  const longest = a.runways.reduce((m, r) => Math.max(m, r.len), 0);
  switch (tier) {
    case 2:
      return [served(500), sat(80), { label: "At least one Medium gate", done: a.gates.some((g) => g.level >= 2) }];
    case 3:
      return [
        served(2500),
        { label: "Customs / Immigration zone", done: a.customs.length > 0 },
        { label: "At least one Large gate", done: a.gates.some((g) => g.level >= 3) },
      ];
    case 4:
      return [
        served(25000),
        sat(85),
        { label: `${Math.min(longRunways, 2)}/2 runways of 12+ tiles`, done: longRunways >= 2 },
        { label: `${Math.min(working, 10)}/10 working gates`, done: working >= 10 },
        { label: "Control Tower level 2 (ILS)", done: a.tower >= 2 },
      ];
    case 5:
      return [
        served(100000),
        sat(88),
        { label: `${Math.round(s.otp)}% / 85% on-time departures`, done: s.otp >= 85 },
        { label: "A Jumbo gate", done: a.gates.some((g) => g.level >= 4) },
        { label: `A 24-tile runway (longest ${longest})`, done: longest >= 24 },
      ];
    default:
      return [];
  }
}

/** checklist for the next tier (empty at max tier) */
export function tierProgress(s: GameState): TierProgress[] {
  return tierRequirements(s, s.tier + 1);
}

export function nextTier(s: GameState): Tier | null {
  return s.tier < 5 ? ((s.tier + 1) as Tier) : null;
}

/** hover tooltip content for a tile */
export function tileInfo(s: GameState, idx: number): TileInfo | null {
  const t = s.tiles[idx];
  if (t.type === "empty") return null;
  const a = getAnalysis(s);
  const def = BUILD[t.type];
  const lines: string[] = [];
  const issues: string[] = [];
  let title = def.name;
  const x = idx % s.w;
  const y = (idx - x) / s.w;

  switch (t.type) {
    case "gate": {
      const g = a.gateByIdx.get(idx);
      title = `${GATE_SIZE[t.level]} Gate ${g ? g.name : ""}`;
      lines.push("Accepts: " + PLANES.filter((p) => t.level >= p.gate).map((p) => p.short).join(", "));
      const fid = s.gateFlight[idx];
      const f = fid !== undefined ? s.flights.find((fl) => fl.id === fid) : undefined;
      if (f) lines.push(`Flight ${f.code} (${f.city}) · ${f.state}`);
      else if (g?.functional) lines.push(s.gateNote[idx] || "Open, waiting for a flight");
      if (g) issues.push(...g.issues);
      break;
    }
    case "runway": {
      const here = a.runways.filter((r) => runHas(r, x, y));
      const run = here.sort((p, q) => q.len - p.len)[0];
      const len = run ? run.len : 1;
      const ok = PLANES.filter((p) => len >= p.minRunway).map((p) => p.short);
      lines.push(`${len} tiles long · handles: ${ok.length ? ok.join(", ") : "nothing yet"}`);
      const next = PLANES.find((p) => len < p.minRunway);
      if (next) lines.push(`${next.name} needs ${next.minRunway} tiles`);
      if (here.length > 1) lines.push("Runways cross here: only one can be in use at a time");
      if (run && run.len >= 8) {
        const dir = runwayDir(s, run);
        const way = run.vertical ? (dir > 0 ? "southbound" : "northbound") : dir > 0 ? "eastbound" : "westbound";
        lines.push(`In use ${way} (into the wind) · crosswind ${crosswind(s, run)} kt`);
        const shut = PLANES.map((p, c) => (len >= p.minRunway ? runwayBlock(s, a, run, c, true) : null));
        const firstBlock = shut.find((x) => x);
        if (shut.every((x, c) => x || len < PLANES[c].minRunway)) issues.push("Closed: " + firstBlock);
        else if (firstBlock) {
          const limited = PLANES.filter((p, c) => shut[c]).map((p) => `${p.short} (${crosswindLimit(s, PLANES.indexOf(p))} kt)`);
          lines.push(`Too windy for: ${limited.join(", ")}`);
        }
      }
      if (len < PLANES[0].minRunway) issues.push("Too short: needs 8+ tiles in a straight line");
      break;
    }
    case "taxiway": {
      const reach = taxiReach(s, idx);
      let hasRunway = false;
      for (let i = 0; i < reach.length; i++) {
        if (reach[i] && s.tiles[i].type === "runway") {
          hasRunway = true;
          break;
        }
      }
      if (!hasRunway) issues.push("Not connected to a runway");
      break;
    }
    case "checkin":
    case "tsa":
    case "customs": {
      const q = s.facilities[idx]?.queue.length ?? 0;
      lines.push(`Level ${t.level} · ${SERVICE_TIME[t.type][t.level - 1].toFixed(2)} min per passenger`);
      lines.push(`Queue: ${q}`);
      const field = fieldTo(s, idx);
      if (!a.gates.some((g) => isFinite(field[g.idx]))) issues.push("Not connected to any gate");
      if (t.type === "checkin" && !a.parking.some((p) => isFinite(field[p]))) issues.push("Not connected to parking");
      break;
    }
    case "parking": {
      lines.push(`Level ${t.level} · ${PARKING_SPOTS[t.level - 1]} spots (airport total ${a.parkingSpots})`);
      const field = fieldTo(s, idx);
      if (!a.checkins.some((c) => isFinite(field[c])))
        issues.push("Not connected to check-in (walkway or shuttle needed)");
      break;
    }
    case "tower": {
      const feats = ["weather forecast"];
      if (t.level >= 2) feats.push("ILS fog landings");
      if (t.level >= 3) feats.push("storm radar");
      lines.push(`Level ${t.level}: ${feats.join(", ")}`);
      lines.push(`Forecast: ${TOWER_FORECAST_HOURS[t.level]} hours ahead`);
      if (t.level < a.tower) lines.push("Only your best tower counts");
      break;
    }
    case "shuttle": {
      if (a.stops.length < 2) issues.push("Needs a second shuttle stop");
      if (s.drivers < 1) issues.push("No shuttle driver hired (Staff tab)");
      let touches = false;
      const nb = [0, 0, 0, 0];
      const cnt = neighbors(s, idx, nb);
      for (let k = 0; k < cnt; k++) if (isWalkable(s.tiles[nb[k]].type)) touches = true;
      if (!touches) issues.push("Not touching a walkway, parking or terminal");
      lines.push(`${s.drivers} bus${s.drivers === 1 ? "" : "es"} running`);
      break;
    }
    default:
      break;
  }
  if (def.maxLevel > 1 && t.level < def.maxLevel)
    lines.push(`Upgrade: $${def.cost[t.level].toLocaleString()}`);
  return { title, lines, issues };
}
