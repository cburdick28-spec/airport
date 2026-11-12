// Grid pathfinding.
// Passengers use Dijkstra "distance fields" (one per destination, cached until the
// layout changes) and simply walk downhill. Shuttle stops add ride edges to the graph.
// Planes use a plain BFS over runway + taxiway tiles.

import type { GameState, PathNode, RunwayRun, TileType } from "./types";

const WALKABLE: Record<TileType, boolean> = {
  empty: false,
  parking: true,
  shuttle: true,
  sidewalk: true,
  floor: true,
  checkin: true,
  tsa: true,
  customs: true,
  gate: true,
  runway: false,
  taxiway: false,
};

export function isWalkable(t: TileType): boolean {
  return WALKABLE[t];
}

export function isTaxi(t: TileType): boolean {
  return t === "runway" || t === "taxiway";
}

/** cost of stepping onto a tile that is not the destination */
function enterCost(t: TileType): number {
  switch (t) {
    case "parking":
      return 1.6;
    case "shuttle":
      return 1.2;
    case "checkin":
    case "tsa":
    case "customs":
      return 4;
    case "gate":
      return 8;
    default:
      return 1;
  }
}

function shuttleCost(s: GameState, a: number, b: number): number {
  const dx = Math.abs((a % s.w) - (b % s.w));
  const dy = Math.abs(Math.floor(a / s.w) - Math.floor(b / s.w));
  return 5 + 0.3 * (dx + dy);
}

export function neighbors(s: GameState, idx: number, out: number[]): number {
  const x = idx % s.w;
  const y = (idx - x) / s.w;
  let n = 0;
  if (y > 0) out[n++] = idx - s.w;
  if (x > 0) out[n++] = idx - 1;
  if (x < s.w - 1) out[n++] = idx + 1;
  if (y < s.h - 1) out[n++] = idx + s.w;
  return n;
}

// ---------------------------------------------------------------------------
// Field cache
// ---------------------------------------------------------------------------

interface Cache {
  version: number;
  shuttle: boolean;
  stops: number[];
  fields: Map<string, Float64Array>;
}

const caches = new WeakMap<GameState, Cache>();

function getCache(s: GameState): Cache {
  let c = caches.get(s);
  if (!c || c.version !== s.version) {
    const stops: number[] = [];
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].type === "shuttle") stops.push(i);
    c = {
      version: s.version,
      shuttle: stops.length >= 2 && s.drivers >= 1,
      stops,
      fields: new Map(),
    };
    caches.set(s, c);
  }
  return c;
}

export function shuttleActive(s: GameState): boolean {
  return getCache(s).shuttle;
}

export function shuttleStops(s: GameState): number[] {
  return getCache(s).stops;
}

/**
 * Distance (in walking cost) from every tile to the nearest of `targets`.
 * Infinity = unreachable.
 */
export function distanceField(s: GameState, key: string, targets: number[]): Float64Array {
  const cache = getCache(s);
  const hit = cache.fields.get(key);
  if (hit) return hit;

  const n = s.tiles.length;
  const dist = new Float64Array(n).fill(Infinity);
  const isTarget = new Uint8Array(n);
  // tiny binary heap of [cost, idx]
  const heapCost: number[] = [];
  const heapIdx: number[] = [];
  const push = (c: number, i: number) => {
    let p = heapCost.length;
    heapCost.push(c);
    heapIdx.push(i);
    while (p > 0) {
      const parent = (p - 1) >> 1;
      if (heapCost[parent] <= c) break;
      heapCost[p] = heapCost[parent];
      heapIdx[p] = heapIdx[parent];
      p = parent;
    }
    heapCost[p] = c;
    heapIdx[p] = i;
  };
  const pop = (): number => {
    const top = heapIdx[0];
    const c = heapCost.pop() as number;
    const i = heapIdx.pop() as number;
    const len = heapCost.length;
    if (len > 0) {
      let p = 0;
      for (;;) {
        let child = p * 2 + 1;
        if (child >= len) break;
        if (child + 1 < len && heapCost[child + 1] < heapCost[child]) child++;
        if (heapCost[child] >= c) break;
        heapCost[p] = heapCost[child];
        heapIdx[p] = heapIdx[child];
        p = child;
      }
      heapCost[p] = c;
      heapIdx[p] = i;
    }
    return top;
  };

  for (const t of targets) {
    if (t < 0 || t >= n) continue;
    dist[t] = 0;
    isTarget[t] = 1;
    push(0, t);
  }

  const nb = [0, 0, 0, 0];
  while (heapCost.length > 0) {
    const topCost = heapCost[0];
    const m = pop();
    if (topCost > dist[m]) continue;
    // cost for a neighbour to step onto m
    const step = isTarget[m] ? 1 : enterCost(s.tiles[m].type);
    const cnt = neighbors(s, m, nb);
    for (let k = 0; k < cnt; k++) {
      const v = nb[k];
      if (!WALKABLE[s.tiles[v].type]) continue;
      const nd = dist[m] + step;
      if (nd < dist[v]) {
        dist[v] = nd;
        push(nd, v);
      }
    }
    if (cache.shuttle && s.tiles[m].type === "shuttle") {
      for (const v of cache.stops) {
        if (v === m) continue;
        const nd = dist[m] + shuttleCost(s, m, v);
        if (nd < dist[v]) {
          dist[v] = nd;
          push(nd, v);
        }
      }
    }
  }

  cache.fields.set(key, dist);
  return dist;
}

export function fieldTo(s: GameState, target: number): Float64Array {
  return distanceField(s, "t" + target, [target]);
}

/** distance from a tile to the field's target, tolerating a non-walkable start tile */
export function distFrom(s: GameState, field: Float64Array, from: number): number {
  if (WALKABLE[s.tiles[from].type]) return field[from];
  const nb = [0, 0, 0, 0];
  const cnt = neighbors(s, from, nb);
  let best = Infinity;
  for (let k = 0; k < cnt; k++) {
    const v = nb[k];
    if (WALKABLE[s.tiles[v].type] && field[v] + 1 < best) best = field[v] + 1;
  }
  return best;
}

/** Walk downhill on a distance field. Returns null when there is no route. */
export function derivePath(s: GameState, field: Float64Array, from: number): PathNode[] | null {
  const cache = getCache(s);
  const path: PathNode[] = [];
  const nb = [0, 0, 0, 0];
  let cur = from;
  for (let guard = 0; guard < 4000; guard++) {
    if (field[cur] === 0 && WALKABLE[s.tiles[cur].type]) return path;
    let best = -1;
    let bestCost = Infinity;
    let ride = false;
    const cnt = neighbors(s, cur, nb);
    for (let k = 0; k < cnt; k++) {
      const v = nb[k];
      if (!WALKABLE[s.tiles[v].type]) continue;
      const c = field[v] + (field[v] === 0 ? 1 : enterCost(s.tiles[v].type));
      if (c < bestCost) {
        bestCost = c;
        best = v;
        ride = false;
      }
    }
    if (cache.shuttle && s.tiles[cur].type === "shuttle") {
      for (const v of cache.stops) {
        if (v === cur) continue;
        const c = field[v] + shuttleCost(s, cur, v);
        if (c < bestCost) {
          bestCost = c;
          best = v;
          ride = true;
        }
      }
    }
    if (best < 0 || !isFinite(bestCost)) return null;
    path.push({ idx: best, ride });
    cur = best;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Aircraft
// ---------------------------------------------------------------------------

/**
 * BFS over runway/taxiway tiles. When `oneWay` is given, tiles on that runway can
 * only be travelled left-to-right (used for the landing roll so planes never U-turn).
 */
export function taxiPath(s: GameState, from: number, to: number, oneWay?: RunwayRun): number[] | null {
  if (from === to) return [from];
  const n = s.tiles.length;
  const prev = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const queue: number[] = [from];
  seen[from] = 1;
  const nb = [0, 0, 0, 0];
  const onRun = (i: number) => {
    if (!oneWay) return false;
    const x = i % s.w;
    const y = (i - x) / s.w;
    return y === oneWay.row && x >= oneWay.x0 && x <= oneWay.x1;
  };
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cnt = neighbors(s, cur, nb);
    for (let k = 0; k < cnt; k++) {
      const v = nb[k];
      if (seen[v] || !isTaxi(s.tiles[v].type)) continue;
      // no rolling backwards (or re-entering) on the landing runway
      if (oneWay && onRun(v) && !(onRun(cur) && v === cur + 1)) continue;
      seen[v] = 1;
      prev[v] = cur;
      if (v === to) {
        const path: number[] = [];
        for (let p = to; p !== -1; p = prev[p]) path.push(p);
        return path.reverse();
      }
      queue.push(v);
    }
  }
  return null;
}

/** every taxi tile reachable from `from` */
export function taxiReach(s: GameState, from: number): Uint8Array {
  const seen = new Uint8Array(s.tiles.length);
  const queue: number[] = [from];
  seen[from] = 1;
  const nb = [0, 0, 0, 0];
  for (let head = 0; head < queue.length; head++) {
    const cnt = neighbors(s, queue[head], nb);
    for (let k = 0; k < cnt; k++) {
      const v = nb[k];
      if (seen[v] || !isTaxi(s.tiles[v].type)) continue;
      seen[v] = 1;
      queue.push(v);
    }
  }
  return seen;
}
