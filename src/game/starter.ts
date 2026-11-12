// The pre-built "Starter Tutorial Airport": a small working regional airfield so
// planes land and passengers move the moment the game opens.

import { MAX_STEP } from "./constants";
import { addEvent, createEmptyState, step } from "./simulation";
import type { GameState, TileType } from "./types";

function set(s: GameState, x: number, y: number, type: TileType, level = 1) {
  s.tiles[y * s.w + x] = { type, level };
}

function rect(s: GameState, x0: number, y0: number, x1: number, y1: number, type: TileType) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(s, x, y, type);
}

export function createTutorialAirport(): GameState {
  const s = createEmptyState(30000);

  // Airside: a 16-tile runway with a taxiway loop (exit at the far end, entry near the start)
  rect(s, 8, 3, 23, 3, "runway");
  rect(s, 22, 4, 22, 6, "taxiway");
  rect(s, 9, 4, 9, 6, "taxiway");
  rect(s, 9, 7, 22, 7, "taxiway");

  // Two small gates between the apron and the terminal
  set(s, 13, 8, "gate");
  set(s, 17, 8, "gate");

  // Terminal: gate lounge on top, landside hall below, TSA is the only way through
  rect(s, 10, 9, 20, 10, "floor");
  set(s, 15, 11, "tsa");
  rect(s, 10, 12, 20, 13, "floor");
  set(s, 12, 12, "checkin");
  set(s, 18, 12, "checkin");

  // Front door, walkway and the terminal shuttle stop
  rect(s, 15, 14, 15, 16, "sidewalk");
  set(s, 15, 17, "shuttle");

  // Remote parking, reached by shuttle
  rect(s, 30, 22, 35, 23, "parking");
  rect(s, 29, 21, 35, 21, "sidewalk");
  set(s, 28, 21, "shuttle");

  s.name = "Starter Airfield";
  s.drivers = 1;
  s.demandTokens = 40;
  s.version++;

  // Warm up so there is already life on screen at first launch
  for (let i = 0; i < 44 / MAX_STEP; i++) step(s, MAX_STEP);
  s.events = [];
  addEvent(s, "Welcome! This starter airfield is already running. Watch a flight land, then expand.", "good");
  addEvent(s, "Goal: serve 500 passengers at 80%+ satisfaction and upgrade a gate to Medium to reach Tier 2.", "info");
  return s;
}

export function createBlankAirport(): GameState {
  const s = createEmptyState(60000);
  s.name = "Blank Field";
  addEvent(s, "Blank field. Build parking, check-in, TSA, a gate, a taxiway and a runway to get flights.", "info");
  return s;
}
