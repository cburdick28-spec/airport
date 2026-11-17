// Headless tests of the simulation engine: npm run test:sim
import { getAnalysis, tierProgress } from "../src/game/analysis";
import { MAX_STEP } from "../src/game/constants";
import { deserialize, serialize } from "../src/game/save";
import { SCENARIOS } from "../src/game/scenarios";
import {
  build,
  createEmptyState,
  hourlyUpkeep,
  repayLoan,
  resetWeather,
  signContract,
  step,
  takeLoan,
  upgrade,
} from "../src/game/simulation";
import { createTutorialAirport } from "../src/game/starter";
import type { GameState, WeatherKind } from "../src/game/types";
import { runwayBlock, runwayDir, runwayStates } from "../src/game/weather";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
  console.log("ok   " + msg);
}

function run(s: GameState, minutes: number, each?: () => void) {
  for (let i = 0; i < minutes / MAX_STEP; i++) {
    step(s, MAX_STEP);
    each?.();
  }
}

/** pin the weather for the next `hours` */
function setWeather(s: GameState, kind: WeatherKind, windDir: number, windSpeed: number, hours = 48) {
  s.forecast = [{ kind, start: s.time, end: s.time + hours * 60, windDir, windSpeed }];
}

function calm(s: GameState) {
  s.calmUntil = Infinity;
  setWeather(s, "clear", 90, 6);
}

// ---------------------------------------------------------------------------
// starter airport: a normal calm day
// ---------------------------------------------------------------------------
const s = createTutorialAirport();
calm(s);
const a = getAnalysis(s);
assert(a.gates.length === 2 && a.gates.every((g) => g.functional), "tutorial gates are functional");
assert(a.shuttleActive, "shuttle is running");
assert(s.flights.length > 0 && s.passengers.length > 0, "flights and passengers alive after warm-up");

const seen = new Set<string>();
for (let h = 0; h < 24; h++) run(s, 60, () => s.flights.forEach((f) => seen.add(f.state)));
for (const st of ["scheduled", "landing", "taxiIn", "deboarding", "boarding", "taxiOut", "takeoff"])
  assert(seen.has(st), "flights reach state " + st);
console.log(`  24h: money ${Math.round(s.money)} served ${s.served} sat ${s.satisfaction.toFixed(0)} otp ${s.otp.toFixed(0)} flights ${s.flightsHandled}`);
assert(s.flightsHandled >= 15, "flights handled in 24h: " + s.flightsHandled);
assert(s.satisfaction >= 75, "satisfaction stays healthy: " + s.satisfaction.toFixed(1));
assert(s.otp >= 80, "on-time rate in calm weather: " + s.otp.toFixed(0));
assert(s.money > 35000, "tutorial airport is profitable in calm weather: " + Math.round(s.money));
assert(s.passengers.every((p) => isFinite(p.x) && isFinite(p.y)), "no NaN positions");

// ---------------------------------------------------------------------------
// wind: planes land into the wind, both ways along the runway
// ---------------------------------------------------------------------------
const run0 = getAnalysis(s).runways[0];
setWeather(s, "clear", 270, 10); // from the west: land westbound
assert(runwayDir(s, run0) === -1, "west wind: east-west runway used westbound");
let westbound = false;
let arrived = false;
run(s, 120, () =>
  s.flights.forEach((f) => {
    if (f.state === "landing" && f.dir === -1) westbound = true;
    if (westbound && f.dir === -1 && f.state === "deboarding") arrived = true;
  }),
);
assert(westbound && arrived, "a plane lands westbound and reaches its gate");
setWeather(s, "clear", 0, 30); // pure crosswind from the north
assert(runwayBlock(s, getAnalysis(s), run0, 0, true)?.startsWith("Crosswind"), "30 kt crosswind closes the runway to turboprops");
setWeather(s, "clear", 90, 6);

// ---------------------------------------------------------------------------
// storms: ground stop, holding, diversions, recovery
// ---------------------------------------------------------------------------
const div0 = s.diversions;
const fl0 = s.flightsHandled;
setWeather(s, "storm", 90, 20, 3);
assert(runwayStates(s, getAnalysis(s))[0].status === "closed", "thunderstorm closes the runway without a radar tower");
run(s, 150);
assert(s.diversions > div0, `long storm makes flights divert (${s.diversions - div0})`);
assert(s.flightsHandled === fl0 || s.flightsHandled - fl0 <= 2, "nothing lands mid-storm");
setWeather(s, "clear", 90, 6);
run(s, 180);
assert(s.flightsHandled > fl0 + 2, "traffic recovers after the storm");

// ---------------------------------------------------------------------------
// control tower: ILS for fog, radar for storms
// ---------------------------------------------------------------------------
s.money = 500000;
let towerAt = -1;
for (let i = 0; i < s.tiles.length && towerAt < 0; i++) if (s.tiles[i].type === "empty") towerAt = i;
assert(build(s, towerAt, "tower").ok, "control tower built");
setWeather(s, "fog", 90, 2);
assert(runwayBlock(s, getAnalysis(s), run0, 0, true)?.startsWith("Fog"), "fog blocks landings with a level 1 tower");
assert(runwayBlock(s, getAnalysis(s), run0, 0, false) === null, "fog still allows takeoffs");
assert(upgrade(s, towerAt).ok && runwayBlock(s, getAnalysis(s), run0, 0, true) === null, "ILS (tower L2) allows fog landings");
setWeather(s, "storm", 90, 12);
assert(upgrade(s, towerAt).ok && runwayBlock(s, getAnalysis(s), run0, 0, true) === null, "storm radar (tower L3) keeps the runway open");
calm(s);

// ---------------------------------------------------------------------------
// snow: one crew per runway
// ---------------------------------------------------------------------------
const lga = SCENARIOS.find((x) => x.id === "lga")!.create();
setWeather(lga, "snow", 45, 10);
lga.snowCrews = 1;
const lgaStates = runwayStates(lga, getAnalysis(lga));
assert(lgaStates.filter((r) => r.status !== "closed").length === 1, "LaGuardia in snow with one crew: one runway open");
lga.snowCrews = 0;
assert(runwayStates(lga, getAnalysis(lga)).every((r) => r.status === "closed"), "no snow crews: every runway closed");
setWeather(lga, "clear", 0, 28);
const lgaWind = runwayStates(lga, getAnalysis(lga));
assert(lgaWind.some((r) => r.run.vertical && r.status === "open") && lgaWind.some((r) => !r.run.vertical && r.status !== "open"), "north wind: the crossing runway takes over");

// ---------------------------------------------------------------------------
// money: loans, interest, bankruptcy
// ---------------------------------------------------------------------------
const m = createTutorialAirport();
calm(m);
const before = m.money;
assert(takeLoan(m).ok && m.loan === 25000 && m.money === before + 25000, "loan taken");
let guard = 0;
while (takeLoan(m).ok && guard++ < 50);
assert(m.loan <= 30000 + 16 * hourlyUpkeep(m) + 25000, "loans are capped by airport size");
assert(repayLoan(m).ok, "loan repaid in part");
m.money = -1e6;
run(m, 61);
assert(m.bankrupt, "a deep overdraft bankrupts the airport");
const t0 = m.time;
run(m, 30);
assert(m.time === t0, "a bankrupt airport stops simulating");

// ---------------------------------------------------------------------------
// contracts, tiers
// ---------------------------------------------------------------------------
const c = createTutorialAirport();
calm(c);
run(c, 10);
const offer = [...c.contractOffers].sort((x, y) => y.hours / y.flights - x.hours / x.flights)[0];
assert(signContract(c, offer.id).ok, `contract signed: ${offer.flights} flights in ${offer.hours}h`);
run(c, offer.hours * 60 + 5);
assert(c.contracts.every((k) => k.id !== offer.id), "contract resolved by its deadline");

c.money = 500000;
c.served = 600;
c.satisfaction = 95;
assert(upgrade(c, getAnalysis(c).gates[0].idx).ok, "gate upgrades to Medium");
run(c, 10);
assert(c.tier === 2, "tier 2 reached");
assert(tierProgress(c).some((r) => r.label.includes("Customs")), "tier 3 checklist shown");

const jfk = SCENARIOS.find((x) => x.id === "jfk")!.create();
calm(jfk);
jfk.served = 30000;
jfk.satisfaction = 95;
run(jfk, 10);
assert(jfk.tier === 4, "JFK with a radar tower and lots of passengers reaches Tier 4");
const big = getAnalysis(jfk).gates.find((g) => g.level === 3)!;
jfk.money = 1e6;
assert(upgrade(jfk, big.idx).ok && getAnalysis(jfk).gates.find((g) => g.idx === big.idx)!.classes.includes(3), "Jumbo gate takes Super Jumbos");
jfk.served = 120000;
jfk.otp = 95;
run(jfk, 10);
assert(jfk.tier === 5, "Tier 5 Global Mega-Hub reached");
let jumbo = false;
let sst = false;
run(jfk, 600, () =>
  jfk.flights.forEach((f) => {
    if (f.cls === 3 && f.state === "deboarding") jumbo = true;
    if (f.cls === 4 && f.state === "deboarding") sst = true;
  }),
);
assert(jumbo, "a Super Jumbo lands and parks");
assert(sst, "a Supersonic jet lands and parks");

// ---------------------------------------------------------------------------
// save / load
// ---------------------------------------------------------------------------
const loaded = deserialize(serialize(jfk));
assert(
  loaded && loaded.tier === 5 && loaded.forecast.length === jfk.forecast.length && loaded.snowCrews === jfk.snowCrews,
  "save round-trips tier, weather and crews",
);
assert(loaded && getAnalysis(loaded).tower === getAnalysis(jfk).tower, "tower survives save/load");
if (loaded) {
  calm(loaded);
  const f0 = loaded.flightsHandled;
  run(loaded, 120);
  assert(loaded.flightsHandled > f0, "loaded game keeps flying");
}

const blank = createEmptyState();
resetWeather(blank);
assert(getAnalysis(blank).classStatus[0].reason === "Build a Parking Lot", "blank airport explains what is missing");
console.log("ALL GOOD");
