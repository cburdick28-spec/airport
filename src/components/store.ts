// Tiny external store that connects the mutable simulation state to React.
// The engine mutates GameState in place; React re-reads it whenever `bump()` runs.

import { BUILD } from "@/game/constants";
import { clearSave, loadGame, saveGame } from "@/game/save";
import {
  build,
  claimPlot,
  demolish,
  makeSandbox,
  placeProject,
  renameTerminal,
  setBaseStyle,
  styleTerminal,
  fireDriver,
  fireSnowCrew,
  hireDriver,
  hireSnowCrew,
  repayLoan,
  runMarketing,
  setFees,
  signContract,
  takeLoan,
  upgrade,
  type ActionResult,
} from "@/game/simulation";
import { plotOf } from "@/game/projects";
import { SCENARIOS } from "@/game/scenarios";
import { createTutorialAirport } from "@/game/starter";
import type { GameState, TerminalStyle } from "@/game/types";
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
  /** style and name for the next terminal you place */
  projectStyle: "glass" as TerminalStyle,
  projectName: "",
  /** airport picker dialog open? */
  picker: false,

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
  /** wipe the current game and load one of the pre-built airports */
  newGame(id: string, sandbox = false) {
    const sc = SCENARIOS.find((x) => x.id === id);
    if (!sc) return;
    clearSave();
    store.state = sc.create();
    if (sandbox) makeSandbox(store.state);
    store.lastEventId = store.state.nextId;
    store.tool = null;
    store.hover = -1;
    store.paused = false;
    store.picker = false;
    saveGame(store.state);
    store.say(`Now running: ${store.state.name}`, "good");
  },
  setPicker(open: boolean) {
    store.picker = open;
    store.bump();
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
  setProjectLook(style: TerminalStyle | null, name: string | null) {
    if (style) store.projectStyle = style;
    if (name !== null) store.projectName = name;
    store.bump();
  },
  renameTerminal(id: number, name: string) {
    if (store.state) store.say(renameTerminal(store.state, id, name).msg, "info");
  },
  styleTerminal(id: number, style: TerminalStyle) {
    if (store.state) store.say(styleTerminal(store.state, id, style).msg, "info");
  },
  setBaseStyle(style: TerminalStyle) {
    if (store.state) store.say(setBaseStyle(store.state, style).msg, "info");
  },
  rotate() {
    if (store.tool?.kind === "project") {
      store.tool = { ...store.tool, rot: (store.tool.rot + 1) % 4 };
      store.bump();
    }
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
      if (dragging && (res.msg === "Already built here" || res.msg === "Under construction")) return;
    } else if (tool.kind === "bulldoze") {
      res = demolish(s, idx);
    } else if (tool.kind === "project") {
      if (dragging) return;
      res = placeProject(s, tool.id, tool.rot, idx % s.w, Math.floor(idx / s.w), {
        name: store.projectName,
        style: store.projectStyle,
      });
      if (res.ok) {
        store.tool = null;
        store.projectName = "";
      }
    } else if (tool.kind === "claim") {
      if (dragging) return;
      res = claimPlot(s, plotOf(s, idx));
      if (res.ok) store.tool = null;
    } else if (!dragging) {
      res = upgrade(s, idx);
    }
    if (!res) return;
    if (res.msg) store.say(res.msg, res.ok ? "good" : "bad");
    else store.bump();
  },
  staff(action: "hire" | "fire" | "marketing" | "snowHire" | "snowFire" | "loan" | "repay") {
    const s = store.state;
    if (!s) return;
    const act = {
      hire: hireDriver,
      fire: fireDriver,
      marketing: runMarketing,
      snowHire: hireSnowCrew,
      snowFire: fireSnowCrew,
      loan: takeLoan,
      repay: repayLoan,
    }[action];
    const res = act(s);
    store.say(res.msg, res.ok ? "good" : "bad");
  },
  setFees(level: number) {
    const s = store.state;
    if (!s) return;
    const res = setFees(s, level);
    store.say(res.msg, "info");
  },
};
