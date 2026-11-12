// Headless smoke test of the simulation engine: npm run test:sim
import { getAnalysis } from "../src/game/analysis";
import { MAX_STEP } from "../src/game/constants";
import { deserialize, serialize } from "../src/game/save";
import { build, createEmptyState, step, upgrade } from "../src/game/simulation";
import { createTutorialAirport } from "../src/game/starter";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
  console.log("ok   " + msg);
}

function run(s: ReturnType<typeof createEmptyState>, minutes: number) {
  for (let i = 0; i < minutes / MAX_STEP; i++) step(s, MAX_STEP);
}

const s = createTutorialAirport();
const a = getAnalysis(s);
assert(a.gates.length === 2 && a.gates.every((g) => g.functional), "tutorial gates are functional: " + JSON.stringify(a.gates.map((g) => g.issues)));
assert(a.shuttleActive, "shuttle is running");
assert(s.flights.length > 0, "a flight is scheduled after warm-up");
assert(s.passengers.length > 0, "passengers are moving after warm-up");

const seen = new Set<string>();
let maxPax = 0;
for (let h = 0; h < 24; h++) {
  for (let i = 0; i < 60 / MAX_STEP; i++) {
    step(s, MAX_STEP);
    if (i % 20 === 0) for (const f of s.flights) seen.add(f.state);
  }
  maxPax = Math.max(maxPax, s.passengers.length);
  console.log(
    `  h${h + 1} money=${Math.round(s.money)} served=${s.served} sat=${s.satisfaction.toFixed(0)} flights=${s.flightsHandled} missed=${s.missedFlights} pax=${s.passengers.length} +${Math.round(s.incomeLastHour)} -${Math.round(s.expenseLastHour)}`,
  );
}
for (const st of ["scheduled", "landing", "taxiIn", "deboarding", "boarding", "taxiOut", "takeoff"])
  assert(seen.has(st), "flights reach state " + st);
assert(s.flightsHandled >= 10, "flights handled in 24h: " + s.flightsHandled);
assert(s.served >= 200, "passengers served in 24h: " + s.served);
assert(s.satisfaction >= 70, "satisfaction stays healthy: " + s.satisfaction.toFixed(1));
assert(s.money > 30000, "tutorial airport is profitable: " + Math.round(s.money));
assert(s.passengers.every((p) => isFinite(p.x) && isFinite(p.y)), "no NaN positions");

// tier progression
s.money = 500000;
s.served = 600;
const gate = a.gates[0].idx;
assert(upgrade(s, gate).ok, "gate upgrades to Medium");
run(s, 10);
assert(s.tier === 2, "tier 2 reached");
run(s, 600);
assert(s.flights.some((f) => f.cls === 1) || s.flightsHandled > 20, "sim keeps running at tier 2");
console.log(`  tier2: served=${s.served} sat=${s.satisfaction.toFixed(0)} missed=${s.missedFlights}`);

// blank airport diagnostics
const b = createEmptyState();
assert(getAnalysis(b).classStatus[0].reason === "Build a Parking Lot", "blank airport explains what is missing");
build(b, 5 * b.w + 5, "gate");
assert(getAnalysis(b).gates[0].issues.includes("No taxiway next to gate"), "gate reports missing taxiway");
assert(getAnalysis(b).gates[0].issues.includes("Needs TSA connection"), "gate reports missing TSA");

// save / load
const loaded = deserialize(serialize(s));
assert(loaded && loaded.money === Math.round(s.money) && loaded.tier === s.tier, "save round-trips");
if (loaded) {
  run(loaded, 200);
  assert(loaded.flightsHandled > s.flightsHandled, "loaded game keeps flying");
}
console.log("ALL GOOD");
