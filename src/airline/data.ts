// Static data for Airline CEO mode: real airports, aircraft, and the three service tiers.

export interface City {
  code: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** metro market size in millions of people */
  market: number;
  /** connecting-traffic boost for big transfer hubs */
  boost?: number;
}

export const CITIES: City[] = [
  { code: "JFK", name: "New York", country: "USA", lat: 40.64, lon: -73.78, market: 20 },
  { code: "LAX", name: "Los Angeles", country: "USA", lat: 33.94, lon: -118.41, market: 13 },
  { code: "ATL", name: "Atlanta", country: "USA", lat: 33.64, lon: -84.43, market: 6.5, boost: 1.5 },
  { code: "ORD", name: "Chicago", country: "USA", lat: 41.98, lon: -87.9, market: 9.5, boost: 1.2 },
  { code: "DFW", name: "Dallas", country: "USA", lat: 32.9, lon: -97.04, market: 7.6, boost: 1.2 },
  { code: "DEN", name: "Denver", country: "USA", lat: 39.86, lon: -104.67, market: 3, boost: 1.2 },
  { code: "SFO", name: "San Francisco", country: "USA", lat: 37.62, lon: -122.38, market: 7.7 },
  { code: "SEA", name: "Seattle", country: "USA", lat: 47.45, lon: -122.31, market: 4 },
  { code: "MIA", name: "Miami", country: "USA", lat: 25.79, lon: -80.29, market: 6.1 },
  { code: "BOS", name: "Boston", country: "USA", lat: 42.36, lon: -71.01, market: 4.9 },
  { code: "YYZ", name: "Toronto", country: "Canada", lat: 43.68, lon: -79.63, market: 6.4 },
  { code: "MEX", name: "Mexico City", country: "Mexico", lat: 19.44, lon: -99.07, market: 21 },
  { code: "GRU", name: "São Paulo", country: "Brazil", lat: -23.43, lon: -46.47, market: 22 },
  { code: "EZE", name: "Buenos Aires", country: "Argentina", lat: -34.82, lon: -58.54, market: 15 },
  { code: "LHR", name: "London", country: "UK", lat: 51.47, lon: -0.45, market: 14, boost: 1.3 },
  { code: "CDG", name: "Paris", country: "France", lat: 49.01, lon: 2.55, market: 12 },
  { code: "MAD", name: "Madrid", country: "Spain", lat: 40.49, lon: -3.57, market: 6.7 },
  { code: "FRA", name: "Frankfurt", country: "Germany", lat: 50.03, lon: 8.57, market: 5.8, boost: 1.4 },
  { code: "IST", name: "Istanbul", country: "Turkey", lat: 41.26, lon: 28.74, market: 15, boost: 1.3 },
  { code: "CAI", name: "Cairo", country: "Egypt", lat: 30.12, lon: 31.41, market: 21 },
  { code: "JNB", name: "Johannesburg", country: "South Africa", lat: -26.14, lon: 28.24, market: 10 },
  { code: "DXB", name: "Dubai", country: "UAE", lat: 25.25, lon: 55.36, market: 3.5, boost: 2 },
  { code: "DEL", name: "Delhi", country: "India", lat: 28.56, lon: 77.1, market: 31 },
  { code: "BOM", name: "Mumbai", country: "India", lat: 19.09, lon: 72.87, market: 21 },
  { code: "SIN", name: "Singapore", country: "Singapore", lat: 1.36, lon: 103.99, market: 6, boost: 1.8 },
  { code: "HKG", name: "Hong Kong", country: "China", lat: 22.31, lon: 113.91, market: 7.5, boost: 1.5 },
  { code: "PEK", name: "Beijing", country: "China", lat: 40.08, lon: 116.58, market: 21 },
  { code: "ICN", name: "Seoul", country: "South Korea", lat: 37.46, lon: 126.44, market: 26 },
  { code: "NRT", name: "Tokyo", country: "Japan", lat: 35.77, lon: 140.39, market: 37 },
  { code: "SYD", name: "Sydney", country: "Australia", lat: -33.94, lon: 151.18, market: 5.3 },
  { code: "AKL", name: "Auckland", country: "New Zealand", lat: -37.01, lon: 174.79, market: 1.7 },
];

export const CITY: Record<string, City> = Object.fromEntries(CITIES.map((c) => [c.code, c]));

export interface AircraftType {
  id: string;
  name: string;
  short: string;
  /** seats in the standard (average) layout */
  seats: number;
  rangeKm: number;
  /** cruise speed km/h */
  speed: number;
  /** fuel and maintenance per block hour, at normal fuel prices */
  hourCost: number;
  leasePerDay: number;
  /** airport and navigation fees per departure */
  fee: number;
  /** airline level needed */
  level: number;
  /** drawn size on the globe */
  size: number;
}

export const AIRCRAFT: AircraftType[] = [
  { id: "atr", name: "ATR 72 turboprop", short: "ATR 72", seats: 70, rangeKm: 1500, speed: 510, hourCost: 2200, leasePerDay: 4500, fee: 900, level: 1, size: 0.7 },
  { id: "a320", name: "Airbus A320neo", short: "A320", seats: 180, rangeKm: 6300, speed: 830, hourCost: 4500, leasePerDay: 12000, fee: 2500, level: 1, size: 0.9 },
  { id: "b787", name: "Boeing 787-9", short: "787", seats: 290, rangeKm: 14000, speed: 900, hourCost: 8500, leasePerDay: 32000, fee: 5500, level: 3, size: 1.15 },
  { id: "a380", name: "Airbus A380", short: "A380", seats: 520, rangeKm: 15000, speed: 900, hourCost: 13000, leasePerDay: 48000, fee: 8000, level: 4, size: 1.4 },
  { id: "sst", name: "Supersonic jet", short: "Supersonic", seats: 64, rangeKm: 7800, speed: 2100, hourCost: 9000, leasePerDay: 45000, fee: 6000, level: 5, size: 0.95 },
];

export const AIRCRAFT_BY_ID: Record<string, AircraftType> = Object.fromEntries(AIRCRAFT.map((a) => [a.id, a]));

/** 0 = Basic, 1 = Average, 2 = Luxury */
export type Tier = 0 | 1 | 2;
export const TIER_NAMES = ["Basic", "Average", "Luxury"];

/** ticket prices */
export const FARE = {
  price: [0.65, 1, 2.2],
  demand: [1.45, 1, 0.38],
  /** how the price feels to passengers (satisfaction) */
  value: [8, 0, -6],
  blurb: [
    "Cheap tickets: lots of passengers, thin margins",
    "Normal prices for normal travellers",
    "Premium prices: fewer, richer passengers who expect a lot",
  ],
};

/** seating / cabin */
export const CABIN = {
  /** seats compared with the standard layout */
  seats: [1.18, 1, 0.6],
  demand: [0.9, 1, 1.3],
  comfort: [-14, 0, 18],
  /** crew cost per block hour for a 180-seat plane */
  crew: [900, 1300, 2400],
  /** food and service per passenger per block hour */
  catering: [1.5, 5, 22],
  /** refit cost per plane to switch to this layout */
  refit: [600_000, 1_000_000, 4_000_000],
  blurb: [
    "Packed seats: more passengers per plane, unhappy on long flights",
    "Standard seats and service",
    "Lie-flat seats and fine dining: fewer seats, very happy passengers, big costs",
  ],
};

export const LEVELS = [
  { name: "", pax: 0, hubs: 0 },
  { name: "Startup", pax: 0, hubs: 1 },
  { name: "Regional Carrier", pax: 50_000, hubs: 2 },
  { name: "National Airline", pax: 400_000, hubs: 2 },
  { name: "International Airline", pax: 1_500_000, hubs: 3 },
  { name: "Global Giant", pax: 5_000_000, hubs: 4 },
];

export const AIRLINE_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#0f172a"];

/**
 * Rough continent outlines as [lon, lat] points, drawn onto the globe's texture.
 * Hand-simplified, so the map ships with no image files.
 */
export const LAND: [number, number][][] = [
  // North America
  [[-168, 66], [-162, 70], [-156, 71], [-141, 70], [-128, 70], [-115, 68], [-95, 72], [-82, 73], [-80, 63], [-90, 57], [-82, 52], [-77, 60], [-65, 60], [-62, 52], [-56, 52], [-60, 47], [-66, 44], [-70, 42], [-74, 40], [-76, 35], [-81, 31], [-80, 25], [-82, 28], [-85, 30], [-90, 29], [-97, 27], [-97, 22], [-92, 19], [-88, 21], [-87, 16], [-83, 10], [-79, 9], [-80, 7], [-85, 11], [-92, 14], [-105, 20], [-110, 24], [-112, 30], [-117, 33], [-121, 36], [-124, 40], [-124, 46], [-128, 51], [-135, 57], [-145, 60], [-152, 59], [-158, 56], [-165, 54], [-160, 58], [-165, 62]],
  // South America
  [[-79, 9], [-75, 11], [-71, 12], [-63, 11], [-60, 8], [-52, 5], [-50, 0], [-44, -2], [-35, -6], [-39, -14], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-62, -41], [-65, -46], [-68, -51], [-70, -55], [-74, -50], [-74, -42], [-72, -30], [-71, -18], [-76, -14], [-81, -6], [-80, -1], [-78, 2], [-77, 7]],
  // Greenland
  [[-73, 78], [-60, 82], [-35, 83], [-20, 81], [-18, 75], [-22, 70], [-32, 68], [-42, 60], [-50, 62], [-54, 67], [-58, 75]],
  // Eurasia
  [[-9, 43], [-9, 37], [-6, 36], [-1, 37], [3, 42], [4, 43], [9, 44], [12, 41], [16, 38], [18, 40], [13, 45], [19, 42], [23, 38], [26, 40], [28, 41], [36, 36], [35, 33], [34, 31], [34, 28], [39, 21], [43, 13], [45, 13], [52, 16], [57, 19], [59, 22], [56, 26], [51, 24], [48, 30], [50, 30], [57, 26], [62, 25], [67, 24], [70, 21], [73, 16], [77, 8], [80, 10], [80, 15], [87, 21], [91, 22], [94, 17], [98, 16], [98, 8], [101, 3], [104, 1], [100, 13], [105, 9], [109, 12], [108, 21], [114, 22], [120, 26], [122, 31], [121, 37], [118, 38], [122, 40], [126, 38], [129, 35], [129, 42], [135, 43], [140, 48], [141, 53], [137, 55], [143, 59], [155, 59], [162, 62], [170, 60], [178, 63], [180, 66], [180, 69], [170, 70], [160, 70], [150, 72], [140, 73], [130, 72], [120, 73], [113, 74], [105, 77], [95, 76], [80, 73], [70, 73], [66, 69], [58, 68], [50, 68], [44, 66], [40, 65], [33, 67], [28, 71], [20, 70], [15, 68], [13, 65], [5, 62], [5, 58], [8, 57], [10, 54], [8, 54], [5, 53], [2, 51], [-2, 48], [-4, 48], [-1, 46], [-2, 44]],
  // Africa
  [[-17, 21], [-17, 15], [-16, 12], [-13, 8], [-8, 4], [-3, 5], [4, 6], [9, 4], [9, -1], [12, -6], [13, -12], [12, -18], [15, -27], [18, -34], [20, -35], [26, -34], [31, -29], [33, -25], [35, -24], [40, -15], [40, -10], [39, -5], [42, 0], [46, 2], [51, 11], [43, 12], [39, 16], [36, 22], [34, 27], [32, 31], [25, 32], [20, 31], [16, 32], [10, 33], [10, 37], [3, 37], [-2, 35], [-6, 36], [-10, 30], [-13, 27]],
  // Australia
  [[114, -22], [114, -26], [115, -34], [118, -35], [124, -34], [129, -32], [135, -35], [138, -35], [140, -38], [146, -39], [150, -37], [153, -31], [153, -25], [149, -21], [146, -19], [142, -11], [141, -15], [136, -12], [132, -11], [129, -15], [125, -14], [122, -18]],
  // Great Britain, Ireland, Iceland
  [[-5, 50], [1, 51], [2, 53], [0, 54], [-2, 56], [-2, 58], [-5, 58], [-6, 56], [-5, 54], [-3, 54], [-5, 52]],
  [[-10, 52], [-6, 52], [-6, 55], [-8, 55], [-10, 54]],
  [[-24, 64], [-14, 64], [-15, 66], [-22, 66]],
  // Japan
  [[130, 31], [132, 34], [135, 34], [140, 35], [141, 38], [142, 41], [140, 41], [139, 38], [137, 37], [133, 35], [130, 33]],
  [[141, 42], [145, 43], [144, 45], [141, 45]],
  // South-east Asia islands
  [[95, 5], [98, 4], [104, -2], [106, -6], [102, -4], [97, 1]],
  [[109, 1], [111, -3], [116, -4], [119, 1], [117, 7], [113, 3]],
  [[105, -6], [114, -7], [114, -8], [106, -7]],
  [[131, -1], [138, -2], [147, -6], [150, -10], [142, -9], [138, -8], [132, -3]],
  [[120, 18], [122, 18], [124, 12], [126, 7], [122, 7], [121, 13]],
  // New Zealand, Madagascar, Sri Lanka, Cuba
  [[172, -34], [175, -37], [178, -38], [175, -41], [174, -41], [171, -44], [167, -46], [168, -44], [172, -41]],
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -16]],
  [[80, 6], [82, 7], [81, 10], [80, 9]],
  [[-85, 22], [-80, 23], [-74, 20], [-78, 20]],
  // Antarctica
  [[-180, -70], [-120, -73], [-60, -64], [0, -70], [60, -67], [120, -66], [180, -70], [180, -90], [-180, -90]],
];

/** inland seas cut back out of the land */
export const WATER: [number, number][][] = [
  [[28, 41], [41, 41], [39, 47], [31, 46]],
  [[47, 37], [54, 37], [53, 42], [51, 47], [47, 45]],
];
