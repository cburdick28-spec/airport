// Canvas renderer. Everything is drawn with shapes, so the game ships zero image assets.

import { getAnalysis } from "@/game/analysis";
import { BUILD, PLANES } from "@/game/constants";
import { runHeadingDir, runProgress, runStart, runwayMarks, type RunwayMarks } from "@/game/runways";
import { currentWeather, runwayStates, type RunwayState } from "@/game/weather";
import { claimable, footprint, plotCols, plotOf, plotRect, plotRows, STYLES, styleAt, terminalName, TERMINALS } from "@/game/projects";
import { projectBlocker } from "@/game/simulation";
import { buildBlocker } from "@/game/simulation";
import type { Flight, GameState, TileType } from "@/game/types";

export type Tool =
  | { kind: "build"; type: Exclude<TileType, "empty"> }
  | { kind: "bulldoze" }
  | { kind: "upgrade" }
  | { kind: "project"; id: string; rot: number }
  | { kind: "claim" }
  | null;

/** colour of each kind of building in footprint previews */
export const PREVIEW_COLOR: Record<string, string> = {
  taxiway: "#8d97a6",
  gate: "#16a34a",
  floor: "#f8f5ee",
  checkin: "#2f6fed",
  tsa: "#7c3aed",
  customs: "#0d9488",
  sidewalk: "#c8c2b4",
  parking: "#687385",
};

export interface View {
  /** css pixels per tile */
  tile: number;
  /** visible part of the map in tiles (defaults to all of it) */
  clip?: { x: number; y: number; w: number; h: number };
  hover: number;
  tool: Tool;
}

const C = {
  grass: "#dce7d3",
  grassLine: "#cfdcc5",
  sidewalk: "#c8c2b4",
  floor: "#f8f5ee",
  floorLine: "#e7e2d6",
  parking: "#687385",
  runway: "#3a4150",
  taxiway: "#8d97a6",
  taxiLine: "#f2c94c",
  shuttle: "#f2b705",
  checkin: "#2f6fed",
  tsa: "#7c3aed",
  customs: "#0d9488",
  gate: ["", "#16a34a", "#d97706", "#dc2626", "#db2777"],
  dep: "#2563eb",
  arr: "#ea580c",
  missed: "#dc2626",
  ink: "#1f2937",
};

const GATE_LETTER = ["", "S", "M", "L", "J"];
const TAIL = ["#16a34a", "#2563eb", "#b91c1c", "#7c3aed", "#0f172a"];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTiles(ctx: CanvasRenderingContext2D, s: GameState, T: number, marks: RunwayMarks) {
  const type = (x: number, y: number): TileType =>
    x < 0 || y < 0 || x >= s.w || y >= s.h ? "empty" : s.tiles[y * s.w + x].type;

  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const t = s.tiles[y * s.w + x];
      if (t.type === "empty") continue;
      const px = x * T;
      const py = y * T;
      const cx = px + T / 2;
      const cy = py + T / 2;
      switch (t.type) {
        case "sidewalk":
          ctx.fillStyle = C.sidewalk;
          ctx.fillRect(px, py, T, T);
          break;
        case "floor":
        case "checkin":
        case "tsa":
        case "customs": {
          const st = STYLES[styleAt(s, y * s.w + x)];
          ctx.fillStyle = st.floor2d;
          ctx.fillRect(px, py, T, T);
          ctx.strokeStyle = st.line2d;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
          break;
        }
        case "parking": {
          ctx.fillStyle = C.parking;
          ctx.fillRect(px, py, T, T);
          ctx.strokeStyle = "rgba(255,255,255,0.75)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 1; i < 4; i++) {
            ctx.moveTo(px + (i * T) / 4, py + T * 0.15);
            ctx.lineTo(px + (i * T) / 4, py + T * 0.6);
          }
          ctx.stroke();
          ctx.fillStyle = "#fde68a";
          for (let l = 0; l < t.level; l++) ctx.fillRect(px + T * 0.14 + l * T * 0.2, py + T * 0.74, T * 0.13, T * 0.13);
          break;
        }
        case "shuttle": {
          ctx.fillStyle = C.sidewalk;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = C.shuttle;
          roundRect(ctx, px + T * 0.1, py + T * 0.1, T * 0.8, T * 0.8, T * 0.18);
          ctx.fill();
          ctx.fillStyle = C.ink;
          ctx.font = `700 ${T * 0.42}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("B", cx, cy + 1);
          break;
        }
        case "runway": {
          ctx.fillStyle = C.runway;
          ctx.fillRect(px, py, T, T);
          const o = marks.orient[y * s.w + x];
          if (o === 1 || o === 2) {
            ctx.save();
            ctx.translate(cx, cy);
            if (o === 2) ctx.rotate(Math.PI / 2);
            ctx.fillStyle = "#f8fafc";
            if (marks.end[y * s.w + x]) {
              // threshold "piano keys"
              for (let i = 0; i < 4; i++) ctx.fillRect(-T * 0.2, T * (-0.36 + i * 0.2), T * 0.4, T * 0.1);
            } else {
              ctx.fillRect(-T * 0.25, -T * 0.04, T * 0.5, T * 0.08);
            }
            ctx.restore();
          }
          break;
        }
        case "taxiway": {
          ctx.fillStyle = C.taxiway;
          ctx.fillRect(px, py, T, T);
          ctx.strokeStyle = C.taxiLine;
          ctx.lineWidth = Math.max(1, T * 0.07);
          ctx.beginPath();
          const link = (dx: number, dy: number) => {
            const n = type(x + dx, y + dy);
            if (n === "taxiway" || n === "runway" || n === "gate") {
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + (dx * T) / 2, cy + (dy * T) / 2);
            }
          };
          link(1, 0);
          link(-1, 0);
          link(0, 1);
          link(0, -1);
          ctx.stroke();
          break;
        }
        case "tower": {
          ctx.fillStyle = C.sidewalk;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = "#475569";
          ctx.beginPath();
          ctx.arc(cx, cy, T * 0.42, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#7dd3fc";
          ctx.beginPath();
          ctx.arc(cx, cy, T * 0.28, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#0f172a";
          ctx.font = `800 ${T * 0.34}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(t.level), cx, cy + 1);
          break;
        }
        case "gate": {
          ctx.fillStyle = STYLES[styleAt(s, y * s.w + x)].floor2d;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = C.gate[t.level];
          roundRect(ctx, px + T * 0.08, py + T * 0.08, T * 0.84, T * 0.84, T * 0.16);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `800 ${T * 0.5}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(GATE_LETTER[t.level], cx, cy + 1);
          break;
        }
      }
      // service desks sit on top of the floor
      if (t.type === "checkin" || t.type === "tsa" || t.type === "customs") {
        ctx.fillStyle = C[t.type];
        if (t.type === "checkin") {
          roundRect(ctx, px + T * 0.12, py + T * 0.3, T * 0.76, T * 0.4, T * 0.1);
          ctx.fill();
        } else {
          // walk-through arch
          ctx.fillRect(px + T * 0.14, py + T * 0.14, T * 0.16, T * 0.72);
          ctx.fillRect(px + T * 0.7, py + T * 0.14, T * 0.16, T * 0.72);
          ctx.fillRect(px + T * 0.14, py + T * 0.14, T * 0.72, T * 0.16);
        }
        ctx.fillStyle = "#fff";
        for (let l = 0; l < t.level; l++)
          ctx.fillRect(px + T * 0.2 + l * T * 0.2, py + (t.type === "checkin" ? T * 0.44 : T * 0.18), T * 0.12, T * 0.08);
      }
    }
  }
}

function drawPlane(ctx: CanvasRenderingContext2D, f: Flight, T: number) {
  const def = PLANES[f.cls];
  let alt = 0;
  if (f.state === "landing" && f.run) {
    const before = -runProgress(f.run, f.dir, f.x, f.y);
    if (before > 0) alt = Math.min(1, before / 12);
  }
  if (f.state === "takeoff") alt = Math.max(0, Math.min(1.4, (f.speed - 8) / 9));
  const L = def.size * T * (1 + alt * 0.25);
  const x = f.x * T + T / 2;
  const y = f.y * T + T / 2;

  const shape = (fill: string, tail: string | null) => {
    // fuselage
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, L / 2, L * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    // wings
    ctx.beginPath();
    ctx.moveTo(L * 0.1, 0);
    ctx.lineTo(-L * 0.12, -L * 0.46);
    ctx.lineTo(-L * 0.2, -L * 0.46);
    ctx.lineTo(-L * 0.08, 0);
    ctx.lineTo(-L * 0.2, L * 0.46);
    ctx.lineTo(-L * 0.12, L * 0.46);
    ctx.closePath();
    ctx.fill();
    // tailplane
    ctx.beginPath();
    ctx.moveTo(-L * 0.36, 0);
    ctx.lineTo(-L * 0.48, -L * 0.18);
    ctx.lineTo(-L * 0.52, -L * 0.18);
    ctx.lineTo(-L * 0.46, 0);
    ctx.lineTo(-L * 0.52, L * 0.18);
    ctx.lineTo(-L * 0.48, L * 0.18);
    ctx.closePath();
    ctx.fill();
    if (tail) {
      ctx.fillStyle = tail;
      ctx.beginPath();
      ctx.ellipse(-L * 0.4, 0, L * 0.09, L * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.ellipse(L * 0.4, 0, L * 0.05, L * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // shadow
  ctx.save();
  ctx.translate(x + alt * T * 0.9, y + T * 0.12 + alt * T * 1.4);
  ctx.rotate(f.heading);
  ctx.globalAlpha = 0.22;
  shape("#0f172a", null);
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(f.heading);
  shape("#ffffff", TAIL[f.cls]);
  ctx.strokeStyle = "rgba(15,23,42,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, L / 2, L * 0.085, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** land you don't own is shaded; in claim mode the plots you can take light up */
function drawLand(ctx: CanvasRenderingContext2D, s: GameState, T: number, view: View) {
  const claiming = view.tool?.kind === "claim";
  const hoverPlot = view.hover >= 0 ? plotOf(s, view.hover) : -1;
  for (let p = 0; p < plotCols(s) * plotRows(s); p++) {
    const r = plotRect(s, p);
    if (s.owned[p]) continue;
    const can = claiming && claimable(s, p);
    ctx.fillStyle = can ? (p === hoverPlot ? "rgba(34,197,94,0.38)" : "rgba(34,197,94,0.16)") : "rgba(30,41,59,0.3)";
    ctx.fillRect(r.x * T, r.y * T, r.w * T, r.h * T);
    ctx.strokeStyle = can ? "#22c55e" : "rgba(15,23,42,0.35)";
    ctx.lineWidth = can ? 2 : 1;
    ctx.setLineDash(can ? [] : [T * 0.5, T * 0.4]);
    ctx.strokeRect(r.x * T + 1, r.y * T + 1, r.w * T - 2, r.h * T - 2);
    ctx.setLineDash([]);
    if (can) {
      ctx.fillStyle = "#14532d";
      ctx.font = `800 ${Math.max(10, T * 1.1)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("CLAIM", (r.x + r.w / 2) * T, (r.y + r.h / 2) * T);
    }
  }
}

/** translucent preview of a terminal megaproject before you place it */
function drawGhost(ctx: CanvasRenderingContext2D, s: GameState, T: number, id: string, rot: number, hover: number) {
  const t = TERMINALS.find((x) => x.id === id);
  if (!t) return;
  const cx = hover % s.w;
  const cy = Math.floor(hover / s.w);
  const bad = projectBlocker(s, id, rot, cx, cy);
  ctx.globalAlpha = 0.7;
  for (const f of footprint(t, rot, cx, cy)) {
    ctx.fillStyle = PREVIEW_COLOR[f.type] ?? "#ffffff";
    ctx.fillRect(f.x * T, f.y * T, T, T);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = bad ? "#dc2626" : "#16a34a";
  ctx.lineWidth = 2;
  for (const f of footprint(t, rot, cx, cy)) ctx.strokeRect(f.x * T + 1, f.y * T + 1, T - 2, T - 2);
}

const CONFETTI = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#facc15"];

/** confetti and a banner for a grand opening */
function drawCelebrations(ctx: CanvasRenderingContext2D, s: GameState, T: number) {
  for (const c of s.celebrations) {
    const age = s.time - c.time;
    if (age > 60) continue;
    const cx = c.x * T + T / 2;
    const cy = c.y * T + T / 2;
    const t = (age % 12) / 12; // a fresh burst every 12 game minutes
    for (let i = 0; i < 70; i++) {
      const a = i * 2.39996;
      const sp = (0.5 + ((i * 37) % 10) / 10) * T * 6;
      const x = cx + Math.cos(a) * sp * t;
      const y = cy + Math.sin(a) * sp * t * 0.6 + t * t * T * 4;
      ctx.fillStyle = CONFETTI[i % CONFETTI.length];
      ctx.globalAlpha = 1 - t;
      ctx.fillRect(x, y, Math.max(2, T * 0.25), Math.max(2, T * 0.14));
    }
    ctx.globalAlpha = 1;
    const text = `GRAND OPENING ${c.text}`;
    ctx.font = `900 ${Math.max(11, T * 0.9)}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + T;
    ctx.fillStyle = "#dc2626";
    roundRect(ctx, cx - w / 2, cy - T * 3.2, w, T * 1.4, T * 0.4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy - T * 2.5);
  }
}

/** construction: dirt and hazard stripes, with a progress bar on buildings */
function drawSites(ctx: CanvasRenderingContext2D, s: GameState, T: number) {
  for (const idx of s.sites) {
    const t = s.tiles[idx];
    const site = t.site;
    if (!site) continue;
    const px = (idx % s.w) * T;
    const py = Math.floor(idx / s.w) * T;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, T, T);
    ctx.clip();
    if (t.type === "empty") {
      ctx.fillStyle = "#c8ab7d";
      ctx.fillRect(px, py, T, T);
    }
    ctx.strokeStyle = "rgba(245,158,11,0.85)";
    ctx.lineWidth = Math.max(1, T * 0.12);
    ctx.beginPath();
    for (let k = -T; k < T * 2; k += T * 0.4) {
      ctx.moveTo(px + k, py + T);
      ctx.lineTo(px + k + T, py);
    }
    if (t.type === "empty") ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = Math.max(1, T * 0.1);
    ctx.setLineDash([T * 0.2, T * 0.15]);
    ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);
    ctx.setLineDash([]);
    if (!BUILD[site.type].paint) {
      const pct = Math.min(1, Math.max(0, (s.time - site.start) / Math.max(1, site.done - site.start)));
      ctx.fillStyle = "rgba(15,23,42,0.8)";
      ctx.fillRect(px + T * 0.1, py + T * 0.78, T * 0.8, T * 0.14);
      ctx.fillStyle = "#facc15";
      ctx.fillRect(px + T * 0.1, py + T * 0.78, T * 0.8 * pct, T * 0.14);
    }
  }
}

/** red wash on closed runways, amber on limited ones, green arrows showing the landing direction */
function drawRunwayStatus(ctx: CanvasRenderingContext2D, s: GameState, T: number, states: RunwayState[]) {
  for (const st of states) {
    const r = st.run;
    const x0 = (r.vertical ? r.line : r.a0) * T;
    const y0 = (r.vertical ? r.a0 : r.line) * T;
    const w = (r.vertical ? 1 : r.len) * T;
    const h = (r.vertical ? r.len : 1) * T;
    if (st.status !== "open") {
      ctx.fillStyle = st.status === "closed" ? "rgba(220,38,38,0.42)" : "rgba(245,158,11,0.32)";
      ctx.fillRect(x0, y0, w, h);
    }
    if (st.status === "closed") continue;
    // chevrons near the touchdown end, pointing the way planes land
    const hd = runHeadingDir(r, st.dir);
    const start = runStart(r, st.dir);
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = Math.max(1.5, T * 0.12);
    for (let i = 0; i < 3; i++) {
      const along = start + st.dir * (1 + i * 0.7);
      const cx = (r.vertical ? r.line : along) * T + T / 2;
      const cy = (r.vertical ? along : r.line) * T + T / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(hd);
      ctx.beginPath();
      ctx.moveTo(-T * 0.18, -T * 0.32);
      ctx.lineTo(T * 0.14, 0);
      ctx.lineTo(-T * 0.18, T * 0.32);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** rain streaks, snowflakes, fog haze and storm gloom */
function drawWeather(ctx: CanvasRenderingContext2D, s: GameState, T: number, clip: { x: number; y: number; w: number; h: number }) {
  ctx.save();
  ctx.translate(clip.x * T, clip.y * T);
  const W = clip.w * T;
  const H = clip.h * T;
  const w = currentWeather(s);
  const now = performance.now() / 1000;
  const wind = (w.windDir + 180) * (Math.PI / 180); // direction the wind blows towards
  const drift = Math.min(1, w.windSpeed / 30);
  if (s.snowCover > 0.02) {
    ctx.fillStyle = `rgba(248,250,252,${0.35 * s.snowCover})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (w.kind === "storm" || w.kind === "rain" || w.kind === "cloudy") {
    ctx.fillStyle = w.kind === "storm" ? "rgba(30,41,59,0.3)" : w.kind === "rain" ? "rgba(51,65,85,0.16)" : "rgba(100,116,139,0.08)";
    ctx.fillRect(0, 0, W, H);
  }
  if (w.kind === "storm" && Math.sin(now * 1.7) > 0.985) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, 0, W, H);
  }
  if (w.kind === "fog") {
    ctx.fillStyle = "rgba(226,232,240,0.5)";
    ctx.fillRect(0, 0, W, H);
  }
  if (w.kind === "rain" || w.kind === "storm") {
    const n = w.kind === "storm" ? 260 : 160;
    const dx = Math.sin(wind) * drift * T * 0.5;
    ctx.strokeStyle = "rgba(191,219,254,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (((i * 97.13) % 1) * W + now * 40 * Math.sin(wind) * drift + i * 13.7) % W;
      const y = ((i * 53.71 + now * 520) % (H + 40)) - 20;
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + T * 0.9);
    }
    ctx.stroke();
  }
  if (w.kind === "snow") {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 220; i++) {
      const x = ((i * 71.3 + now * 30 * (0.5 + drift) * Math.sin(wind) + Math.sin(now + i) * 6) % W + W) % W;
      const y = (i * 37.9 + now * 45) % H;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + (i % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, s: GameState, view: View) {
  const T = view.tile;
  const W = s.w * T;
  const H = s.h * T;
  const a = getAnalysis(s);

  // ground + grid
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.grassLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= s.w; x++) {
    ctx.moveTo(x * T + 0.5, 0);
    ctx.lineTo(x * T + 0.5, H);
  }
  for (let y = 0; y <= s.h; y++) {
    ctx.moveTo(0, y * T + 0.5);
    ctx.lineTo(W, y * T + 0.5);
  }
  ctx.stroke();

  drawTiles(ctx, s, T, runwayMarks(s, a.runways));
  drawSites(ctx, s, T);
  drawLand(ctx, s, T, view);
  drawRunwayStatus(ctx, s, T, runwayStates(s, a));

  // shuttle route
  if (a.shuttleActive) {
    ctx.strokeStyle = "rgba(180,130,0,0.45)";
    ctx.lineWidth = Math.max(1, T * 0.08);
    ctx.setLineDash([T * 0.3, T * 0.3]);
    ctx.beginPath();
    a.stops.forEach((st, i) => {
      const nx = a.stops[(i + 1) % a.stops.length];
      ctx.moveTo((st % s.w) * T + T / 2, Math.floor(st / s.w) * T + T / 2);
      ctx.lineTo((nx % s.w) * T + T / 2, Math.floor(nx / s.w) * T + T / 2);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // gate labels + problem badges
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const g of a.gates) {
    const gx = (g.idx % s.w) * T;
    const gy = Math.floor(g.idx / s.w) * T;
    if (!g.functional) {
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(gx + T * 0.88, gy + T * 0.12, T * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${T * 0.36}px system-ui, sans-serif`;
      ctx.fillText("!", gx + T * 0.88, gy + T * 0.14);
    }
  }

  // queue badges
  ctx.font = `700 ${T * 0.4}px system-ui, sans-serif`;
  for (const key of Object.keys(s.facilities)) {
    const idx = Number(key);
    const q = s.facilities[idx].queue.length;
    if (q < 4) continue;
    const fx = (idx % s.w) * T + T * 0.9;
    const fy = Math.floor(idx / s.w) * T + T * 0.1;
    ctx.fillStyle = q >= 12 ? "#dc2626" : "#f59e0b";
    roundRect(ctx, fx - T * 0.34, fy - T * 0.26, T * 0.68, T * 0.52, T * 0.2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(String(q), fx, fy + 1);
  }

  // passengers
  const r = Math.max(1.5, T * 0.13);
  for (const p of s.passengers) {
    if (p.state === "onBus") continue;
    let x = p.x + p.ox;
    let y = p.y + p.oy;
    if (p.state === "queue") {
      const i = Math.min(p.queueIndex, 14);
      x = p.x - 0.3 + (i % 3) * 0.3;
      y = p.y + 0.5 + Math.floor(i / 3) * 0.26;
    } else if (p.state === "atGate") {
      x = p.x + p.ox * 1.7;
      y = p.y + p.oy * 1.7;
    }
    ctx.fillStyle = p.missed ? C.missed : p.kind === "dep" ? C.dep : C.arr;
    ctx.beginPath();
    ctx.arc(x * T + T / 2, y * T + T / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // buses
  for (const b of s.buses) {
    const tx = b.target % s.w;
    const ty = Math.floor(b.target / s.w);
    const ang = Math.atan2(ty - b.y, tx - b.x);
    ctx.save();
    ctx.translate(b.x * T + T / 2, b.y * T + T / 2);
    if (b.dwell <= 0) ctx.rotate(ang);
    ctx.fillStyle = "rgba(15,23,42,0.2)";
    roundRect(ctx, -T * 0.5, -T * 0.22, T, T * 0.52, T * 0.12);
    ctx.fill();
    ctx.fillStyle = C.shuttle;
    roundRect(ctx, -T * 0.5, -T * 0.28, T, T * 0.52, T * 0.12);
    ctx.fill();
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(T * 0.22, -T * 0.22, T * 0.2, T * 0.4);
    ctx.fillRect(-T * 0.38, -T * 0.22, T * 0.5, T * 0.1);
    ctx.fillRect(-T * 0.38, T * 0.08, T * 0.5, T * 0.1);
    ctx.restore();
  }

  // planes (parked ones first so moving traffic draws on top)
  const planes = s.flights.filter((f) => f.state !== "scheduled");
  planes.sort((p, q) => Number(p.state === "landing" || p.state === "takeoff") - Number(q.state === "landing" || q.state === "takeoff"));
  for (const f of planes) drawPlane(ctx, f, T);
  drawCelebrations(ctx, s, T);

  // terminal name signs
  if (s.labels.length > 0 || s.terminals.length > 0) {
    ctx.font = `800 ${Math.max(9, T * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const signs = [
      ...s.labels.map((l) => ({ ...l, bg: "rgba(15,23,42,0.82)" })),
      ...s.terminals.map((t) => ({ x: t.x, y: t.y, text: terminalName(t), bg: STYLES[t.style].accent })),
    ];
    for (const l of signs) {
      const lx = l.x * T + T / 2;
      const ly = l.y * T + T / 2;
      const w = ctx.measureText(l.text).width + T * 0.5;
      ctx.fillStyle = l.bg;
      roundRect(ctx, lx - w / 2, ly - T * 0.45, w, T * 0.9, T * 0.25);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(l.text, lx, ly + 1);
    }
  }

  drawWeather(ctx, s, T, view.clip ?? { x: 0, y: 0, w: s.w, h: s.h });

  // night tint
  const hour = (s.time / 60) % 24;
  const night = hour < 5 || hour >= 21 ? 1 : hour < 7 ? (7 - hour) / 2 : hour >= 19 ? (hour - 19) / 2 : 0;
  if (night > 0) {
    ctx.fillStyle = `rgba(15,23,60,${0.22 * night})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (view.tool?.kind === "project" && view.hover >= 0) {
    drawGhost(ctx, s, T, view.tool.id, view.tool.rot, view.hover);
    return;
  }

  // hover / tool preview
  if (view.hover >= 0) {
    const hx = (view.hover % s.w) * T;
    const hy = Math.floor(view.hover / s.w) * T;
    let color = "rgba(15,23,42,0.5)";
    let fill = "rgba(255,255,255,0.18)";
    if (view.tool?.kind === "build") {
      const bad = buildBlocker(s, view.hover, view.tool.type);
      color = bad ? "#dc2626" : "#16a34a";
      fill = bad ? "rgba(220,38,38,0.25)" : "rgba(22,163,74,0.3)";
    } else if (view.tool?.kind === "bulldoze") {
      color = "#dc2626";
      fill = "rgba(220,38,38,0.25)";
    } else if (view.tool?.kind === "upgrade") {
      color = "#7c3aed";
      fill = "rgba(124,58,237,0.25)";
    }
    ctx.fillStyle = fill;
    ctx.fillRect(hx, hy, T, T);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(hx + 1, hy + 1, T - 2, T - 2);

    // show which taxiway tile a hovered gate uses as its stand
    const g = a.gateByIdx.get(view.hover);
    if (g && g.stand >= 0) {
      ctx.strokeStyle = "#0ea5e9";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect((g.stand % s.w) * T + 2, Math.floor(g.stand / s.w) * T + 2, T - 4, T - 4);
      ctx.setLineDash([]);
    }
  }
}
