// Core data types for the airport simulation. No React / DOM in this folder.

export type TileType =
  | "empty"
  | "parking"
  | "shuttle"
  | "sidewalk"
  | "floor"
  | "checkin"
  | "tsa"
  | "customs"
  | "gate"
  | "runway"
  | "taxiway";

export interface Tile {
  type: TileType;
  /** 1..3. For gates: 1 = Small, 2 = Medium, 3 = Large. */
  level: number;
}

/** 0 = regional turboprop, 1 = narrow-body, 2 = wide-body */
export type PlaneClass = 0 | 1 | 2;

export type StepKind = "checkin" | "tsa" | "customs" | "gate" | "exit";

export interface PathNode {
  idx: number;
  /** true when this node is reached by riding the shuttle from the previous node */
  ride: boolean;
}

export interface Passenger {
  id: number;
  kind: "dep" | "arr";
  flightId: number;
  /** position in tile units (tile centres are integers) */
  x: number;
  y: number;
  /** logical tile the passenger is standing on */
  tile: number;
  plan: StepKind[];
  step: number;
  state: "idle" | "walk" | "queue" | "waitBus" | "onBus" | "atGate";
  path: PathNode[];
  pathIdx: number;
  pathVersion: number;
  target: number;
  /** minutes spent waiting in queues / for the bus */
  wait: number;
  stuck: number;
  retryAt: number;
  busDest: number;
  queueIndex: number;
  missed: boolean;
  dead: boolean;
  /** small render offset so dots don't stack */
  ox: number;
  oy: number;
}

export type FlightState =
  | "scheduled"
  | "landing"
  | "taxiIn"
  | "deboarding"
  | "boarding"
  | "taxiOut"
  | "takeoff";

export interface Flight {
  id: number;
  code: string;
  city: string;
  cls: PlaneClass;
  gate: number;
  stand: number;
  state: FlightState;
  x: number;
  y: number;
  heading: number;
  speed: number;
  path: number[];
  pathIdx: number;
  arriveAt: number;
  departAt: number;
  depBooked: number;
  depSpawned: number;
  spawnTimes: number[];
  boarded: number;
  arrTotal: number;
  arrLeft: number;
  timer: number;
  /** the runway this flight lands on / departs from */
  run: RunwayRun | null;
  onRunway: boolean;
  done: boolean;
  /** id of the airline contract this flight counts toward (0 = none) */
  contractId: number;
}

export interface Contract {
  id: number;
  airline: string;
  airlineName: string;
  cls: PlaneClass;
  /** flights that must depart on time */
  flights: number;
  done: number;
  /** hours allowed once signed */
  hours: number;
  /** game-minute deadline (0 while it is still an offer) */
  deadline: number;
  /** extra landing fee per on-time flight */
  bonusPerFlight: number;
  reward: number;
  penalty: number;
  latePenalty: number;
}

export interface Bus {
  x: number;
  y: number;
  /** tile index of the stop the bus is heading to / dwelling at */
  target: number;
  lastStop: number;
  dwell: number;
  riders: number[];
}

export interface Facility {
  queue: number[];
  progress: number;
}

export interface GameEvent {
  id: number;
  time: number;
  text: string;
  kind: "info" | "good" | "bad";
}

export interface GameState {
  w: number;
  h: number;
  tiles: Tile[];
  /** bumped whenever the layout (or anything pathing depends on) changes */
  version: number;
  money: number;
  /** game minutes since day 1, 00:00 */
  time: number;
  tier: 1 | 2 | 3;
  served: number;
  satisfaction: number;
  drivers: number;
  marketingUntil: number;
  demandTokens: number;
  passengers: Passenger[];
  flights: Flight[];
  buses: Bus[];
  facilities: Record<number, Facility>;
  gateFlight: Record<number, number>;
  gateCooldown: Record<number, number>;
  gateNote: Record<number, string>;
  /** which flight currently owns each runway (key = row * 100 + first x) */
  runwayLocks: Record<number, number>;
  /** display name of this airport */
  name: string;
  nextId: number;
  nextSchedule: number;
  nextHour: number;
  incomeThisHour: number;
  expenseThisHour: number;
  incomeLastHour: number;
  expenseLastHour: number;
  flightsHandled: number;
  missedFlights: number;
  events: GameEvent[];
  contractOffers: Contract[];
  contracts: Contract[];
  nextOffer: number;
  contractsCompleted: number;
}

/**
 * A straight strip of runway tiles. Horizontal runways are used west to east,
 * vertical ones north to south.
 */
export interface RunwayRun {
  vertical: boolean;
  /** the row (horizontal) or column (vertical) the runway sits on */
  line: number;
  /** first and last position along the runway */
  a0: number;
  a1: number;
  len: number;
  /** lock id */
  key: number;
  /** keys of runways that physically cross this one */
  crosses: number[];
}

export interface GateInfo {
  idx: number;
  name: string;
  level: number;
  stand: number;
  /** longest runway this gate can reach */
  runway: RunwayRun | null;
  /** every runway this gate can reach */
  runways: RunwayRun[];
  issues: string[];
  /** landside + airside all good for at least regional flights */
  functional: boolean;
  /** highest plane class this gate can physically take right now (-1 = none). Ignores tier. */
  maxClass: number;
  parking: number[];
}

export interface ClassStatus {
  ok: boolean;
  reason: string;
}

export interface Analysis {
  version: number;
  gates: GateInfo[];
  gateByIdx: Map<number, GateInfo>;
  runways: RunwayRun[];
  parking: number[];
  parkingSpots: number;
  checkins: number[];
  tsas: number[];
  customs: number[];
  stops: number[];
  shuttleActive: boolean;
  classStatus: ClassStatus[];
}

export interface TileInfo {
  title: string;
  lines: string[];
  issues: string[];
}
