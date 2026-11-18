# Airport Tycoon

A 2D top-down airport management sim that runs entirely in the browser. Build parking, shuttles, check-in, TSA, gates, taxiways and runways, then keep passengers happy while flights land, turn around and depart.

- **Stack:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Hosting:** GitHub + Vercel, no backend, no database, no external APIs
- **Saves:** `localStorage` (autosave every 20 seconds, plus Menu > Save now)
- **Graphics:** a 3D view built with three.js from primitives (shadows, day and night, runway lights), plus a lighter 2D canvas map you can switch to. No image or model files.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (what Vercel runs)
npm run test:sim   # headless test of the simulation engine
npm run test:scenarios   # runs every pre-built airport for a simulated day
npm run balance 3        # money / weather report per airport over 3 days
```

## How to play

The game opens on a working starter airfield. Blue dots are departing passengers, orange are arriving.

1. Passengers park, ride the shuttle, check in, clear TSA and wait at their gate.
2. Planes land on the runway, taxi to a compatible gate, unload, board and leave.
3. You earn landing fees, ticket commissions and parking fees, and pay hourly staff and upkeep.

| Tier | Needs | Unlocks |
| --- | --- | --- |
| 1 Regional Airfield | parking, check-in, TSA, a Small gate, 8-tile runway | regional turboprops |
| 2 Domestic Hub | 500 passengers, 80% satisfaction, a Medium gate | narrow-body jets (12-tile runway) |
| 3 International Airport | 2,500 passengers, Customs, a Large gate | wide-body jets (18-tile runway) |
| 4 Major Hub | 25,000 passengers, 85% satisfaction, 2 long runways, 10 working gates, tower L2 | Super Jumbos (Jumbo gate, 22-tile runway), more demand |
| 5 Global Mega-Hub | 100,000 passengers, 88% satisfaction, 85% on time, a Jumbo gate, a 24-tile runway | Supersonic jets |

Hover any tile to see why it isn't working ("Needs TSA connection", "No runway access", and so on). The side panel shows what each flight class is waiting on.

**Pre-built airports:** the Airports button loads ready-made, working layouts: LaGuardia, JFK, LAX, Atlanta, the starter airfield, or a blank field. Their runway positions, lengths and crossings are taken from real runway end coordinates ([OurAirports](https://github.com/davidmegginson/ourairports-data) open data), rotated so the runways line up with the grid. Terminals sit where the real gates are (positions from FlightGear's open ground-network data) and carry their real names as signs; taxiways and gate counts are simplified by hand.

**Runways:** build them in a straight line, left to right or top to bottom. Horizontal runways are used west to east and vertical ones north to south. Runways can cross, but crossing runways can only be used one at a time.

**Wind and weather:** planes always land and take off into the wind, so the wind decides which way each runway is used, and strong crosswinds close a runway to some aircraft (crossing runways matter!). Thunderstorms stop all traffic unless your Control Tower has storm radar (L3). Fog blocks landings without ILS (tower L2). Snow closes every runway your snow crews can't keep clear (one crew per runway). Planes circle while they wait and divert after 75 minutes. Each airport has its own climate: LAX gets fog, Atlanta gets storms, New York gets everything. The tower also sets how far ahead the forecast goes.

**Real money and construction time:** prices are in real-world dollars (a Small gate is $4M, a Jumbo upgrade $30M, a runway $500K a tile, big airports start with $100M+). Everything you build or upgrade becomes a construction site first: walkways take 45 minutes, a gate 12 hours, a tower 12 hours, a Jumbo upgrade a full day. You pay up front, buildings keep working at their old level while they're upgraded, and bulldozing a site cancels it for a 75% refund. Build times are listed in the build menu and the side panel tracks every project.

**Money:** big buildings cost a lot to run, demand peaks in the morning and evening rush, and late flights drive travellers away. Take bank loans (5% a day) in the Staff tab, set fees Low / Normal / High (revenue vs demand), and watch the bankruptcy line in the side panel. Go too far into the red and the bank takes the airport.

**Airline contracts:** airlines offer deals in the side panel (for example "6 regional flights in 8h"). Signed contracts send guaranteed flights and pay a bonus when finished. Leaving passengers behind costs a fine, and missing the deadline costs a penalty.

**Controls:** Space = pause, 1/2/3 = speed, B = bulldoze, U = upgrade, Esc = stop building. Drag to paint floors, walkways, runways and taxiways.

**3D camera:** right-drag rotates, scroll zooms, WASD or arrow keys move, and in Inspect mode left-drag moves too. The "2D map" button in the top bar switches to the flat view if 3D runs slowly.

## Project layout

```
src/
  game/          simulation engine (pure TypeScript, no React or DOM)
    types.ts       data types
    constants.ts   balance numbers: costs, plane classes, tiers
    pathfinding.ts passenger distance fields + aircraft taxi routes
    runways.ts     runway detection, crossings and geometry helpers
    analysis.ts    gate diagnostics, tier checklist, tooltips
    simulation.ts  game loop step, flights, passengers, buses, economy, build actions
    starter.ts     the pre-built tutorial airport
    scenarios.ts   pre-built airports (LGA, JFK, LAX, ATL)
    weather.ts     wind, weather spells, runway closures
    layout.ts      helpers for pre-built layouts
    save.ts        localStorage save and load
  render/
    scene3d.ts     three.js 3D view
    renderer.ts    2D canvas view
  components/    React UI (top bar, build menu, side panel, canvas, store)
  app/           Next.js entry (layout, page, styles)
scripts/
  sim-test.ts    runs the engine for a simulated day and checks it
```

Balance lives in `src/game/constants.ts`, so tuning prices or plane sizes is a one-file change.
