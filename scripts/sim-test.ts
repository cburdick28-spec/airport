// Headless tests of the simulation engine: npm run test:sim
import { getAnalysis, tierProgress } from "../src/game/analysis";
import { BUILD, LOAN_STEP, MAX_STEP } from "../src/game/constants";
import { deserialize, serialize } from "../src/game/save";
import { SCENARIOS } from "../src/game/scenarios";
import {
  build,
  claimPlot,
  createEmptyState,
  demolish,
  placeProject,
  projectBlocker,
  finishAllConstruction,
  hourlyUpkeep,
  repayLoan,
  resetWeather,
  signContract,
  step,
  takeLoan,
  upgrade,
} from "../src/game/simulation";
import { claimablePlots, isOwned, plotRect, TERMINALS } from "../src/game/projects";
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
assert(s.money > 35_000_000, "tutorial airport is profitable in calm weather: " + Math.round(s.money));
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
s.money = 500_000_000;
let towerAt = -1;
for (let i = 0; i < s.tiles.length && towerAt < 0; i++) if (s.tiles[i].type === "empty" && isOwned(s, i)) towerAt = i;
assert(build(s, towerAt, "tower").ok && s.tiles[towerAt].type === "empty" && s.tiles[towerAt].site, "control tower construction starts");
assert(getAnalysis(s).tower === 0, "an unfinished tower does nothing yet");
run(s, BUILD.tower.time[0] + 2);
assert(s.tiles[towerAt].type === "tower" && !s.tiles[towerAt].site && getAnalysis(s).tower === 1, "tower opens when construction finishes");
assert(s.events.some((e) => e.text.includes("Control Tower is open")), "construction finished event");
setWeather(s, "fog", 90, 2);
assert(runwayBlock(s, getAnalysis(s), run0, 0, true)?.startsWith("Fog"), "fog blocks landings with a level 1 tower");
assert(runwayBlock(s, getAnalysis(s), run0, 0, false) === null, "fog still allows takeoffs");
assert(upgrade(s, towerAt).ok && s.tiles[towerAt].level === 1, "tower upgrade starts, old level keeps working");
assert(!upgrade(s, towerAt).ok, "can't stack two upgrades");
finishAllConstruction(s);
assert(runwayBlock(s, getAnalysis(s), run0, 0, true) === null, "ILS (tower L2) allows fog landings");
setWeather(s, "storm", 90, 12);
assert(upgrade(s, towerAt).ok, "radar upgrade ordered");
finishAllConstruction(s);
assert(runwayBlock(s, getAnalysis(s), run0, 0, true) === null, "storm radar (tower L3) keeps the runway open");

// cancelling construction refunds most of the money
const cash = s.money;
let lot = -1;
for (let i = s.tiles.length - 1; i >= 0 && lot < 0; i--) if (s.tiles[i].type === "empty" && !s.tiles[i].site && isOwned(s, i)) lot = i;
assert(build(s, lot, "gate").ok && s.money === cash - BUILD.gate.cost[0], "gate paid for up front");
assert(!build(s, lot, "gate").ok, "can't build on a construction site");
assert(demolish(s, lot).ok && !s.tiles[lot].site && s.money === cash - BUILD.gate.cost[0] * 0.25, "cancel refunds 75%");
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
assert(takeLoan(m).ok && m.loan === LOAN_STEP && m.money === before + LOAN_STEP, "loan taken");
let guard = 0;
while (takeLoan(m).ok && guard++ < 50);
assert(m.loan <= 30_000_000 + 16 * hourlyUpkeep(m) + LOAN_STEP, "loans are capped by airport size");
assert(repayLoan(m).ok, "loan repaid in part");
m.money = -1e9;
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

c.money = 500_000_000;
c.served = 600;
c.satisfaction = 95;
assert(upgrade(c, getAnalysis(c).gates[0].idx).ok, "gate upgrade to Medium ordered");
run(c, 10);
assert(c.tier === 1, "no promotion while the Medium gate is still being built");
run(c, BUILD.gate.time[1]);
c.satisfaction = 95;
run(c, 5);
assert(c.tier === 2, "tier 2 reached");
assert(tierProgress(c).some((r) => r.label.includes("Customs")), "tier 3 checklist shown");

const jfk = SCENARIOS.find((x) => x.id === "jfk")!.create();
calm(jfk);
jfk.served = 30000;
jfk.satisfaction = 95;
run(jfk, 10);
assert(jfk.tier === 4, "JFK with a radar tower and lots of passengers reaches Tier 4");
const big = getAnalysis(jfk).gates.find((g) => g.level === 3)!;
jfk.money = 1e9;
assert(upgrade(jfk, big.idx).ok, "Jumbo gate ordered");
const saved = deserialize(serialize(jfk));
assert(saved && saved.sites.length === 1 && saved.tiles[big.idx].site?.level === 4, "construction survives save/load");
finishAllConstruction(jfk);
assert(getAnalysis(jfk).gates.find((g) => g.idx === big.idx)!.classes.includes(3), "Jumbo gate takes Super Jumbos");
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

// old saves (before real-dollar prices) get their money converted
const old = JSON.parse(serialize(createTutorialAirport()));
old.money = 41000;
delete old.moneyScale;
const migrated = deserialize(JSON.stringify(old));
assert(migrated && migrated.money === 41_000_000, "old saves are converted to real dollars");

// ---------------------------------------------------------------------------
// land plots and terminal megaprojects
// ---------------------------------------------------------------------------
const L = createTutorialAirport();
calm(L);
L.money = 2e9;
assert(L.landPermits === 1 && claimablePlots(L).length > 0, "start with one land permit and plots to claim");
const plot = claimablePlots(L)[0];
const pr0 = plotRect(L, plot);
const outside = (pr0.y + 8) * L.w + pr0.x + 8;
assert(!build(L, outside, "parking").ok, "can't build on land you don't own");
assert(claimPlot(L, plot).ok && L.landPermits === 0 && build(L, outside, "parking").ok, "claimed plot is buildable");
demolish(L, outside);

/** find a spot for a terminal inside a plot */
function spotFor(s: GameState, id: string, p: number) {
  const r = plotRect(s, p);
  for (let rot = 0; rot < 4; rot++)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) if (!projectBlocker(s, id, rot, x, y)) return { x, y, rot };
  return null;
}
const spot = spotFor(L, "commuter", plot);
assert(spot, "a Commuter Terminal fits in a fresh plot");
const tpl = TERMINALS.find((t) => t.id === "commuter")!;
const cash0 = L.money;
const gates0 = getAnalysis(L).gates.length;
assert(placeProject(L, "commuter", spot!.rot, spot!.x, spot!.y).ok && L.money === cash0 - tpl.cost, `terminal ordered for ${tpl.cost}`);
assert(L.projects.length === 1 && getAnalysis(L).gates.length === gates0, "terminal not usable while it's being built");
run(L, tpl.time - 30);
assert(L.projects.length === 1, "still under construction just before opening");
run(L, 40);
assert(L.projects.length === 0 && getAnalysis(L).gates.length === gates0 + 3, "all 3 gates open at once");
assert(L.events.some((e) => e.text.startsWith("Ribbon cut!")) && L.celebrations.length === 1, "grand opening with a ribbon cutting");
assert(L.landPermits === 1, "finishing a terminal earns a land permit");
assert(L.labels.some((l) => l.text === "T1"), "the new terminal gets a sign");

const plot2 = claimablePlots(L)[0];
assert(claimPlot(L, plot2).ok, "second plot claimed");
const spot2 = spotFor(L, "commuter", plot2);
const cash1 = L.money;
assert(spot2 && placeProject(L, "commuter", spot2.rot, spot2.x, spot2.y).ok, "second terminal ordered");
const anyTile = L.projects[0].tiles[3];
assert(demolish(L, anyTile).ok && L.projects.length === 0 && L.sites.length === 0, "bulldozing a terminal site cancels the whole project");
assert(Math.abs(L.money - (cash1 - tpl.cost * 0.25)) < 1, "cancelled terminal refunds 75%");
assert(projectBlocker(L, "mega", 0, spot2!.x, spot2!.y) === "Needs a Tier 4 airport", "big terminals need a higher tier");

const reloaded = deserialize(serialize(L));
assert(reloaded && reloaded.owned.filter(Boolean).length === L.owned.filter(Boolean).length && reloaded.landPermits === L.landPermits, "land survives save/load");
console.log("ALL GOOD (land)");
