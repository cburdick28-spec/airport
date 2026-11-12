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

Hover any tile to see why it isn't working ("Needs TSA connection", "No runway access", and so on). The side panel shows what each flight class is waiting on.

**Pre-built airports:** the Airports button loads ready-made, working layouts: LaGuardia, JFK, LAX, Atlanta, the starter airfield, or a blank field. They are simplified versions of the real airports. Runways only run left to right in this engine, so crossing runways appear as parallel ones.

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
    analysis.ts    gate diagnostics, tier checklist, tooltips
    simulation.ts  game loop step, flights, passengers, buses, economy, build actions
    starter.ts     the pre-built tutorial airport
    scenarios.ts   pre-built airports (LGA, JFK, LAX, ATL)
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
