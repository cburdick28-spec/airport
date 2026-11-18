// localStorage save/load. Only the durable parts of the game are stored
// (layout, money, progress); planes and passengers in motion are respawned.

import { SAVE_KEY } from "./constants";
import { addEvent, createEmptyState, resetWeather } from "./simulation";
import { initLand } from "./projects";
import type { Climate, Contract, GameState, MapLabel, Project, Terminal, TerminalStyle, TileType, WeatherSpell } from "./types";

const TYPES: TileType[] = [
  "empty", "parking", "shuttle", "sidewalk", "floor", "checkin", "tsa", "customs", "gate", "runway", "taxiway", "tower",
];

interface SaveData {
  v: 1;
  w: number;
  h: number;
  tiles: number[];
  money: number;
  time: number;
  tier: GameState["tier"];
  served: number;
  satisfaction: number;
  drivers: number;
  marketingUntil: number;
  flightsHandled: number;
  missedFlights: number;
  contracts?: Contract[];
  contractOffers?: Contract[];
  nextOffer?: number;
  contractsCompleted?: number;
  nextId?: number;
  name?: string;
  labels?: MapLabel[];
  climate?: Climate;
  forecast?: WeatherSpell[];
  snowCrews?: number;
  calmUntil?: number;
  snowCover?: number;
  loan?: number;
  fees?: number;
  otp?: number;
  diversions?: number;
  scenarioId?: string;
  /** 1000 once prices moved to real dollars; missing in older saves */
  moneyScale?: number;
  owned?: string;
  landPermits?: number;
  projects?: Project[];
  terminals?: Terminal[];
  baseStyle?: TerminalStyle;
  /** [tile, type, level, start, done, cost] */
  sites?: [number, number, number, number, number, number][];
}

export function serialize(s: GameState): string {
  const data: SaveData = {
    v: 1,
    w: s.w,
    h: s.h,
    tiles: s.tiles.map((t) => TYPES.indexOf(t.type) * 8 + t.level),
    money: Math.round(s.money),
    time: s.time,
    tier: s.tier,
    served: s.served,
    satisfaction: s.satisfaction,
    drivers: s.drivers,
    marketingUntil: s.marketingUntil,
    flightsHandled: s.flightsHandled,
    missedFlights: s.missedFlights,
    contracts: s.contracts,
    contractOffers: s.contractOffers,
    nextOffer: s.nextOffer,
    contractsCompleted: s.contractsCompleted,
    nextId: s.nextId,
    name: s.name,
    labels: s.labels,
    climate: s.climate,
    forecast: s.forecast,
    snowCrews: s.snowCrews,
    calmUntil: s.calmUntil,
    snowCover: s.snowCover,
    loan: s.loan,
    fees: s.fees,
    otp: s.otp,
    diversions: s.diversions,
    scenarioId: s.scenarioId,
    moneyScale: 1000,
    owned: s.owned.map((o) => (o ? "1" : "0")).join(""),
    landPermits: s.landPermits,
    projects: s.projects,
    terminals: s.terminals,
    baseStyle: s.baseStyle,
    sites: s.sites.flatMap((i) => {
      const site = s.tiles[i].site;
      return site ? [[i, TYPES.indexOf(site.type), site.level, site.start, site.done, site.cost] as [number, number, number, number, number, number]] : [];
    }),
  };
  return JSON.stringify(data);
}

export function deserialize(json: string): GameState | null {
  try {
    const d = JSON.parse(json) as SaveData;
    if (d.v !== 1 || !Array.isArray(d.tiles)) return null;
    // saves from before real-dollar prices: convert the money to the new scale
    const k = d.moneyScale ? 1 : 1000;
    const s = createEmptyState(d.money * k);
    if (d.w !== s.w || d.h !== s.h || d.tiles.length !== s.tiles.length) return null;
    s.tiles = d.tiles.map((n) => ({ type: TYPES[n >> 3] ?? "empty", level: Math.max(1, n & 7) }));
    s.time = d.time;
    s.tier = d.tier;
    s.served = d.served;
    s.satisfaction = d.satisfaction;
    s.drivers = d.drivers;
    s.marketingUntil = d.marketingUntil;
    s.flightsHandled = d.flightsHandled ?? 0;
    s.missedFlights = d.missedFlights ?? 0;
    s.name = d.name ?? "My Airport";
    s.labels = d.labels ?? [];
    const scaleContract = (c: Contract): Contract => ({
      ...c,
      bonusPerFlight: c.bonusPerFlight * k,
      reward: c.reward * k,
      penalty: c.penalty * k,
      latePenalty: c.latePenalty * k,
    });
    s.contracts = (d.contracts ?? []).map(scaleContract);
    s.contractOffers = (d.contractOffers ?? []).map(scaleContract);
    s.nextOffer = d.nextOffer ?? s.time;
    s.contractsCompleted = d.contractsCompleted ?? 0;
    s.nextId = Math.max(s.nextId, d.nextId ?? 1);
    s.climate = d.climate ?? "temperate";
    s.snowCrews = d.snowCrews ?? 0;
    s.calmUntil = d.calmUntil ?? 0;
    s.snowCover = d.snowCover ?? 0;
    s.loan = (d.loan ?? 0) * k;
    s.fees = d.fees ?? 1;
    s.otp = d.otp ?? 90;
    s.diversions = d.diversions ?? 0;
    s.scenarioId = d.scenarioId ?? "blank";
    s.projects = (d.projects ?? []).map((p) => ({ ...p, style: p.style ?? "classic", custom: p.custom ?? "" }));
    s.terminals = d.terminals ?? [];
    s.baseStyle = d.baseStyle ?? "classic";
    const projectOf = new Map<number, number>();
    for (const pr of s.projects) for (const i of pr.tiles) projectOf.set(i, pr.id);
    for (const [i, type, level, start, done, cost] of d.sites ?? []) {
      const kind = TYPES[type];
      if (!s.tiles[i] || !kind || kind === "empty") continue;
      s.tiles[i].site = { type: kind, level, start, done, cost, projectId: projectOf.get(i) };
      s.sites.push(i);
    }
    initLand(s);
    if (d.owned && d.owned.length === s.owned.length) s.owned = d.owned.split("").map((c) => c === "1");
    s.landPermits = d.landPermits ?? 1;
    if (d.forecast && d.forecast.length > 0) s.forecast = d.forecast;
    else resetWeather(s);
    s.nextSchedule = s.time;
    s.nextHour = Math.floor(s.time / 60) * 60 + 60;
    s.version++;
    addEvent(s, "Save loaded. Flights are being rescheduled.", "info");
    return s;
  } catch {
    return null;
  }
}

export function saveGame(s: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    return json ? deserialize(json) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
}
