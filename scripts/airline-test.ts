// Headless tests for Airline CEO mode: npm run test:airline
import { CITIES } from "../src/airline/data";
import {
  addPlane,
  closeRoute,
  createAirline,
  hubBlocker,
  idlePlanes,
  leasePlane,
  levelOf,
  openHub,
  openRoute,
  removePlane,
  returnPlane,
  routeBlocker,
  routeStats,
  setCabin,
  setFare,
  step,
  takeLoan,
  totals,
  type AirlineState,
} from "../src/airline/engine";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
  console.log("ok   " + msg);
}
function days(s: AirlineState, n: number) {
  for (let i = 0; i < n * 1440; i += 2) step(s, 2);
}

const s = createAirline("JFK", "Liberty Air", "#2563eb");
assert(s.hubs[0] === "JFK" && s.cash === 30_000_000 && s.routes.length === 0, "airline founded at JFK with $30M");
assert(routeBlocker(s, "JFK", "LHR", "a320") === null, "JFK-LHR is in A320 range");
assert(routeBlocker(s, "JFK", "NRT", "a320")?.startsWith("Too far"), "JFK-NRT is too far for an A320");
assert(routeBlocker(s, "JFK", "NRT", "b787")?.includes("level 3"), "787 is locked at the start");
assert(routeBlocker(s, "LAX", "SFO", "a320")?.includes("hubs"), "routes must start at a hub");

assert(openRoute(s, "JFK", "ORD", "a320", 1, 1).ok, "JFK-ORD opened (average price, average seats)");
assert(openRoute(s, "JFK", "LAX", "a320", 1, 0).ok, "JFK-LAX opened (average price, basic seats)");
assert(openRoute(s, "JFK", "BOS", "atr", 0, 0).ok, "JFK-BOS opened (basic, basic) on a turboprop");
assert(!openRoute(s, "JFK", "ORD", "a320", 1, 1).ok, "no duplicate routes");
assert(s.fleet.a320 === 2 && s.fleet.atr === 1 && idlePlanes(s, "a320") === 0, "planes leased for each new route");

const ord = s.routes[0];
const one = routeStats(s, ord);
assert(addPlane(s, ord.id, "a320").ok && routeStats(s, ord).seatsPerDay > one.seatsPerDay * 1.9, "a second plane doubles the seats");
assert(removePlane(s, ord.id, "a320").ok && idlePlanes(s, "a320") === 1, "taking a plane off leaves it idle");
assert(returnPlane(s, "a320").ok && s.fleet.a320 === 2, "idle plane returned to the lessor");

// price and seating tiers each do their own thing
const base = routeStats(s, ord);
setFare(s, ord.id, 2);
const lux = routeStats(s, ord);
assert(lux.fare > base.fare * 2 && lux.demandPerDay < base.demandPerDay * 0.5, "Luxury prices: fare more than doubles, demand drops");
assert(lux.satisfaction < base.satisfaction, "Luxury prices in Average seats annoy passengers");
setFare(s, ord.id, 0);
const cheap = routeStats(s, ord);
assert(cheap.fare < base.fare * 0.7 && cheap.demandPerDay > base.demandPerDay * 1.3, "Basic prices: cheaper tickets, more demand");
setFare(s, ord.id, 1);
const cash0 = s.cash;
assert(setCabin(s, ord.id, 2).ok && s.cash < cash0 && routeStats(s, ord).grounded.startsWith("Cabin refit"), "seat refit costs money and grounds the route");
days(s, 0.6);
const comfy = routeStats(s, ord);
assert(!comfy.grounded && comfy.seatsPerDay < base.seatsPerDay * 0.7 && comfy.satisfaction > base.satisfaction + 10, "Luxury seats: fewer seats, much happier passengers");
const lax = s.routes[1];
assert(routeStats(s, lax).satisfaction < 50, "Basic seats on a 5-hour flight make people unhappy");

// run a month
const startCash = s.cash;
let expansion = 0;
for (let d = 0; d < 30; d++) {
  days(s, 1);
  if (s.cash > 8_000_000 && s.routes.length < 8) {
    const dest = ["MIA", "ATL", "DFW", "YYZ", "LHR", "SFO"].find((c) => !routeBlocker(s, "JFK", c, "a320"));
    if (dest) {
      const c = s.cash;
      openRoute(s, "JFK", dest, "a320", 1, 1);
      expansion += c - s.cash;
    }
  }
}
const t = totals(s);
console.log(`  30 days: cash ${Math.round(s.cash / 1e6)}M (from ${Math.round(startCash / 1e6)}M) routes ${s.routes.length} pax ${Math.round(s.totalPax)} rep ${s.reputation.toFixed(1)} level ${s.level} profit/day ${Math.round(t.profit / 1000)}K`);
assert(Number.isFinite(s.cash) && Number.isFinite(s.reputation), "no NaN");
const week = s.history.slice(-7).reduce((a, d) => a + d.revenue - d.costs, 0);
assert(s.cash + expansion > startCash && week > 0, "a sensible airline makes money over a month");
assert(s.routes.length >= 5, "it grows to 5+ routes");
assert(s.history.length === 30, "30 days of history kept");
assert(s.level === levelOf(s.totalPax) && s.level >= 2, "levels up as passengers add up");

// hubs
assert(hubBlocker(s, "NRT") === "Fly there first, then you can base planes there", "can't open a hub where you don't fly");
s.cash += 100_000_000;
assert(openHub(s, "LAX").ok && s.hubs.includes("LAX"), "second hub at LAX");
assert(openRoute(s, "LAX", "SFO", "atr", 0, 1).ok, "routes can start at the new hub");

// leasing limits and closing
const before = s.fleet.atr ?? 0;
assert(leasePlane(s, "atr").ok && s.fleet.atr === before + 1, "lease a spare plane");
assert(closeRoute(s, s.routes[s.routes.length - 1].id).ok && idlePlanes(s, "atr") >= 2, "closing a route frees its planes");
if (s.level < 4) assert(!leasePlane(s, "a380").ok, "A380 locked until level 4");

// bankruptcy
const b = createAirline("AKL", "", "#16a34a");
assert(b.name === "Auckland Air", "default airline name");
takeLoan(b);
b.cash = -60_000_000;
days(b, 0.1);
assert(b.bankrupt, "deep in the red means bankruptcy");
assert(CITIES.length >= 30, "30+ airports to choose from");
// starting presets
const broke = createAirline("MAD", "Tapas Air", "#dc2626", "broke");
assert(broke.cash === 4_000_000 && !!routeBlocker(broke, "MAD", "LHR", "b787"), "broke founder: $4M, no 787s");
assert(openRoute(broke, "MAD", "IST", "atr", 1, 1).ok === false, "MAD-IST too far for an ATR");
assert(openRoute(broke, "MAD", "LHR", "a320", 0, 0).ok, "broke founder can still afford one A320 route");
const rich = createAirline("DXB", "Gold Air", "#9333ea", "billionaire");
assert(rich.cash === 1_500_000_000 && rich.level === 3 && openRoute(rich, "DXB", "SYD", "b787", 2, 2).ok, "billionaire: 787 to Sydney on day one");
days(rich, 2);
assert(rich.level === 3, "starting level never drops");
const bail = createAirline("CAI", "Phoenix", "#ea580c", "bailout");
assert(bail.loan === 80_000_000 && bail.reputation === 25, "bailout starts in debt with a bad reputation");
assert(createAirline("JFK", "X", "#000", "nope").preset === "millionaire", "unknown preset falls back");
console.log("ALL GOOD (airline)");
