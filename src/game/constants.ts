import type { TileType } from "./types";

export const GRID_W = 96;
export const GRID_H = 64;

/** game minutes that pass per real second at 1x speed */
export const BASE_RATE = 2;
/** largest simulation step, in game minutes */
export const MAX_STEP = 0.05;

export const START_TIME = 6 * 60;
export const SAVE_KEY = "airport-tycoon-save-v3";

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
  tier: Tier;
  /** smallest gate level that can take it (1 Small, 2 Medium, 3 Large, 4 Jumbo) */
  gate: number;
  /** arriving passengers go through Customs */
  intl: boolean;
  /** maximum crosswind in knots */
  crosswind: number;
  /** drawn length in tiles */
  size: number;
}

export type Tier = 1 | 2 | 3 | 4 | 5;

export const PLANES: PlaneClassDef[] = [
  { name: "Regional Turboprop", short: "Regional", seats: 18, landingFee: 450, commission: 14, minRunway: 8, ground: 24, tier: 1, gate: 1, intl: false, crosswind: 20, size: 1.0 },
  { name: "Narrow-body Jet", short: "Domestic", seats: 42, landingFee: 600, commission: 11, minRunway: 12, ground: 32, tier: 2, gate: 2, intl: false, crosswind: 30, size: 1.45 },
  { name: "Wide-body Jet", short: "International", seats: 84, landingFee: 1500, commission: 24, minRunway: 18, ground: 46, tier: 3, gate: 3, intl: true, crosswind: 33, size: 2.1 },
  { name: "Super Jumbo", short: "Super Jumbo", seats: 140, landingFee: 3600, commission: 38, minRunway: 22, ground: 60, tier: 4, gate: 4, intl: true, crosswind: 33, size: 2.6 },
  { name: "Supersonic Jet", short: "Supersonic", seats: 36, landingFee: 6500, commission: 140, minRunway: 24, ground: 40, tier: 5, gate: 3, intl: true, crosswind: 25, size: 1.9 },
];

export const TIER_NAMES = ["", "Regional Airfield", "Domestic Hub", "International Airport", "Major Hub", "Global Mega-Hub"];
/** passenger demand per hour for each tier (before satisfaction, time of day, fees and marketing) */
export const TIER_DEMAND = [0, 50, 180, 420, 760, 1150];
export const MAX_TIER: Tier = 5;

/** demand by hour of day: quiet nights, morning and evening rush */
export const HOURLY_DEMAND = [
  0.2, 0.15, 0.12, 0.12, 0.2, 0.55, 1.15, 1.6, 1.55, 1.2, 1.0, 0.95,
  1.0, 1.0, 0.95, 1.05, 1.3, 1.6, 1.55, 1.25, 0.95, 0.7, 0.45, 0.3,
];

export const GATE_SIZE = ["", "Small", "Medium", "Large", "Jumbo"];

// ---- money ----------------------------------------------------------------
/** daily interest on loans */
export const LOAN_RATE = 0.05;
/** daily interest charged on a negative balance */
export const OVERDRAFT_RATE = 0.12;
export const LOAN_STEP = 25000;

export interface FeeLevel {
  name: string;
  revenue: number;
  demand: number;
}
export const FEES: FeeLevel[] = [
  { name: "Low", revenue: 0.8, demand: 1.25 },
  { name: "Normal", revenue: 1, demand: 1 },
  { name: "High", revenue: 1.3, demand: 0.75 },
];

// ---- weather ----------------------------------------------------------------
export const SNOW_CREW_HIRE = 800;
export const SNOW_CREW_WAGE = 70;
/** a flight circles this long before diverting to another airport */
export const HOLD_LIMIT = 75;
/** a departure counts as on time if it takes off within this many minutes of schedule */
export const ON_TIME_GRACE = 15;

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
    upkeep: [5, 9, 14],
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
    upkeep: [1.5],
    maxLevel: 1,
    paint: true,
  },
  checkin: {
    name: "Check-in Desk",
    category: "terminal",
    desc: "Every departing passenger checks in first.",
    cost: [1500, 1500, 2500],
    upkeep: [35, 95, 170],
    maxLevel: 3,
    paint: false,
  },
  tsa: {
    name: "TSA Checkpoint",
    category: "terminal",
    desc: "Security screening before the gates. The classic bottleneck.",
    cost: [3000, 3000, 5000],
    upkeep: [80, 220, 420],
    maxLevel: 3,
    paint: false,
  },
  customs: {
    name: "Customs / Immigration",
    category: "terminal",
    desc: "Required for international flights. Arriving passengers pass through.",
    cost: [6000, 5000, 8000],
    upkeep: [150, 300, 500],
    maxLevel: 3,
    paint: false,
  },
  gate: {
    name: "Gate",
    category: "airside",
    desc: "Small gate. Must touch terminal floor and a taxiway. Upgrade to Medium / Large / Jumbo.",
    cost: [4000, 8000, 16000, 30000],
    upkeep: [30, 140, 300, 520],
    maxLevel: 4,
    paint: false,
  },
  runway: {
    name: "Runway",
    category: "airside",
    desc: "Straight line, across or up-down. 8 tiles regional, 12 narrow-body, 18 wide-body, 22 jumbo, 24 supersonic. Planes land into the wind.",
    cost: [500],
    upkeep: [4],
    maxLevel: 1,
    paint: true,
  },
  taxiway: {
    name: "Taxiway",
    category: "airside",
    desc: "Connects runways to gates. Planes park on the taxiway tile next to a gate.",
    cost: [200],
    upkeep: [2],
    maxLevel: 1,
    paint: true,
  },
  tower: {
    name: "Control Tower",
    category: "airside",
    desc: "Weather forecasts. L2 adds ILS so planes can land in fog. L3 adds storm radar so runways stay open in thunderstorms.",
    cost: [5000, 10000, 25000],
    upkeep: [50, 140, 300],
    maxLevel: 3,
    paint: false,
  },
};

export const TOWER_FORECAST_HOURS = [1, 4, 8, 12];

/** queue service time in minutes per passenger, by level */
export const SERVICE_TIME: Record<"checkin" | "tsa" | "customs", number[]> = {
  checkin: [0.5, 0.33, 0.22],
  tsa: [0.7, 0.45, 0.3],
  customs: [0.6, 0.4, 0.27],
};

export const PARKING_SPOTS = [12, 24, 40];

export const AIRLINES = ["RG", "SKY", "NV", "AZ", "PL", "TW", "HX", "OC"];
export const AIRLINE_NAMES: Record<string, string> = {
  RG: "Ridgeline Air",
  SKY: "Skyward",
  NV: "Nova Jet",
  AZ: "Azure Lines",
  PL: "Polar Wings",
  TW: "Tradewind",
  HX: "Helix Airways",
  OC: "Oceanic",
};
export const MAX_CONTRACTS = 2;
export const OFFER_REFRESH = 6 * 60;
export const CITIES: string[][] = [
  ["Cedar Falls", "Port Lyle", "Marlow", "Greyfield", "Ashby", "Tern Bay", "Dunmore"],
  ["Denver", "Chicago", "Atlanta", "Seattle", "Dallas", "Boston", "Miami", "Phoenix"],
  ["Madrid", "Tokyo", "London", "Dubai", "Sydney", "Paris", "Singapore", "São Paulo"],
  ["Dubai", "Singapore", "Hong Kong", "Frankfurt", "Seoul", "Doha", "Sydney"],
  ["London", "Paris", "Tokyo", "Dubai", "Singapore"],
];
