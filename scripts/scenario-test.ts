// Headless check of every pre-built airport: npm run test:scenarios
import { getAnalysis } from "../src/game/analysis";
import { MAX_STEP } from "../src/game/constants";
import { SCENARIOS } from "../src/game/scenarios";
import { step } from "../src/game/simulation";
import type { GameState } from "../src/game/types";

/** layouts are tested in mild weather; storms are covered by sim-test and the balance report */
function mild(s: GameState) {
  s.calmUntil = Infinity;
  s.forecast = [{ kind: "clear", start: s.time, end: s.time + 90, windDir: Math.random() * 360, windSpeed: 8 }];
}

const CH: Record<string, string> = { empty: ".", parking: "P", shuttle: "B", sidewalk: "-", floor: "_", checkin: "C", tsa: "T", customs: "U", gate: "G", runway: "=", taxiway: "+" };
let failed = false;
const check = (ok: unknown, msg: string) => {
  console.log((ok ? "ok   " : "FAIL ") + msg);
  if (!ok) failed = true;
};

for (const sc of SCENARIOS) {
  if (sc.id === "blank") continue;
  const t0 = Date.now();
  const s = sc.create();
  mild(s);
  console.log(`\n=== ${sc.name} (${sc.code}) ===`);
  if (process.argv.includes("--map"))
    for (let y = 0; y < s.h; y++) console.log(s.tiles.slice(y * s.w, (y + 1) * s.w).map((t) => (t.type === "gate" ? String(t.level) : CH[t.type])).join(""));
  const a = getAnalysis(s);
  const broken = a.gates.filter((g) => !g.functional);
  check(broken.length === 0, `all ${a.gates.length} gates functional ${broken.map((g) => g.name + ": " + g.issues[0]).join("; ")}`);
  check(a.gates.every((g) => g.runways.length === a.runways.length), `every gate reaches all ${a.runways.length} runways`);
  const used = new Set<number>();
  const startMoney = s.money;
  const startServed = s.served;
  let cancelled = 0;
  let maxPax = 0;
  for (let h = 0; h < 24; h++) {
    for (let i = 0; i < 60 / MAX_STEP; i++) {
      step(s, MAX_STEP);
      if (i % 40 === 0) for (const f of s.flights) if (f.run) used.add(f.run.key);
    }
    maxPax = Math.max(maxPax, s.passengers.length);
  }
  // weather diversions are expected; anything else means the layout is broken
  const layoutCancels = s.events.filter((e) => e.text.includes("cancelled") && !e.text.includes("diverted"));
  cancelled = layoutCancels.length;
  if (cancelled) console.log("  cancelled:", layoutCancels.map((e) => e.text).join(" | "));
  console.log(
    `  24h: flights=${s.flightsHandled} served=+${s.served - startServed} sat=${s.satisfaction.toFixed(0)} missed=${s.missedFlights} money ${Math.round(startMoney)} -> ${Math.round(s.money)} maxPax=${maxPax} runwaysUsed=${used.size}/${a.runways.length} (${Date.now() - t0}ms)`,
  );
  check(s.flightsHandled >= 20, "flights keep coming");
  check(cancelled === 0, "no flights cancelled by the layout");
  check(used.size >= Math.min(2, a.runways.length), "more than one runway gets used");
  check(a.runways.every((r) => r.len >= 8), "no stray runway stubs: " + a.runways.map((r) => (r.vertical ? "V" : "H") + r.len).join(" "));
  check(s.money > startMoney, "airport makes money");
  check(s.satisfaction >= 55, "satisfaction is playable");
}
if (failed) process.exit(1);
console.log("\nALL SCENARIOS GOOD");
