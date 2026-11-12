// localStorage save/load. Only the durable parts of the game are stored
// (layout, money, progress); planes and passengers in motion are respawned.

import { SAVE_KEY } from "./constants";
import { addEvent, createEmptyState } from "./simulation";
import type { GameState, TileType } from "./types";

const TYPES: TileType[] = [
  "empty", "parking", "shuttle", "sidewalk", "floor", "checkin", "tsa", "customs", "gate", "runway", "taxiway",
];

interface SaveData {
  v: 1;
  w: number;
  h: number;
  tiles: number[];
  money: number;
  time: number;
  tier: 1 | 2 | 3;
  served: number;
  satisfaction: number;
  drivers: number;
  marketingUntil: number;
  flightsHandled: number;
  missedFlights: number;
}

export function serialize(s: GameState): string {
  const data: SaveData = {
    v: 1,
    w: s.w,
    h: s.h,
    tiles: s.tiles.map((t) => TYPES.indexOf(t.type) * 4 + t.level),
    money: Math.round(s.money),
    time: s.time,
    tier: s.tier,
    served: s.served,
    satisfaction: s.satisfaction,
    drivers: s.drivers,
    marketingUntil: s.marketingUntil,
    flightsHandled: s.flightsHandled,
    missedFlights: s.missedFlights,
  };
  return JSON.stringify(data);
}

export function deserialize(json: string): GameState | null {
  try {
    const d = JSON.parse(json) as SaveData;
    if (d.v !== 1 || !Array.isArray(d.tiles)) return null;
    const s = createEmptyState(d.money);
    if (d.w !== s.w || d.h !== s.h || d.tiles.length !== s.tiles.length) return null;
    s.tiles = d.tiles.map((n) => ({ type: TYPES[n >> 2] ?? "empty", level: Math.max(1, n & 3) }));
    s.time = d.time;
    s.tier = d.tier;
    s.served = d.served;
    s.satisfaction = d.satisfaction;
    s.drivers = d.drivers;
    s.marketingUntil = d.marketingUntil;
    s.flightsHandled = d.flightsHandled ?? 0;
    s.missedFlights = d.missedFlights ?? 0;
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
