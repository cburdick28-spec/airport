// localStorage save/load. Only the durable parts of the game are stored
// (layout, money, progress); planes and passengers in motion are respawned.

import { SAVE_KEY } from "./constants";
import { addEvent, createEmptyState, resetWeather } from "./simulation";
import type { Climate, Contract, GameState, MapLabel, TileType, WeatherSpell } from "./types";

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
  };
  return JSON.stringify(data);
}

export function deserialize(json: string): GameState | null {
  try {
    const d = JSON.parse(json) as SaveData;
    if (d.v !== 1 || !Array.isArray(d.tiles)) return null;
    const s = createEmptyState(d.money);
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
    s.contracts = d.contracts ?? [];
    s.contractOffers = d.contractOffers ?? [];
    s.nextOffer = d.nextOffer ?? s.time;
    s.contractsCompleted = d.contractsCompleted ?? 0;
    s.nextId = Math.max(s.nextId, d.nextId ?? 1);
    s.climate = d.climate ?? "temperate";
    s.snowCrews = d.snowCrews ?? 0;
    s.calmUntil = d.calmUntil ?? 0;
    s.snowCover = d.snowCover ?? 0;
    s.loan = d.loan ?? 0;
    s.fees = d.fees ?? 1;
    s.otp = d.otp ?? 90;
    s.diversions = d.diversions ?? 0;
    s.scenarioId = d.scenarioId ?? "blank";
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
