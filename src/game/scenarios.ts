// Pre-built airports the player can jump straight into.
// Layouts are simplified takes on the real airports, squeezed onto the 44 x 28 grid.
// Runways in this engine always run left to right, so crossing runways become parallel ones.

import { MAX_STEP } from "./constants";
import { addEvent, createEmptyState, step } from "./simulation";
import { createBlankAirport, createTutorialAirport } from "./starter";
import type { GameState, TileType } from "./types";

export interface Scenario {
  id: string;
  name: string;
  code: string;
  tagline: string;
  blurb: string;
  facts: string;
  create: () => GameState;
}

function set(s: GameState, x: number, y: number, type: TileType, level = 1) {
  s.tiles[y * s.w + x] = { type, level };
}

function rect(s: GameState, x0: number, y0: number, x1: number, y1: number, type: TileType, level = 1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(s, x, y, type, level);
}

function row(s: GameState, y: number, xs: number[], type: TileType, level = 1) {
  for (const x of xs) set(s, x, y, type, level);
}

function gates(s: GameState, y: number, list: [number, number][]) {
  for (const [x, level] of list) set(s, x, y, "gate", level);
}

interface Setup {
  name: string;
  tier: 1 | 2 | 3;
  served: number;
  drivers?: number;
  hello: string;
  goal: string;
}

function finish(s: GameState, o: Setup): GameState {
  s.name = o.name;
  s.tier = o.tier;
  s.served = o.served;
  s.drivers = o.drivers ?? 0;
  s.demandTokens = 120;
  s.version++;
  // warm up so the airport is already alive when it opens
  for (let i = 0; i < 50 / MAX_STEP; i++) step(s, MAX_STEP);
  s.events = [];
  addEvent(s, o.hello, "good");
  addEvent(s, o.goal, "info");
  return s;
}

// ---------------------------------------------------------------------------
// LaGuardia: cramped site, two short runways, domestic only
// ---------------------------------------------------------------------------
function laguardia(): GameState {
  const s = createEmptyState(80000);
  rect(s, 4, 2, 17, 2, "runway");
  rect(s, 24, 4, 37, 4, "runway");
  rect(s, 4, 3, 4, 6, "taxiway");
  rect(s, 17, 3, 17, 6, "taxiway");
  rect(s, 24, 5, 24, 6, "taxiway");
  rect(s, 37, 5, 37, 6, "taxiway");
  rect(s, 4, 7, 38, 7, "taxiway");

  gates(s, 8, [[8, 1], [12, 2], [16, 2], [22, 2], [26, 2], [30, 2], [34, 1]]);
  rect(s, 6, 9, 36, 10, "floor");
  row(s, 11, [14, 15, 27, 28], "tsa", 2);
  rect(s, 10, 12, 32, 13, "floor");
  row(s, 12, [11, 18, 24, 31], "checkin", 2);

  rect(s, 10, 14, 33, 14, "sidewalk");
  row(s, 15, [14, 21, 28], "sidewalk");
  rect(s, 12, 16, 30, 17, "parking", 2);

  // remote economy lot, linked by the famous LGA buses
  set(s, 34, 14, "shuttle");
  rect(s, 38, 20, 42, 22, "parking");
  set(s, 37, 21, "sidewalk");
  set(s, 36, 21, "shuttle");

  return finish(s, {
    name: "LaGuardia (LGA)",
    tier: 2,
    served: 500,
    drivers: 2,
    hello: "Welcome to LaGuardia: seven gates, two short runways and no room to spare.",
    goal: "Runways here are too short for wide-bodies. Extend one to 18 tiles and add Customs to go international.",
  });
}

// ---------------------------------------------------------------------------
// JFK: two long runways flanking a central terminal ring
// ---------------------------------------------------------------------------
function jfk(): GameState {
  const s = createEmptyState(150000);
  rect(s, 4, 0, 25, 0, "runway");
  rect(s, 16, 27, 39, 27, "runway");
  rect(s, 4, 1, 4, 3, "taxiway");
  rect(s, 25, 1, 25, 3, "taxiway");
  rect(s, 16, 24, 16, 26, "taxiway");
  rect(s, 39, 24, 39, 26, "taxiway");
  rect(s, 4, 4, 39, 4, "taxiway");
  rect(s, 4, 23, 39, 23, "taxiway");
  rect(s, 4, 5, 4, 22, "taxiway");
  rect(s, 39, 5, 39, 22, "taxiway");

  // north concourse
  gates(s, 5, [[8, 3], [13, 3], [18, 2], [23, 2], [28, 3], [33, 3]]);
  rect(s, 6, 6, 36, 7, "floor");
  row(s, 7, [20, 21], "customs", 2);
  row(s, 8, [12, 13, 29, 30], "tsa", 3);
  rect(s, 8, 9, 34, 10, "floor");
  row(s, 9, [10, 16, 26, 32], "checkin", 3);

  // central terminal area: curbs and the big parking block
  rect(s, 8, 11, 34, 11, "sidewalk");
  rect(s, 8, 16, 34, 16, "sidewalk");
  row(s, 12, [14, 21, 28], "sidewalk");
  row(s, 15, [14, 21, 28], "sidewalk");
  rect(s, 10, 13, 32, 14, "parking", 3);

  // south concourse
  rect(s, 8, 17, 34, 18, "floor");
  row(s, 18, [10, 16, 26, 32], "checkin", 3);
  row(s, 19, [12, 13, 29, 30], "tsa", 3);
  rect(s, 6, 20, 36, 21, "floor");
  row(s, 20, [20, 21], "customs", 2);
  gates(s, 22, [[8, 2], [13, 2], [18, 3], [23, 3], [28, 3], [33, 2]]);

  return finish(s, {
    name: "New York JFK",
    tier: 3,
    served: 6000,
    hello: "Welcome to JFK: twelve gates wrapped around the central terminal area.",
    goal: "Wide-bodies pay the most. Keep both security checkpoints flowing and sign international contracts.",
  });
}

// ---------------------------------------------------------------------------
// LAX: four parallel runways and a U-shaped terminal with the international pier on the west
// ---------------------------------------------------------------------------
function lax(): GameState {
  const s = createEmptyState(200000);
  rect(s, 0, 0, 17, 0, "runway");
  rect(s, 22, 2, 43, 2, "runway");
  rect(s, 0, 25, 21, 25, "runway");
  rect(s, 26, 27, 43, 27, "runway");
  rect(s, 3, 1, 3, 5, "taxiway");
  rect(s, 17, 1, 17, 5, "taxiway");
  rect(s, 22, 3, 22, 5, "taxiway");
  rect(s, 43, 3, 43, 5, "taxiway");
  rect(s, 3, 22, 3, 24, "taxiway");
  rect(s, 21, 22, 21, 24, "taxiway");
  rect(s, 26, 22, 26, 26, "taxiway");
  rect(s, 43, 22, 43, 26, "taxiway");
  rect(s, 3, 6, 43, 6, "taxiway");
  rect(s, 3, 21, 43, 21, "taxiway");
  rect(s, 3, 7, 3, 20, "taxiway");
  rect(s, 43, 7, 43, 20, "taxiway");

  // sterile U (outside) and landside U (inside)
  rect(s, 5, 8, 37, 9, "floor");
  rect(s, 5, 10, 6, 17, "floor");
  rect(s, 5, 18, 37, 19, "floor");
  rect(s, 8, 11, 37, 12, "floor");
  rect(s, 8, 13, 9, 14, "floor");
  rect(s, 8, 15, 37, 16, "floor");

  gates(s, 7, [[10, 2], [15, 2], [20, 2], [25, 2], [30, 2], [35, 2]]);
  gates(s, 20, [[10, 2], [15, 2], [20, 3], [25, 3], [30, 2], [35, 2]]);
  for (const y of [11, 14, 17]) set(s, 4, y, "gate", 3); // the international pier

  row(s, 10, [16, 17, 28, 29], "tsa", 3);
  row(s, 17, [16, 17, 28, 29], "tsa", 3);
  set(s, 7, 13, "tsa", 3);
  set(s, 7, 14, "tsa", 3);
  row(s, 11, [12, 20, 26, 34], "checkin", 3);
  row(s, 16, [12, 20, 26, 34], "checkin", 3);
  set(s, 8, 12, "checkin", 3);
  set(s, 8, 15, "checkin", 3);
  set(s, 5, 10, "customs", 2);
  set(s, 5, 16, "customs", 2);
  set(s, 22, 9, "customs", 2);
  set(s, 22, 18, "customs", 2);

  rect(s, 11, 13, 37, 14, "parking", 3);

  return finish(s, {
    name: "Los Angeles (LAX)",
    tier: 3,
    served: 6000,
    hello: "Welcome to LAX: four runways and a horseshoe of terminals, with the international pier out west.",
    goal: "Fifteen gates is a lot of passengers. Watch the queue badges and upgrade or add checkpoints.",
  });
}

// ---------------------------------------------------------------------------
// Atlanta: one terminal feeding a long two-sided concourse
// ---------------------------------------------------------------------------
function atlanta(): GameState {
  const s = createEmptyState(180000);
  rect(s, 2, 0, 27, 0, "runway");
  rect(s, 12, 14, 37, 14, "runway");
  rect(s, 20, 17, 43, 17, "runway");
  rect(s, 2, 1, 2, 3, "taxiway");
  rect(s, 27, 1, 27, 3, "taxiway");
  rect(s, 2, 4, 43, 4, "taxiway");
  rect(s, 10, 10, 43, 10, "taxiway");
  rect(s, 43, 5, 43, 9, "taxiway");
  rect(s, 12, 11, 12, 13, "taxiway");
  rect(s, 37, 11, 37, 13, "taxiway");
  rect(s, 43, 11, 43, 16, "taxiway");

  const sizes: [number, number][] = [[12, 2], [16, 2], [20, 2], [24, 2], [28, 2], [32, 3], [36, 3], [40, 3]];
  gates(s, 5, sizes);
  gates(s, 9, sizes);
  rect(s, 10, 6, 41, 8, "floor");
  set(s, 10, 5, "customs", 2);
  set(s, 10, 9, "customs", 2);
  rect(s, 9, 6, 9, 8, "tsa", 3);

  rect(s, 3, 5, 8, 9, "floor");
  set(s, 4, 6, "checkin", 3);
  set(s, 4, 8, "checkin", 3);
  set(s, 6, 5, "checkin", 3);
  set(s, 6, 9, "checkin", 3);
  rect(s, 5, 10, 5, 13, "sidewalk");
  rect(s, 1, 14, 9, 19, "parking", 3);

  return finish(s, {
    name: "Atlanta (ATL)",
    tier: 3,
    served: 6000,
    hello: "Welcome to Atlanta: sixteen gates on one long concourse, all fed by a single terminal.",
    goal: "Everyone funnels through three security lanes. That checkpoint is your whole game: fix the bottleneck.",
  });
}

export const SCENARIOS: Scenario[] = [
  {
    id: "tutorial",
    name: "Starter Airfield",
    code: "START",
    tagline: "Learn the ropes",
    blurb: "A tiny working regional airfield. Grow it from two small gates into an international airport.",
    facts: "Tier 1 · 2 gates · 1 runway · $30k",
    create: createTutorialAirport,
  },
  {
    id: "lga",
    name: "LaGuardia",
    code: "LGA",
    tagline: "Tight and domestic",
    blurb: "A cramped site with two short runways and shuttle buses. No wide-bodies until you rebuild the runway.",
    facts: "Tier 2 · 7 gates · 2 runways · $80k",
    create: laguardia,
  },
  {
    id: "jfk",
    name: "New York JFK",
    code: "JFK",
    tagline: "The international gateway",
    blurb: "Two long runways flank a ring of terminals around the central parking block. Built for wide-bodies.",
    facts: "Tier 3 · 12 gates · 2 runways · $150k",
    create: jfk,
  },
  {
    id: "lax",
    name: "Los Angeles",
    code: "LAX",
    tagline: "Four runways, one horseshoe",
    blurb: "A U of terminals between two pairs of runways, with the international pier at the west end.",
    facts: "Tier 3 · 15 gates · 4 runways · $200k",
    create: lax,
  },
  {
    id: "atl",
    name: "Atlanta",
    code: "ATL",
    tagline: "The busiest bottleneck",
    blurb: "Sixteen gates on one long concourse behind a single security checkpoint. Can you keep the line moving?",
    facts: "Tier 3 · 16 gates · 3 runways · $180k",
    create: atlanta,
  },
  {
    id: "blank",
    name: "Blank Field",
    code: "NEW",
    tagline: "Start from nothing",
    blurb: "Empty land and $60,000. Design your own airport from the first parking lot.",
    facts: "Tier 1 · empty · $60k",
    create: createBlankAirport,
  },
];
