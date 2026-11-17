// Helpers for building pre-made layouts.

import type { GameState, TileType } from "./types";

/** shift everything that is built so it sits in the middle of the map */
export function recenter(s: GameState) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  s.tiles.forEach((t, i) => {
    if (t.type === "empty") return;
    const x = i % s.w;
    const y = Math.floor(i / s.w);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  });
  if (!isFinite(x0)) return;
  const dx = Math.floor((s.w - (x1 - x0 + 1)) / 2) - x0;
  const dy = Math.floor((s.h - (y1 - y0 + 1)) / 2) - y0;
  if (dx === 0 && dy === 0) return;
  const tiles = s.tiles.map(() => ({ type: "empty" as TileType, level: 1 }));
  s.tiles.forEach((t, i) => {
    if (t.type === "empty") return;
    const x = (i % s.w) + dx;
    const y = Math.floor(i / s.w) + dy;
    tiles[y * s.w + x] = t;
  });
  s.tiles = tiles;
  s.labels = s.labels.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }));
  s.version++;
}

/** put a building on the empty tile nearest to (x, y) */
export function placeNear(s: GameState, x: number, y: number, type: TileType, level = 1) {
  for (let r = 0; r < 20; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
        if (s.tiles[ny * s.w + nx].type !== "empty") continue;
        s.tiles[ny * s.w + nx] = { type, level };
        return;
      }
}
