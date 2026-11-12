// Shared frame loop: steps the simulation, asks the active view to draw,
// refreshes the React UI a few times per second and autosaves.

import { BASE_RATE, MAX_STEP } from "@/game/constants";
import { saveGame } from "@/game/save";
import { step } from "@/game/simulation";
import type { GameState } from "@/game/types";
import { store } from "./store";

export function startLoop(draw: (s: GameState, now: number, dtReal: number) => void): () => void {
  let raf = 0;
  let last = performance.now();
  let uiTimer = 0;
  let saveTimer = 0;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dtReal = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = store.state;
    if (!s) return;

    if (!store.paused) {
      let gm = dtReal * BASE_RATE * store.speed;
      while (gm > 1e-6) {
        const d = Math.min(MAX_STEP, gm);
        step(s, d);
        gm -= d;
      }
    }

    draw(s, now, dtReal);

    uiTimer += dtReal;
    if (uiTimer > 0.2) {
      uiTimer = 0;
      // surface important engine events as toasts
      const ev = s.events[s.events.length - 1];
      if (ev && ev.id > store.lastEventId) {
        store.lastEventId = ev.id;
        if (ev.kind !== "info") store.flash = { text: ev.text, kind: ev.kind, until: now + 4000 };
      }
      if (store.flash && now > store.flash.until) store.flash = null;
      store.bump();
    }
    saveTimer += dtReal;
    if (saveTimer > 20) {
      saveTimer = 0;
      saveGame(s);
    }
  };
  raf = requestAnimationFrame(frame);

  const onUnload = () => {
    if (store.state) saveGame(store.state);
  };
  window.addEventListener("beforeunload", onUnload);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("beforeunload", onUnload);
  };
}
