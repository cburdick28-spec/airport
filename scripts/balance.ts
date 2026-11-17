// Balance report: runs each airport for a few days and prints the numbers per day.
// npm run balance [days] [airport ids...]
import { getAnalysis } from "../src/game/analysis";
import { MAX_STEP } from "../src/game/constants";
import { SCENARIOS } from "../src/game/scenarios";
import { hourlyUpkeep, step } from "../src/game/simulation";

const days = Number(process.argv[2] ?? 2);
const only = process.argv.slice(3);
for (const sc of SCENARIOS) {
  if (sc.id === "blank" || (only.length && !only.includes(sc.id))) continue;
  const s = sc.create();
  console.log(`\n${sc.name}  start $${Math.round(s.money)}  upkeep $${Math.round(hourlyUpkeep(s))}/h  gates ${getAnalysis(s).gates.length}`);
  for (let d = 0; d < days && !s.bankrupt; d++) {
    const m0 = s.money;
    const sv0 = s.served;
    const fl0 = s.flightsHandled;
    const dv0 = s.diversions;
    const mi0 = s.missedFlights;
    const kinds = new Map<string, number>();
    let inc = 0;
    let exp = 0;
    for (let i = 0; i < 1440 / MAX_STEP; i++) {
      const h = s.nextHour;
      step(s, MAX_STEP);
      if (s.nextHour !== h) {
        inc += s.incomeLastHour;
        exp += s.expenseLastHour;
      }
      if (i % 200 === 0) kinds.set(s.forecast[0].kind, (kinds.get(s.forecast[0].kind) ?? 0) + 1);
      if (s.bankrupt) break;
    }
    const wx = [...kinds.entries()].map(([k, v]) => `${k}:${Math.round((v * 200 * MAX_STEP) / 60)}h`).join(" ");
    console.log(
      `  day ${d + 1}: profit ${Math.round((s.money - m0) / 1000)}k (in ${Math.round(inc / 1000)}k / out ${Math.round(exp / 1000)}k) served +${s.served - sv0} flights ${s.flightsHandled - fl0} sat ${s.satisfaction.toFixed(0)} otp ${s.otp.toFixed(0)} div ${s.diversions - dv0} missed ${s.missedFlights - mi0} tier ${s.tier}${s.bankrupt ? " BANKRUPT" : ""} | ${wx}`,
    );
  }
}
