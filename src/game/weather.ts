// Wind and weather. Planes land and take off into the wind, crosswinds close runways for
// some aircraft, storms stop traffic, fog blocks landings without ILS and snow closes any
// runway the snow crews can't keep clear.

import { PLANES } from "./constants";
import type { Analysis, Climate, GameState, RunwayRun, WeatherKind, WeatherSpell } from "./types";

export interface WeatherInfo {
  name: string;
  /** wind speed range in knots */
  wind: [number, number];
  /** spell length range in minutes */
  length: [number, number];
  /** knocked off every aircraft's crosswind limit */
  crosswindPenalty: number;
}

export const WEATHER: Record<WeatherKind, WeatherInfo> = {
  clear: { name: "Clear", wind: [3, 16], length: [180, 420], crosswindPenalty: 0 },
  cloudy: { name: "Cloudy", wind: [6, 20], length: [150, 360], crosswindPenalty: 0 },
  rain: { name: "Rain", wind: [10, 26], length: [90, 240], crosswindPenalty: 4 },
  storm: { name: "Thunderstorm", wind: [18, 40], length: [40, 110], crosswindPenalty: 4 },
  fog: { name: "Fog", wind: [0, 5], length: [90, 240], crosswindPenalty: 0 },
  snow: { name: "Snow", wind: [8, 28], length: [120, 300], crosswindPenalty: 6 },
};

const CLIMATES: Record<Climate, Record<WeatherKind, number>> = {
  temperate: { clear: 34, cloudy: 22, rain: 16, storm: 8, fog: 9, snow: 11 },
  coastal: { clear: 50, cloudy: 16, rain: 8, storm: 3, fog: 23, snow: 0 },
  southern: { clear: 40, cloudy: 18, rain: 18, storm: 17, fog: 7, snow: 0 },
};

export const CLIMATE_NAMES: Record<Climate, string> = {
  temperate: "Four seasons: storms, fog and snow",
  coastal: "Mild coast: mostly sun, lots of fog",
  southern: "Warm south: frequent thunderstorms",
};

/** how far ahead the forecast is generated, in minutes */
const HORIZON = 16 * 60;

const CALM: Record<WeatherKind, number> = { clear: 50, cloudy: 30, rain: 20, storm: 0, fog: 0, snow: 0 };

function pick(s: GameState, start: number, prev?: WeatherKind): WeatherKind {
  const w = start < s.calmUntil ? CALM : (CLIMATES[s.climate] ?? CLIMATES.temperate);
  const kinds = Object.keys(w) as WeatherKind[];
  for (let tries = 0; tries < 6; tries++) {
    let r = Math.random() * kinds.reduce((t, k) => t + w[k], 0);
    for (const k of kinds) {
      r -= w[k];
      if (r <= 0) {
        // bad weather rarely repeats back to back
        if (k === prev && k !== "clear" && k !== "cloudy" && tries < 5 && kinds.length > 3) break;
        return k;
      }
    }
  }
  return "clear";
}

function makeSpell(s: GameState, start: number, prev?: WeatherSpell, kind?: WeatherKind): WeatherSpell {
  const k = kind ?? pick(s, start, prev?.kind);
  const info = WEATHER[k];
  const len = info.length[0] + Math.random() * (info.length[1] - info.length[0]);
  // wind drifts from the last spell; storms can swing it hard
  const swing = k === "storm" ? 140 : 70;
  const base = prev ? prev.windDir : Math.random() * 360;
  const windDir = (((base + (Math.random() - 0.5) * swing) % 360) + 360) % 360;
  const windSpeed = Math.round(info.wind[0] + Math.random() * (info.wind[1] - info.wind[0]));
  return { kind: k, start, end: start + Math.round(len), windDir: Math.round(windDir), windSpeed };
}

/** keep the forecast filled and drop spells that are over */
export function updateWeather(s: GameState, dt: number) {
  if (s.forecast.length === 0) s.forecast.push(makeSpell(s, s.time, undefined, "clear"));
  while (s.forecast.length > 1 && s.forecast[0].end <= s.time) s.forecast.shift();
  if (s.forecast[0].end <= s.time) {
    const last = s.forecast[0];
    s.forecast = [makeSpell(s, s.time, last)];
  }
  while (s.forecast[s.forecast.length - 1].end < s.time + HORIZON) {
    const last = s.forecast[s.forecast.length - 1];
    s.forecast.push(makeSpell(s, last.end, last));
  }
  const now = s.forecast[0];
  if (now.kind === "snow") s.snowCover = Math.min(1, s.snowCover + dt / 150);
  else s.snowCover = Math.max(0, s.snowCover - dt / (now.kind === "rain" ? 90 : 240));
}

export function currentWeather(s: GameState): WeatherSpell {
  return s.forecast[0] ?? { kind: "clear", start: s.time, end: s.time + 60, windDir: 90, windSpeed: 5 };
}

/** start the airport with calm weather so the first minutes are readable */
export function initWeather(s: GameState) {
  s.forecast = [makeSpell(s, s.time, undefined, "clear")];
  s.forecast[0].end = s.time + 150 + Math.round(Math.random() * 90);
  updateWeather(s, 0);
}

// ---------------------------------------------------------------------------
// Runway use
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;

/** direction planes use the runway right now: always into the wind */
export function runwayDir(s: GameState, r: RunwayRun): 1 | -1 {
  const w = currentWeather(s);
  const t = w.windDir * RAD;
  // horizontal: +1 = heading east, wanted when the wind comes from the east
  // vertical:   +1 = heading south, wanted when the wind comes from the south
  return r.vertical ? (Math.cos(t) <= 0 ? 1 : -1) : Math.sin(t) >= 0 ? 1 : -1;
}

export function crosswind(s: GameState, r: RunwayRun): number {
  const w = currentWeather(s);
  const t = w.windDir * RAD;
  return Math.round(Math.abs(w.windSpeed * (r.vertical ? Math.sin(t) : Math.cos(t))));
}

export function crosswindLimit(s: GameState, cls: number): number {
  return PLANES[cls].crosswind - WEATHER[currentWeather(s).kind].crosswindPenalty;
}

/** runways the snow crews keep clear (longest first, one crew each) */
export function plowedRunways(s: GameState, a: Analysis): Set<number> {
  const keep = new Set<number>();
  if (currentWeather(s).kind !== "snow") return keep;
  const sorted = a.runways.filter((r) => r.len >= 8).sort((p, q) => q.len - p.len || p.key - q.key);
  for (let i = 0; i < Math.min(s.snowCrews, sorted.length); i++) keep.add(sorted[i].key);
  return keep;
}

/**
 * Why a runway can't be used right now by this aircraft class, or null if it can.
 * `landing` = arrival (fog only blocks landings).
 */
export function runwayBlock(s: GameState, a: Analysis, r: RunwayRun, cls: number, landing: boolean): string | null {
  const w = currentWeather(s);
  if (w.kind === "storm" && a.tower < 3) return "Thunderstorm ground stop (tower L3 radar keeps runways open)";
  if (w.kind === "fog" && landing && a.tower < 2) return "Fog: landings need ILS (tower L2)";
  if (w.kind === "snow" && !plowedRunways(s, a).has(r.key)) return "Snow on runway: hire snow crews (Staff tab)";
  const xw = crosswind(s, r);
  const limit = crosswindLimit(s, cls);
  if (xw > limit) return `Crosswind ${xw} kt is over the ${limit} kt limit for ${PLANES[cls].short}`;
  return null;
}

/** compass name for a direction in degrees */
export function compass(deg: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** human name of a runway, e.g. "09/27" style from its axis and position */
export function runwayName(r: RunwayRun): string {
  return (r.vertical ? "N-S " : "E-W ") + "runway (" + r.len + ")";
}

export interface RunwayState {
  run: RunwayRun;
  dir: 1 | -1;
  crosswind: number;
  /** "open" for everything that fits, "limited" for some aircraft or arrivals only, "closed" for all */
  status: "open" | "limited" | "closed";
  reason: string | null;
}

export function runwayStates(s: GameState, a: Analysis): RunwayState[] {
  return a.runways
    .filter((r) => r.len >= PLANES[0].minRunway)
    .map((run) => {
      let blocked = 0;
      let total = 0;
      let reason: string | null = null;
      PLANES.forEach((p, c) => {
        if (run.len < p.minRunway || p.tier > s.tier) return;
        for (const landing of [true, false]) {
          total++;
          const why = runwayBlock(s, a, run, c, landing);
          if (why) {
            blocked++;
            if (!reason) reason = why;
          }
        }
      });
      const status = blocked === 0 ? "open" : blocked >= total ? "closed" : "limited";
      return { run, dir: runwayDir(s, run), crosswind: crosswind(s, run), status, reason };
    });
}
