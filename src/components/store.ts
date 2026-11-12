// Tiny external store that connects the mutable simulation state to React.
// The engine mutates GameState in place; React re-reads it whenever `bump()` runs.

import { BUILD } from "@/game/constants";
import { clearSave, loadGame, saveGame } from "@/game/save";
import { build, demolish, fireDriver, hireDriver, runMarketing, signContract, upgrade, type ActionResult } from "@/game/simulation";
import { createBlankAirport, createTutorialAirport } from "@/game/starter";
import type { GameState } from "@/game/types";
import type { Tool } from "@/render/renderer";

export interface Flash {
  text: string;
  kind: "info" | "good" | "bad";
  until: number;
}

const listeners = new Set<() => void>();
let tick = 0;

export const store = {
  state: null as GameState | null,
  speed: 1,
  paused: false,
  tool: null as Tool,
  hover: -1,
  flash: null as Flash | null,
  lastEventId: 0,
  /** true = 3D view (three.js), false = classic 2D canvas */
  view3d: true,

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  getTick: () => tick,
  bump() {
    tick++;
    listeners.forEach((l) => l());
  },

  init() {
    if (store.state) return;
    try {
      store.view3d = localStorage.getItem("airport-view") !== "2d";
    } catch {
      /* storage unavailable */
    }
    store.state = loadGame() ?? createTutorialAirport();
    store.lastEventId = store.state.nextId;
    store.bump();
  },
  newGame(kind: "tutorial" | "blank") {
    clearSave();
    store.state = kind === "tutorial" ? createTutorialAirport() : createBlankAirport();
    store.lastEventId = store.state.nextId;
    store.tool = null;
    store.paused = false;
    store.say(kind === "tutorial" ? "Tutorial airport loaded" : "Blank airport: build from scratch", "info");
  },
  save() {
    if (store.state) store.say(saveGame(store.state) ? "Game saved" : "Could not save (storage blocked)", "info");
  },

  say(text: string, kind: Flash["kind"] = "info") {
    if (!text) return;
    store.flash = { text, kind, until: performance.now() + 2600 };
    store.bump();
  },
  setSpeed(n: number) {
    store.speed = n;
    store.paused = false;
    store.bump();
  },
  setView3d(on: boolean, why?: string) {
    store.view3d = on;
    try {
      localStorage.setItem("airport-view", on ? "3d" : "2d");
    } catch {
      /* storage unavailable */
    }
    if (why) store.say(why, "bad");
    else store.bump();
  },
  sign(id: number) {
    const s = store.state;
    if (!s) return;
    const res = signContract(s, id);
    store.say(res.msg, res.ok ? "good" : "bad");
  },
  togglePause() {
    store.paused = !store.paused;
    store.bump();
  },
  setTool(t: Tool) {
    store.tool = t;
    store.bump();
  },

  /** apply the current tool to a tile. `dragging` = pointer is being dragged across tiles */
  applyTool(idx: number, dragging: boolean) {
    const s = store.state;
    const tool = store.tool;
    if (!s || !tool) return;
    let res: ActionResult | null = null;
    if (tool.kind === "build") {
      if (dragging && !BUILD[tool.type].paint) return;
      res = build(s, idx, tool.type);
      if (dragging && res.msg === "Already built here") return;
    } else if (tool.kind === "bulldoze") {
      res = demolish(s, idx);
    } else if (!dragging) {
      res = upgrade(s, idx);
    }
    if (!res) return;
    if (res.msg) store.say(res.msg, res.ok ? "good" : "bad");
    else store.bump();
  },
  staff(action: "hire" | "fire" | "marketing") {
    const s = store.state;
    if (!s) return;
    const res = action === "hire" ? hireDriver(s) : action === "fire" ? fireDriver(s) : runMarketing(s);
    store.say(res.msg, res.ok ? "good" : "bad");
  },
};
