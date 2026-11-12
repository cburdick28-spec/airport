// Pre-built airports the player can jump straight into.
// Runway layouts follow the real airports; terminals are simplified.

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

/** taxiway rectangle that leaves existing runway tiles alone (so taxiways can cross runways) */
function taxi(s: GameState, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (s.tiles[y * s.w + x].type !== "runway") set(s, x, y, "taxiway");
}

// Runway positions below come from real runway end coordinates (OurAirports data),
// rotated so the runways line up with the grid and scaled to fit. Terminals are placed
// by hand in the right area of each airport.

// ---------------------------------------------------------------------------
// LaGuardia: runways 4/22 and 13/31 cross in an X, terminals in the south-east corner
// (about 125 m per tile, map rotated 32 degrees)
// ---------------------------------------------------------------------------
function laguardia(): GameState {
  const s = createEmptyState(80000);
  rect(s, 26, 8, 26, 24, "runway"); // 4/22
  rect(s, 23, 12, 39, 12, "runway"); // 13/31

  taxi(s, 29, 15, 46, 15); // north apron
  taxi(s, 29, 16, 29, 23); // west apron
  taxi(s, 22, 14, 29, 14); // crosses 4/22 to reach the 13 threshold
  taxi(s, 22, 12, 22, 13);
  taxi(s, 27, 8, 27, 13); // crosses 13/31 to reach the 22 threshold
  taxi(s, 34, 13, 34, 14);
  taxi(s, 39, 13, 39, 14);
  taxi(s, 27, 17, 28, 17);
  taxi(s, 27, 22, 28, 22);
  taxi(s, 20, 13, 21, 13);

  // Terminals B and C
  gates(s, 16, [[33, 2], [37, 2], [41, 2], [45, 2]]);
  rect(s, 31, 17, 46, 18, "floor");
  rect(s, 31, 19, 31, 23, "floor");
  set(s, 30, 19, "gate", 2);
  set(s, 30, 22, "gate", 2);
  row(s, 19, [36, 37], "tsa", 2);
  rect(s, 33, 20, 43, 21, "floor");
  row(s, 20, [34, 39, 42], "checkin", 2);
  rect(s, 33, 22, 44, 22, "sidewalk");
  rect(s, 33, 23, 43, 24, "parking", 2);
  set(s, 45, 22, "shuttle");
  rect(s, 48, 26, 52, 28, "parking");
  set(s, 47, 27, "sidewalk");
  set(s, 46, 27, "shuttle");

  // Marine Air Terminal (Terminal A) on the far side of 4/22
  set(s, 20, 14, "gate", 1);
  rect(s, 19, 15, 21, 15, "floor");
  set(s, 20, 16, "tsa");
  rect(s, 19, 17, 21, 17, "floor");
  set(s, 19, 17, "checkin");
  set(s, 20, 18, "sidewalk");
  rect(s, 19, 19, 21, 19, "parking");

  return finish(s, {
    name: "LaGuardia (LGA)",
    tier: 2,
    served: 500,
    drivers: 2,
    hello: "Welcome to LaGuardia: two crossing 7,000 ft runways and no room to spare.",
    goal: "The runways are 17 tiles, one short of wide-body length, and they cross: only one can be used at a time.",
  });
}

// ---------------------------------------------------------------------------
// JFK: four runways in a pinwheel around the central terminal area
// (about 90 m per tile, map rotated 31 degrees)
// ---------------------------------------------------------------------------
function jfk(): GameState {
  const s = createEmptyState(150000);
  rect(s, 1, 28, 51, 28, "runway"); // 13R/31L
  rect(s, 17, 6, 51, 6, "runway"); // 13L/31R
  rect(s, 43, 3, 43, 41, "runway"); // 4L/22R
  rect(s, 53, 2, 53, 30, "runway"); // 4R/22L

  // apron ring around the terminals
  taxi(s, 19, 9, 39, 9);
  taxi(s, 19, 24, 39, 24);
  taxi(s, 19, 10, 19, 23);
  taxi(s, 39, 10, 39, 23);
  // 13L/31R
  taxi(s, 17, 7, 17, 9);
  taxi(s, 18, 9, 18, 9);
  taxi(s, 30, 7, 30, 8);
  taxi(s, 41, 1, 41, 9); // crosses 13L to reach the 4L and 4R thresholds
  taxi(s, 40, 9, 40, 9);
  taxi(s, 42, 3, 42, 3);
  taxi(s, 42, 1, 52, 1);
  taxi(s, 52, 2, 52, 2);
  // 4L/22R exits
  taxi(s, 40, 12, 42, 12);
  taxi(s, 40, 20, 42, 20);
  // southern parallel taxiway for 13R/31L
  taxi(s, 1, 26, 52, 26);
  taxi(s, 1, 27, 1, 27);
  taxi(s, 19, 25, 19, 25);
  taxi(s, 39, 25, 39, 25);
  taxi(s, 12, 27, 12, 27);
  taxi(s, 30, 27, 30, 27);
  taxi(s, 40, 27, 40, 27);
  // 4R/22L exits cross 4L on the way in
  taxi(s, 40, 14, 52, 14);

  // sterile ring (outside) with gates facing the apron
  rect(s, 21, 11, 37, 11, "floor");
  rect(s, 21, 21, 37, 22, "floor");
  rect(s, 21, 12, 22, 20, "floor");
  rect(s, 36, 12, 37, 20, "floor");
  gates(s, 10, [[24, 2], [28, 2], [32, 2], [36, 2]]);
  gates(s, 23, [[23, 3], [28, 3], [33, 3]]);
  for (const y of [13, 17, 21]) set(s, 20, y, "gate", 2);
  for (const y of [13, 18]) set(s, 38, y, "gate", 3);
  row(s, 22, [24, 30], "customs", 2);
  set(s, 36, 19, "customs", 2);

  // security, then the landside ring (inside)
  row(s, 12, [27, 28], "tsa", 3);
  row(s, 20, [27, 28, 31], "tsa", 3);
  set(s, 23, 15, "tsa", 3);
  set(s, 23, 16, "tsa", 3);
  set(s, 35, 15, "tsa", 3);
  set(s, 35, 16, "tsa", 3);
  rect(s, 24, 13, 34, 13, "floor");
  rect(s, 24, 19, 34, 19, "floor");
  rect(s, 24, 14, 24, 18, "floor");
  rect(s, 34, 14, 34, 18, "floor");
  row(s, 13, [25, 31], "checkin", 3);
  row(s, 19, [26, 32], "checkin", 3);
  set(s, 24, 17, "checkin", 3);
  set(s, 34, 17, "checkin", 3);

  // central parking, plus a remote lot on the AirTrain (shuttle) loop
  rect(s, 25, 14, 33, 14, "sidewalk");
  rect(s, 25, 18, 33, 18, "sidewalk");
  rect(s, 25, 15, 25, 17, "sidewalk");
  rect(s, 33, 15, 33, 17, "sidewalk");
  rect(s, 26, 15, 32, 17, "parking", 3);
  set(s, 29, 14, "shuttle");
  rect(s, 4, 12, 11, 15, "parking", 2);
  rect(s, 12, 13, 12, 14, "sidewalk");
  set(s, 13, 13, "shuttle");

  return finish(s, {
    name: "New York JFK",
    tier: 3,
    served: 6000,
    drivers: 2,
    hello: "Welcome to JFK: four runways in a pinwheel around the central terminal area.",
    goal: "Runway 4L/22R crosses both 13s, so those three block each other. Watch how the traffic queues.",
  });
}

// ---------------------------------------------------------------------------
// LAX: two pairs of parallel runways with the terminal horseshoe between them
// (about 80 m per tile, map rotated 7 degrees)
// ---------------------------------------------------------------------------
function lax(): GameState {
  const s = createEmptyState(200000);
  rect(s, 6, 10, 40, 10, "runway"); // 6L/24R
  rect(s, 2, 13, 43, 13, "runway"); // 6R/24L
  rect(s, 15, 30, 63, 30, "runway"); // 7L/25R
  rect(s, 18, 33, 60, 33, "runway"); // 7R/25L

  taxi(s, 2, 15, 48, 15);
  taxi(s, 23, 16, 48, 16);
  taxi(s, 23, 27, 48, 27);
  taxi(s, 15, 28, 60, 28);
  taxi(s, 23, 17, 23, 26);
  taxi(s, 48, 17, 48, 26);
  for (const x of [2, 30, 43]) taxi(s, x, 14, x, 14);
  for (const x of [6, 24, 40]) taxi(s, x, 11, x, 14); // the outer runway's traffic crosses the inner one
  for (const x of [15, 40, 56, 60]) taxi(s, x, 29, x, 29);
  for (const x of [18, 40, 60]) taxi(s, x, 29, x, 32);

  // sterile U (outside)
  rect(s, 25, 18, 47, 18, "floor");
  rect(s, 25, 25, 47, 25, "floor");
  rect(s, 25, 19, 26, 24, "floor");
  gates(s, 17, [[29, 2], [33, 2], [37, 2], [41, 2], [45, 2]]);
  gates(s, 26, [[29, 2], [33, 2], [37, 2], [41, 2], [45, 2]]);
  set(s, 24, 18, "gate", 3); // Tom Bradley International at the west end
  set(s, 24, 22, "gate", 3);
  set(s, 24, 25, "gate", 2);
  set(s, 25, 20, "customs", 2);
  set(s, 26, 23, "customs", 2);

  // security and the landside U (inside)
  row(s, 19, [33, 34, 41, 42], "tsa", 3);
  row(s, 24, [33, 34, 41, 42], "tsa", 3);
  set(s, 27, 21, "tsa", 3);
  set(s, 27, 22, "tsa", 3);
  rect(s, 28, 20, 46, 20, "floor");
  rect(s, 28, 23, 46, 23, "floor");
  rect(s, 28, 21, 28, 22, "floor");
  row(s, 20, [31, 37, 44], "checkin", 3);
  row(s, 23, [31, 37, 44], "checkin", 3);

  rect(s, 29, 21, 29, 22, "sidewalk");
  rect(s, 30, 21, 46, 22, "parking", 3);
  set(s, 47, 21, "shuttle");
  rect(s, 52, 19, 58, 23, "parking", 2);
  set(s, 51, 21, "shuttle");

  return finish(s, {
    name: "Los Angeles (LAX)",
    tier: 3,
    served: 6000,
    drivers: 2,
    hello: "Welcome to LAX: two pairs of parallel runways with the terminal horseshoe in between.",
    goal: "Planes from the outer runways have to cross the inner ones. Thirteen gates: watch the queue badges.",
  });
}

// ---------------------------------------------------------------------------
// Atlanta: five parallel runways, two terminals and seven concourses on one spine
// (about 80 m per tile, no rotation needed)
// ---------------------------------------------------------------------------
function atlanta(): GameState {
  const s = createEmptyState(180000);
  rect(s, 13, 1, 47, 1, "runway"); // 8L/26R
  rect(s, 13, 5, 51, 5, "runway"); // 8R/26L
  rect(s, 2, 22, 47, 22, "runway"); // 9L/27R
  rect(s, 2, 26, 36, 26, "runway"); // 9R/27L
  rect(s, 2, 42, 36, 42, "runway"); // 10/28

  taxi(s, 1, 7, 58, 7);
  taxi(s, 1, 20, 58, 20);
  taxi(s, 1, 8, 1, 42);
  taxi(s, 58, 8, 58, 19);
  taxi(s, 12, 1, 12, 6);
  for (const x of [13, 30, 51]) taxi(s, x, 6, x, 6);
  for (const x of [30, 47]) taxi(s, x, 2, x, 6);
  for (const x of [30, 47]) taxi(s, x, 21, x, 21);
  taxi(s, 36, 21, 36, 25);
  taxi(s, 37, 21, 37, 42);

  // concourses T, A, B, C, D, E, F hang off the central spine (the Plane Train)
  const bars = [10, 16, 22, 28, 34, 40, 46];
  const inBar = (x: number) => bars.some((c) => Math.abs(x - c) <= 1);
  for (const [y0, y1] of [[8, 12], [15, 19]])
    for (let x = 7; x <= 50; x++) if (!inBar(x)) taxi(s, x, y0, x, y1);
  rect(s, 8, 13, 51, 14, "floor");
  for (const c of bars) {
    rect(s, c, 8, c, 12, "floor");
    rect(s, c, 15, c, 19, "floor");
    set(s, c - 1, 9, "gate", 2);
    set(s, c - 1, 16, "gate", 2);
    if (c !== 46) {
      set(s, c + 1, 11, "gate", 2);
      set(s, c + 1, 18, "gate", 2);
    } else {
      // Concourse F: the international gates
      for (const y of [9, 12, 15, 18]) set(s, c + 1, y, "gate", 3);
    }
  }

  // Domestic terminal (west)
  rect(s, 7, 13, 7, 14, "tsa", 3);
  rect(s, 3, 12, 6, 15, "floor");
  for (const [x, y] of [[3, 12], [3, 15], [5, 12], [5, 15]]) set(s, x, y, "checkin", 3);
  rect(s, 3, 8, 6, 11, "parking", 3);
  rect(s, 3, 16, 6, 19, "parking", 3);

  // International terminal (east)
  rect(s, 52, 13, 52, 14, "tsa", 3);
  set(s, 52, 12, "customs", 2);
  set(s, 52, 15, "customs", 2);
  rect(s, 53, 12, 56, 15, "floor");
  set(s, 55, 12, "checkin", 3);
  set(s, 55, 15, "checkin", 3);
  rect(s, 53, 8, 56, 11, "parking", 3);
  rect(s, 53, 16, 56, 19, "parking", 3);

  return finish(s, {
    name: "Atlanta (ATL)",
    tier: 3,
    served: 6000,
    hello: "Welcome to Atlanta: five parallel runways, two terminals and seven concourses on one long spine.",
    goal: "Thirty gates share four security lanes. That checkpoint is your whole game: fix the bottleneck.",
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
    blurb: "Two short crossing runways, Terminals B and C in the corner and the little Marine Air Terminal across the field.",
    facts: "Tier 2 · 7 gates · 2 crossing runways · $80k",
    create: laguardia,
  },
  {
    id: "jfk",
    name: "New York JFK",
    code: "JFK",
    tagline: "The international gateway",
    blurb: "Four runways in a pinwheel around the central terminal ring. 4L/22R crosses both 13s, just like the real thing.",
    facts: "Tier 3 · 12 gates · 4 runways · $150k",
    create: jfk,
  },
  {
    id: "lax",
    name: "Los Angeles",
    code: "LAX",
    tagline: "Four runways, one horseshoe",
    blurb: "A U of terminals between two pairs of parallel runways, with Tom Bradley International at the west end.",
    facts: "Tier 3 · 13 gates · 4 runways · $200k",
    create: lax,
  },
  {
    id: "atl",
    name: "Atlanta",
    code: "ATL",
    tagline: "The busiest bottleneck",
    blurb: "Five parallel runways and seven concourses on one spine, with a terminal at each end. Security is the choke point.",
    facts: "Tier 3 · 30 gates · 5 runways · $180k",
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
