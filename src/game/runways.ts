// Runway geometry helpers shared by the engine and the renderers.

import type { GameState, RunwayRun } from "./types";

/** tile index at position `a` along the runway */
export function runIdx(s: GameState, r: RunwayRun, a: number): number {
  return r.vertical ? a * s.w + r.line : r.line * s.w + a;
}

export function runHas(r: RunwayRun, x: number, y: number): boolean {
  return r.vertical ? x === r.line && y >= r.a0 && y <= r.a1 : y === r.line && x >= r.a0 && x <= r.a1;
}

/** how far along the runway axis a point is */
export function runAlong(r: RunwayRun, x: number, y: number): number {
  return r.vertical ? y : x;
}

/** direction of travel in radians (0 = east, PI/2 = south) */
export function runHeading(r: RunwayRun): number {
  return r.vertical ? Math.PI / 2 : 0;
}

/**
 * Find every runway. Strips of 3+ tiles in a line count as a runway in that
 * direction, so two strips may share a tile where they cross.
 */
export function findRunways(s: GameState): RunwayRun[] {
  const runs: RunwayRun[] = [];
  const isRw = (x: number, y: number) => x >= 0 && y >= 0 && x < s.w && y < s.h && s.tiles[y * s.w + x].type === "runway";
  const covered = new Uint8Array(s.tiles.length);
  const short: RunwayRun[] = [];
  const make = (vertical: boolean, line: number, a0: number, a1: number): RunwayRun => ({
    vertical,
    line,
    a0,
    a1,
    len: a1 - a0 + 1,
    key: (vertical ? 10000 : 0) + line * 100 + a0,
    crosses: [],
  });

  for (let x = 0; x < s.w; x++) {
    let start = -1;
    for (let y = 0; y <= s.h; y++) {
      const on = isRw(x, y);
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= 3) {
          runs.push(make(true, x, start, y - 1));
          for (let k = start; k < y; k++) covered[k * s.w + x] = 1;
        }
        start = -1;
      }
    }
  }
  for (let y = 0; y < s.h; y++) {
    let start = -1;
    for (let x = 0; x <= s.w; x++) {
      const on = isRw(x, y);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= 3) runs.push(make(false, y, start, x - 1));
        else {
          // stubs only count when they are not just the width of a vertical runway
          let lone = false;
          for (let k = start; k < x; k++) if (!covered[y * s.w + k]) lone = true;
          if (lone) short.push(make(false, y, start, x - 1));
        }
        start = -1;
      }
    }
  }
  for (const h of runs) {
    if (h.vertical) continue;
    for (const v of runs) {
      if (!v.vertical) continue;
      if (v.line >= h.a0 && v.line <= h.a1 && h.line >= v.a0 && h.line <= v.a1) {
        h.crosses.push(v.key);
        v.crosses.push(h.key);
      }
    }
  }
  return runs.concat(short);
}

export interface RunwayMarks {
  /** per tile: 0 = not on a runway strip, 1 = horizontal, 2 = vertical, 3 = crossing */
  orient: Uint8Array;
  /** per tile: 1 when it is the first or last tile of a runway */
  end: Uint8Array;
}

/** per-tile paint info for drawing centre lines, thresholds and edge lights */
export function runwayMarks(s: GameState, runs: RunwayRun[]): RunwayMarks {
  const orient = new Uint8Array(s.tiles.length);
  const end = new Uint8Array(s.tiles.length);
  for (const r of runs) {
    if (r.len < 3) continue;
    for (let k = r.a0; k <= r.a1; k++) orient[runIdx(s, r, k)] |= r.vertical ? 2 : 1;
    end[runIdx(s, r, r.a0)] = 1;
    end[runIdx(s, r, r.a1)] = 1;
  }
  return { orient, end };
}
