// Canvas renderer. Everything is drawn with shapes, so the game ships zero image assets.

import { getAnalysis } from "@/game/analysis";
import { PLANES } from "@/game/constants";
import { buildBlocker } from "@/game/simulation";
import type { Flight, GameState, TileType } from "@/game/types";

export type Tool =
  | { kind: "build"; type: Exclude<TileType, "empty"> }
  | { kind: "bulldoze" }
  | { kind: "upgrade" }
  | null;

export interface View {
  /** css pixels per tile */
  tile: number;
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
  gate: ["", "#16a34a", "#d97706", "#dc2626"],
  dep: "#2563eb",
  arr: "#ea580c",
  missed: "#dc2626",
  ink: "#1f2937",
};

const GATE_LETTER = ["", "S", "M", "L"];
const TAIL = ["#16a34a", "#2563eb", "#b91c1c"];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTiles(ctx: CanvasRenderingContext2D, s: GameState, T: number) {
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
        case "customs":
          ctx.fillStyle = C.floor;
          ctx.fillRect(px, py, T, T);
          ctx.strokeStyle = C.floorLine;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
          break;
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
          const left = type(x - 1, y) === "runway";
          const right = type(x + 1, y) === "runway";
          ctx.fillStyle = "#f8fafc";
          if (!left || !right) {
            // threshold "piano keys"
            for (let i = 0; i < 4; i++) ctx.fillRect(px + T * 0.3, py + T * (0.14 + i * 0.2), T * 0.4, T * 0.1);
          } else {
            ctx.fillRect(px + T * 0.25, cy - T * 0.04, T * 0.5, T * 0.08);
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
        case "gate": {
          ctx.fillStyle = C.floor;
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
  if (f.state === "landing" && f.x < f.runwayX0) alt = Math.min(1, (f.runwayX0 - f.x) / 12);
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

  drawTiles(ctx, s, T);

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

  // night tint
  const hour = (s.time / 60) % 24;
  const night = hour < 5 || hour >= 21 ? 1 : hour < 7 ? (7 - hour) / 2 : hour >= 19 ? (hour - 19) / 2 : 0;
  if (night > 0) {
    ctx.fillStyle = `rgba(15,23,60,${0.22 * night})`;
    ctx.fillRect(0, 0, W, H);
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
