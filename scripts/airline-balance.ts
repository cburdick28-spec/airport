// Airline CEO balance report: npm run airline:balance
import { AIRCRAFT_BY_ID, TIER_NAMES, type Tier } from "../src/airline/data";
import { createAirline, distanceKm, leaseTotal, money, previewRoute } from "../src/airline/engine";

const s = createAirline("JFK", "Test Air", "#2563eb");
const routes: [string, string, string][] = [
  ["JFK", "BOS", "atr"],
  ["JFK", "ORD", "a320"],
  ["JFK", "LAX", "a320"],
  ["JFK", "MIA", "a320"],
  ["JFK", "LHR", "b787"],
  ["JFK", "NRT", "b787"],
  ["JFK", "LHR", "a380"],
  ["JFK", "LHR", "sst"],
];
for (const [a, b, t] of routes) {
  const lease = AIRCRAFT_BY_ID[t].leasePerDay;
  console.log(`\n${a}-${b} ${Math.round(distanceKm(a, b))} km · ${AIRCRAFT_BY_ID[t].short} (lease ${money(lease)}/day)`);
  for (const fare of [0, 1, 2] as Tier[])
    for (const cabin of [0, 1, 2] as Tier[]) {
      const st = previewRoute(s, a, b, t, fare, cabin);
      console.log(
        `  ${TIER_NAMES[fare].padEnd(7)} price / ${TIER_NAMES[cabin].padEnd(7)} seats: pax ${Math.round(st.paxPerDay).toString().padStart(4)} load ${Math.round(st.load * 100).toString().padStart(3)}% fare $${Math.round(st.fare).toString().padStart(4)} profit ${money(st.profitPerDay - lease).padStart(6)}/day sat ${Math.round(st.satisfaction)}`,
      );
    }
}
void leaseTotal;
