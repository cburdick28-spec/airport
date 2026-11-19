"use client";

// Tiny external store for Airline CEO mode (same pattern as the airport store).

import type { Tier } from "@/airline/data";
import * as E from "@/airline/engine";

type Listener = () => void;

export type AirlineTab = "routes" | "fleet" | "money" | "news";

class AirlineStore {
  state: E.AirlineState | null = null;
  ready = false;
  speed = 1;
  paused = false;
  city: string | null = null;
  route: number | null = null;
  tab: AirlineTab = "routes";
  /** route planner choices */
  plan = { hub: "", type: "a320", fare: 1 as Tier, cabin: 1 as Tier };
  flash: { text: string; kind: "good" | "bad" | "info"; until: number } | null = null;
  lastEventId = 0;
  setup = false;
  private listeners = new Set<Listener>();
  private v = 0;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  version = () => this.v;
  bump() {
    this.v++;
    for (const l of this.listeners) l();
  }

  init() {
    if (this.ready) return;
    this.ready = true;
    this.state = E.loadAirline();
    this.setup = !this.state;
    if (this.state) this.lastEventId = this.state.events.at(-1)?.id ?? 0;
    this.bump();
  }

  start(hub: string, name: string, color: string, preset: string) {
    this.state = E.createAirline(hub, name, color, preset);
    this.lastEventId = this.state.events.at(-1)?.id ?? 0;
    this.setup = false;
    this.city = null;
    this.route = null;
    this.plan.hub = hub;
    this.paused = false;
    E.saveAirline(this.state);
    this.bump();
  }

  showSetup(on: boolean) {
    this.setup = on && true;
    this.bump();
  }

  /** run an engine action and show its message */
  act(fn: (s: E.AirlineState) => E.Result) {
    if (!this.state) return;
    const r = fn(this.state);
    if (r.msg) this.toast(r.msg, r.ok ? "info" : "bad");
    this.bump();
    return r;
  }

  toast(text: string, kind: "good" | "bad" | "info" = "info") {
    this.flash = { text, kind, until: performance.now() + 3500 };
    this.bump();
  }

  selectCity(code: string | null) {
    this.city = code;
    if (code && this.state) {
      if (!this.state.hubs.includes(this.plan.hub)) this.plan.hub = this.state.hubs[0];
    }
    this.bump();
  }
  selectRoute(id: number | null) {
    this.route = id;
    this.bump();
  }
  setTab(t: AirlineTab) {
    this.tab = t;
    this.bump();
  }
  setPlan(p: Partial<AirlineStore["plan"]>) {
    Object.assign(this.plan, p);
    this.bump();
  }
  setSpeed(n: number) {
    if (n === 0) this.paused = !this.paused;
    else {
      this.speed = n;
      this.paused = false;
    }
    this.bump();
  }
}

export const airline = new AirlineStore();
