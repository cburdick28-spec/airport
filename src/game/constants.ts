import type { TileType } from "./types";

export const GRID_W = 44;
export const GRID_H = 28;

/** game minutes that pass per real second at 1x speed */
export const BASE_RATE = 2;
/** largest simulation step, in game minutes */
export const MAX_STEP = 0.05;

export const START_TIME = 6 * 60;
export const SAVE_KEY = "airport-tycoon-save-v1";

export const WALK_SPEED = 1.7; // tiles per game minute
export const TAXI_SPEED = 2.4;
export const BUS_SPEED = 7;
export const BUS_CAPACITY = 14;
export const BUS_DWELL = 0.35;

export const LEAD_TIME = 45; // minutes between a flight being booked and landing
export const SPAWN_WINDOW = 18; // departing passengers show up over this many minutes
export const LATE_LIMIT = 10; // a plane waits this long past departure for stragglers
export const PARKING_FEE = 4;
export const REFUND_RATE = 0.5;
export const DRIVER_HIRE_COST = 500;
export const DRIVER_WAGE = 40;
export const MARKETING_COST = 5000;
export const MARKETING_HOURS = 12;
export const MARKETING_BOOST = 1.35;

export interface PlaneClassDef {
  name: string;
  short: string;
  seats: number;
  landingFee: number;
  commission: number;
  minRunway: number;
  ground: number;
  tier: 1 | 2 | 3;
  /** drawn length in tiles */
  size: number;
}

export const PLANES: PlaneClassDef[] = [
  { name: "Regional Turboprop", short: "Regional", seats: 18, landingFee: 450, commission: 14, minRunway: 8, ground: 24, tier: 1, size: 1.4 },
  { name: "Narrow-body Jet", short: "Domestic", seats: 42, landingFee: 1200, commission: 24, minRunway: 12, ground: 32, tier: 2, size: 2.0 },
  { name: "Wide-body Jet", short: "International", seats: 84, landingFee: 3400, commission: 55, minRunway: 18, ground: 46, tier: 3, size: 2.9 },
];

export const TIER_NAMES = ["", "Regional Airfield", "Domestic Hub", "International Airport"];
/** passenger demand per hour for each tier (before satisfaction / marketing) */
export const TIER_DEMAND = [0, 50, 180, 480];
export const TIER2_PAX = 500;
export const TIER2_SAT = 80;
export const TIER3_PAX = 2500;

export const GATE_SIZE = ["", "Small", "Medium", "Large"];

export type Category = "landside" | "terminal" | "airside" | "staff";

export interface BuildDef {
  name: string;
  category: Category;
  desc: string;
  /** cost[0] = build cost, cost[1] = upgrade to L2, cost[2] = upgrade to L3 */
  cost: number[];
  /** hourly upkeep per level */
  upkeep: number[];
  maxLevel: number;
  /** can be painted by dragging */
  paint: boolean;
}

export const BUILD: Record<Exclude<TileType, "empty">, BuildDef> = {
  parking: {
    name: "Parking Lot",
    category: "landside",
    desc: "Where passengers arrive by car. More spots = more passengers per flight.",
    cost: [800, 1200, 1800],
    upkeep: [4, 7, 10],
    maxLevel: 3,
    paint: true,
  },
  shuttle: {
    name: "Shuttle Stop",
    category: "landside",
    desc: "Buses loop between stops. Needs 2+ stops and a hired driver.",
    cost: [600],
    upkeep: [5],
    maxLevel: 1,
    paint: false,
  },
  sidewalk: {
    name: "Walkway",
    category: "landside",
    desc: "Outdoor path linking parking, stops and terminals.",
    cost: [40],
    upkeep: [0.2],
    maxLevel: 1,
    paint: true,
  },
  floor: {
    name: "Terminal Floor",
    category: "terminal",
    desc: "Indoor space passengers walk through.",
    cost: [80],
    upkeep: [0.5],
    maxLevel: 1,
    paint: true,
  },
  checkin: {
    name: "Check-in Desk",
    category: "terminal",
    desc: "Every departing passenger checks in first.",
    cost: [1500, 1500, 2500],
    upkeep: [25, 40, 60],
    maxLevel: 3,
    paint: false,
  },
  tsa: {
    name: "TSA Checkpoint",
    category: "terminal",
    desc: "Security screening before the gates. The classic bottleneck.",
    cost: [3000, 3000, 5000],
    upkeep: [60, 95, 140],
    maxLevel: 3,
    paint: false,
  },
  customs: {
    name: "Customs / Immigration",
    category: "terminal",
    desc: "Required for international flights. Arriving passengers pass through.",
    cost: [6000, 5000, 8000],
    upkeep: [80, 120, 170],
    maxLevel: 3,
    paint: false,
  },
  gate: {
    name: "Gate",
    category: "airside",
    desc: "Small gate. Must touch terminal floor and a taxiway. Upgrade to Medium / Large.",
    cost: [4000, 8000, 16000],
    upkeep: [30, 60, 120],
    maxLevel: 3,
    paint: false,
  },
  runway: {
    name: "Runway",
    category: "airside",
    desc: "Runs left to right. 8 tiles for regional, 12 for narrow-body, 18 for wide-body.",
    cost: [500],
    upkeep: [2],
    maxLevel: 1,
    paint: true,
  },
  taxiway: {
    name: "Taxiway",
    category: "airside",
    desc: "Connects runways to gates. Planes park on the taxiway tile next to a gate.",
    cost: [200],
    upkeep: [1],
    maxLevel: 1,
    paint: true,
  },
};

/** queue service time in minutes per passenger, by level */
export const SERVICE_TIME: Record<"checkin" | "tsa" | "customs", number[]> = {
  checkin: [0.5, 0.33, 0.22],
  tsa: [0.7, 0.45, 0.3],
  customs: [0.6, 0.4, 0.27],
};

export const PARKING_SPOTS = [12, 24, 40];

export const AIRLINES = ["RG", "SKY", "NV", "AZ", "PL", "TW", "HX", "OC"];
export const CITIES: string[][] = [
  ["Cedar Falls", "Port Lyle", "Marlow", "Greyfield", "Ashby", "Tern Bay", "Dunmore"],
  ["Denver", "Chicago", "Atlanta", "Seattle", "Dallas", "Boston", "Miami", "Phoenix"],
  ["Madrid", "Tokyo", "London", "Dubai", "Sydney", "Paris", "Singapore", "São Paulo"],
];
