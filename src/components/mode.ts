"use client";

// Which game is showing: the airport builder or Airline CEO.

export type Mode = "airport" | "airline";
const KEY = "airport-tycoon-mode";

type Listener = () => void;
const listeners = new Set<Listener>();
let mode: Mode | null = null;

export const modeStore = {
  get(): Mode {
    if (mode === null) {
      try {
        mode = localStorage.getItem(KEY) === "airline" ? "airline" : "airport";
      } catch {
        mode = "airport";
      }
    }
    return mode;
  },
  server: (): Mode | null => null,
  set(m: Mode) {
    mode = m;
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* storage unavailable */
    }
    for (const l of listeners) l();
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
