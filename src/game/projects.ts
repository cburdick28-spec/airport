// Land plots and terminal megaprojects.
//
// The map is split into 16 x 16 plots. You can only build on plots you own. Every airport
// starts with one land permit; each terminal megaproject you finish earns another one,
// which you spend to claim a plot that borders your land.
//
// A terminal megaproject is a whole pre-designed terminal (apron, gates, lounge, security,
// check-in, parking) placed in one go. It is built as a single project and opens all at
// once with a ribbon-cutting.

import { BUILD, type Tier } from "./constants";
import type { GameState, TerminalStyle, TileType } from "./types";

export const PLOT = 16;

export function plotCols(s: GameState) {
  return Math.ceil(s.w / PLOT);
}
export function plotRows(s: GameState) {
  return Math.ceil(s.h / PLOT);
}
export function plotOf(s: GameState, idx: number): number {
  const x = idx % s.w;
  const y = Math.floor(idx / s.w);
  return Math.floor(y / PLOT) * plotCols(s) + Math.floor(x / PLOT);
}
export function plotRect(s: GameState, plot: number) {
  const cols = plotCols(s);
  const x = (plot % cols) * PLOT;
  const y = Math.floor(plot / cols) * PLOT;
  return { x, y, w: Math.min(PLOT, s.w - x), h: Math.min(PLOT, s.h - y) };
}

export function isOwned(s: GameState, idx: number): boolean {
  return !!s.owned[plotOf(s, idx)];
}

/** a plot you could claim with a permit: not yours yet, but touching your land */
export function claimable(s: GameState, plot: number): boolean {
  if (s.owned[plot]) return false;
  const cols = plotCols(s);
  const rows = plotRows(s);
  const px = plot % cols;
  const py = Math.floor(plot / cols);
  const own = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && s.owned[y * cols + x];
  return own(px - 1, py) || own(px + 1, py) || own(px, py - 1) || own(px, py + 1);
}

export function claimablePlots(s: GameState): number[] {
  const out: number[] = [];
  for (let p = 0; p < plotCols(s) * plotRows(s); p++) if (claimable(s, p)) out.push(p);
  return out;
}

/** own every plot something is built on; an empty map gets the middle 2 x 2 plots */
export function initLand(s: GameState) {
  const n = plotCols(s) * plotRows(s);
  s.owned = new Array(n).fill(false);
  let any = false;
  s.tiles.forEach((t, i) => {
    if (t.type === "empty" && !t.site) return;
    s.owned[plotOf(s, i)] = true;
    any = true;
  });
  if (!any) {
    const cols = plotCols(s);
    const cx = Math.floor(cols / 2) - 1;
    const cy = Math.floor(plotRows(s) / 2) - 1;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
      s.owned[(cy + dy) * cols + cx + dx] = true;
  }
}

// ---------------------------------------------------------------------------
// Terminal templates
// ---------------------------------------------------------------------------

/**
 * Drawn with the apron at the top and parking at the bottom.
 * T taxiway apron, G/M/L/J gate (Small/Medium/Large/Jumbo), F floor, C check-in,
 * S security, U customs, W walkway, P parking, . left untouched.
 */
export interface TerminalTemplate {
  id: string;
  name: string;
  tier: Tier;
  /** build time in game minutes */
  time: number;
  desk: number;
  parking: number;
  rows: string[];
  blurb: string;
  cost: number;
}

const RAW: Omit<TerminalTemplate, "cost">[] = [
  {
    id: "commuter",
    name: "Commuter Terminal",
    tier: 1,
    time: 24 * 60,
    desk: 1,
    parking: 1,
    blurb: "3 Small gates with their own security, check-in and parking.",
    rows: [
      "TTTTTTTTTT",
      ".G..G..G..",
      "FFFFFFFFFF",
      "....SS....",
      "FFCFFFFCFF",
      "....WW....",
      "PPPPPPPPPP",
    ],
  },
  {
    id: "domestic",
    name: "Domestic Terminal",
    tier: 2,
    time: 36 * 60,
    desk: 2,
    parking: 2,
    blurb: "4 Medium gates for narrow-body jets, 4 security lanes.",
    rows: [
      "TTTTTTTTTTTTTTTT",
      ".M...M...M...M..",
      "FFFFFFFFFFFFFFFF",
      "......SSSS......",
      "FFCFFCFFFFCFFCFF",
      "......WWWW......",
      "PPPPPPPPPPPPPPPP",
      "PPPPPPPPPPPPPPPP",
    ],
  },
  {
    id: "international",
    name: "International Terminal",
    tier: 3,
    time: 60 * 60,
    desk: 3,
    parking: 2,
    blurb: "4 Large gates for wide-bodies, customs hall, 6 security lanes.",
    rows: [
      "TTTTTTTTTTTTTTTTTTTT",
      "..L....L....L....L..",
      "FFFFFFFFFFFFFFFFFFFF",
      "FFUFFFFFFFFFFFFFFUFF",
      ".......SSSSSS.......",
      "FFCFFCFFFFFFFFCFFCFF",
      ".......WWWWWW.......",
      "PPPPPPPPPPPPPPPPPPPP",
      "PPPPPPPPPPPPPPPPPPPP",
    ],
  },
  {
    id: "mega",
    name: "Mega Terminal",
    tier: 4,
    time: 84 * 60,
    desk: 3,
    parking: 3,
    blurb: "2 Jumbo and 2 Large gates, big customs hall, 8 security lanes.",
    rows: [
      "TTTTTTTTTTTTTTTTTTTTTTTT",
      "..J......J.....L.....L..",
      "FFFFFFFFFFFFFFFFFFFFFFFF",
      "FFUFFFFFFFFUUFFFFFFFFUFF",
      "FFFFFFFFFFFFFFFFFFFFFFFF",
      "........SSSSSSSS........",
      "FFCFFCFFCFFFFFFCFFCFFCFF",
      "........WWWWWWWW........",
      "PPPPPPPPPPPPPPPPPPPPPPPP",
      "PPPPPPPPPPPPPPPPPPPPPPPP",
    ],
  },
];

const CHAR: Record<string, { type: Exclude<TileType, "empty">; level: (t: Omit<TerminalTemplate, "cost">) => number }> = {
  T: { type: "taxiway", level: () => 1 },
  G: { type: "gate", level: () => 1 },
  M: { type: "gate", level: () => 2 },
  L: { type: "gate", level: () => 3 },
  J: { type: "gate", level: () => 4 },
  F: { type: "floor", level: () => 1 },
  C: { type: "checkin", level: (t) => t.desk },
  S: { type: "tsa", level: (t) => t.desk },
  U: { type: "customs", level: (t) => t.desk },
  W: { type: "sidewalk", level: () => 1 },
  P: { type: "parking", level: (t) => t.parking },
};

/** everything in the template at list price, plus 15% for doing it as one project */
function priceOf(t: Omit<TerminalTemplate, "cost">): number {
  let sum = 0;
  for (const row of t.rows)
    for (const ch of row) {
      const c = CHAR[ch];
      if (!c) continue;
      const def = BUILD[c.type];
      for (let l = 0; l < c.level(t); l++) sum += def.cost[l];
    }
  return Math.round((sum * 1.15) / 5_000_000) * 5_000_000;
}

export const TERMINALS: TerminalTemplate[] = RAW.map((t) => ({ ...t, cost: priceOf(t) }));

export interface FootTile {
  x: number;
  y: number;
  type: Exclude<TileType, "empty">;
  level: number;
}

/** template tiles placed with its centre on (cx, cy), rotated rot quarter-turns clockwise */
export function footprint(t: TerminalTemplate, rot: number, cx: number, cy: number): FootTile[] {
  const h = t.rows.length;
  const w = t.rows[0].length;
  const r = ((rot % 4) + 4) % 4;
  const rw = r % 2 === 0 ? w : h;
  const rh = r % 2 === 0 ? h : w;
  const ox = cx - Math.floor(rw / 2);
  const oy = cy - Math.floor(rh / 2);
  const out: FootTile[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = CHAR[t.rows[y][x]];
      if (!c) continue;
      let fx = x;
      let fy = y;
      if (r === 1) {
        fx = h - 1 - y;
        fy = x;
      } else if (r === 2) {
        fx = w - 1 - x;
        fy = h - 1 - y;
      } else if (r === 3) {
        fx = y;
        fy = w - 1 - x;
      }
      out.push({ x: ox + fx, y: oy + fy, type: c.type, level: c.level(t) });
    }
  return out;
}

/** these can be laid over the same thing already built, which helps hook a terminal up */
export const MERGEABLE: TileType[] = ["taxiway", "sidewalk", "parking"];

export function templateCounts(t: TerminalTemplate) {
  const gates: number[] = [0, 0, 0, 0, 0];
  let tsa = 0;
  let desks = 0;
  let customs = 0;
  for (const row of t.rows)
    for (const ch of row) {
      if (ch === "G") gates[1]++;
      if (ch === "M") gates[2]++;
      if (ch === "L") gates[3]++;
      if (ch === "J") gates[4]++;
      if (ch === "S") tsa++;
      if (ch === "C") desks++;
      if (ch === "U") customs++;
    }
  return { gates, tsa, desks, customs };
}

// ---------------------------------------------------------------------------
// Terminal names and styles
// ---------------------------------------------------------------------------

export interface StyleDef {
  name: string;
  blurb: string;
  /** swatch / sign colour */
  accent: string;
  // 2D
  floor2d: string;
  line2d: string;
  // 3D
  floor: string;
  base: string;
  wall: string;
  /** 1 = solid walls */
  wallOpacity: number;
  wallHeight: number;
  rail: string;
  /** rails glow this colour (neon) */
  glow?: string;
  /** see-through roof canopy */
  roof?: { color: string; opacity: number };
  /** plants along the walls */
  planters?: boolean;
}

export const STYLES: Record<TerminalStyle, StyleDef> = {
  classic: {
    name: "Classic",
    blurb: "Pale stone floors and low glass walls",
    accent: "#475569",
    floor2d: "#f8f5ee",
    line2d: "#e7e2d6",
    floor: "#f3efe6",
    base: "#dcd7cb",
    wall: "#bfe3ff",
    wallOpacity: 0.32,
    wallHeight: 0.52,
    rail: "#8a97a8",
  },
  glass: {
    name: "Glass",
    blurb: "Tall glass walls under a light canopy roof",
    accent: "#0284c7",
    floor2d: "#f0f9ff",
    line2d: "#cfe8f7",
    floor: "#f8fafc",
    base: "#e2e8f0",
    wall: "#a5f3fc",
    wallOpacity: 0.24,
    wallHeight: 0.9,
    rail: "#cbd5e1",
    roof: { color: "#e0f2fe", opacity: 0.2 },
  },
  brick: {
    name: "Brick",
    blurb: "Red brick walls and warm terracotta floors",
    accent: "#9a3412",
    floor2d: "#ecd2b4",
    line2d: "#dcb48c",
    floor: "#d9b08a",
    base: "#7c2d12",
    wall: "#a0452c",
    wallOpacity: 1,
    wallHeight: 0.42,
    rail: "#44403c",
  },
  futuristic: {
    name: "Futuristic",
    blurb: "Dark floors, violet glass and glowing neon trim",
    accent: "#7c3aed",
    floor2d: "#cbd5e1",
    line2d: "#a5b4fc",
    floor: "#273449",
    base: "#0f172a",
    wall: "#8b5cf6",
    wallOpacity: 0.32,
    wallHeight: 0.62,
    rail: "#22d3ee",
    glow: "#22d3ee",
  },
  eco: {
    name: "Eco",
    blurb: "Timber frames, green glass and planters",
    accent: "#15803d",
    floor2d: "#f1e7cf",
    line2d: "#dccba3",
    floor: "#e7d8b5",
    base: "#7c5a3a",
    wall: "#bbf7d0",
    wallOpacity: 0.28,
    wallHeight: 0.5,
    rail: "#8b5e34",
    planters: true,
  },
};

export const STYLE_IDS = Object.keys(STYLES) as TerminalStyle[];

export function terminalName(t: { code: string; custom: string }): string {
  return t.custom.trim() || t.code;
}

const styleCache = new WeakMap<GameState, { version: number; map: Map<number, TerminalStyle> }>();

/** style of each tile that belongs to a built terminal (others use s.baseStyle) */
export function styleMap(s: GameState): Map<number, TerminalStyle> {
  const hit = styleCache.get(s);
  if (hit && hit.version === s.version) return hit.map;
  const map = new Map<number, TerminalStyle>();
  for (const t of s.terminals) for (const i of t.tiles) map.set(i, t.style);
  styleCache.set(s, { version: s.version, map });
  return map;
}

export function styleAt(s: GameState, idx: number): TerminalStyle {
  return styleMap(s).get(idx) ?? s.baseStyle ?? "classic";
}
