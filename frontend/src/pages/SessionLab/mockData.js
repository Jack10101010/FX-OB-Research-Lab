// Mock placeholder data for Session Lab Decision Cockpit prototype.
// All values are illustrative only — no real analytics.

export const SESSION_LIST = [
  {
    key: "asia",
    name: "Asia",
    range: "00:00 – 07:00 UTC",
    icon: "moon",
    netR: 1.3,
    pf: 1.2,
    wr: 25,
    dd: -6.5,
    trades: 8,
    expectancy: 0.16,
    avgR: 0.16,
    avgTime: "2h 12m",
    verdict: "selective",
    bestStructure: "BOS",
    worstStructure: "CHoCH",
    bestEntry: "TE Delay +3",
    bestDelay: "Delay +3",
    longShortSplit: { long: 60, short: 40 },
    bosChochSplit: { bos: 62, choch: 38 },
    spark: [0, 0.3, -0.2, 0.4, 0.6, 0.4, 0.8, 1.1, 0.9, 1.3],
    enabled: true,
    longs: true,
    shorts: true,
    bos: true,
    choch: true,
  },
  {
    key: "london",
    name: "London",
    range: "07:00 – 10:00 UTC",
    icon: "building",
    netR: 2.1,
    pf: 1.96,
    wr: 33,
    dd: -1.1,
    trades: 4,
    expectancy: 0.52,
    avgR: 0.52,
    avgTime: "1h 24m",
    verdict: "selective",
    bestStructure: "BOS + TE Delay +2",
    worstStructure: "CHoCH + TE Same",
    bestEntry: "TE Delay +2",
    bestDelay: "Delay +2",
    longShortSplit: { long: 70, short: 30 },
    bosChochSplit: { bos: 75, choch: 25 },
    spark: [0, -0.1, 0.3, 0.6, 0.4, 0.9, 1.2, 1.6, 1.8, 2.1],
    enabled: true,
    longs: true,
    shorts: true,
    bos: true,
    choch: false, // partially disabled
  },
  {
    key: "lull",
    name: "London Lull",
    range: "10:00 – 13:00 UTC",
    icon: "coffee",
    netR: 1.6,
    pf: 1.74,
    wr: 33,
    dd: -1.1,
    trades: 3,
    expectancy: 0.53,
    avgR: 0.53,
    avgTime: "1h 50m",
    verdict: "selective",
    bestStructure: "BOS",
    worstStructure: "CHoCH",
    bestEntry: "TE Next",
    bestDelay: "Next",
    longShortSplit: { long: 55, short: 45 },
    bosChochSplit: { bos: 60, choch: 40 },
    spark: [0, 0.2, 0.4, 0.3, 0.6, 0.8, 1.0, 1.3, 1.5, 1.6],
    enabled: true,
    longs: true,
    shorts: true,
    bos: true,
    choch: false,
  },
  {
    key: "ny",
    name: "New York",
    range: "13:00 – 17:00 UTC",
    icon: "city",
    netR: 16.8,
    pf: 3.5,
    wr: 50,
    dd: -3.3,
    trades: 13,
    expectancy: 1.29,
    avgR: 1.29,
    avgTime: "1h 06m",
    verdict: "strong",
    bestStructure: "Long BOS + TE Delay +2",
    worstStructure: "Short CHoCH",
    bestEntry: "TE Delay +2",
    bestDelay: "Delay +2",
    longShortSplit: { long: 65, short: 35 },
    bosChochSplit: { bos: 68, choch: 32 },
    spark: [0, 1.2, 2.1, 3.4, 5.2, 7.1, 9.4, 11.8, 14.2, 16.8],
    enabled: true,
    longs: true,
    shorts: true,
    bos: true,
    choch: true,
  },
  {
    key: "nypm",
    name: "NY PM",
    range: "17:00 – 20:00 UTC",
    icon: "skyline",
    netR: 4.9,
    pf: 1.23,
    wr: 48,
    dd: -2.0,
    trades: 6,
    expectancy: 0.82,
    avgR: 0.82,
    avgTime: "1h 35m",
    verdict: "selective",
    bestStructure: "Long BOS",
    worstStructure: "Short CHoCH",
    bestEntry: "TE Delay +2",
    bestDelay: "Delay +2",
    longShortSplit: { long: 58, short: 42 },
    bosChochSplit: { bos: 60, choch: 40 },
    spark: [0, 0.4, 1.1, 1.8, 2.4, 3.0, 3.6, 4.1, 4.5, 4.9],
    enabled: true,
    longs: true,
    shorts: true,
    bos: true,
    choch: true,
  },
  {
    key: "outside",
    name: "Outside",
    range: "20:00 – 00:00 UTC",
    icon: "globe",
    netR: -2.0,
    pf: 0.8,
    wr: 18,
    dd: -5.6,
    trades: 11,
    expectancy: -0.18,
    avgR: -0.18,
    avgTime: "2h 41m",
    verdict: "avoid",
    bestStructure: "BOS",
    worstStructure: "CHoCH",
    bestEntry: "TE Same",
    bestDelay: "Same",
    longShortSplit: { long: 50, short: 50 },
    bosChochSplit: { bos: 55, choch: 45 },
    spark: [0, -0.2, -0.4, -0.3, -0.7, -1.1, -1.4, -1.7, -1.9, -2.0],
    enabled: false,
    longs: false,
    shorts: false,
    bos: true,
    choch: true,
  },
];

export const IMPACT_SUMMARY = {
  baseline: { netR: 19.8, trades: 39, wr: 32.4, pf: 1.62, dd: -6.5 },
  preview:  { netR: 28.7, trades: 27, wr: 45.8, pf: 2.21, dd: -3.2 },
  delta: {
    netR: 8.9,
    trades: -12,
    wr: 13.4,
    pf: 0.59,
    dd: 3.3,
    losses_removed: 10,
    winners_removed: 2,
  },
};

export const NET_R_BY_SESSION = [
  { name: "NY",      netR: 16.8 },
  { name: "NY PM",   netR: 4.9 },
  { name: "London",  netR: 2.1 },
  { name: "Lull",    netR: 1.6 },
  { name: "Asia",    netR: 1.3 },
  { name: "Outside", netR: -2.0 },
];

export const TRADES_BY_DIRECTION = [
  { name: "Long",  value: 18, color: "#22C55E" },
  { name: "Short", value: 9,  color: "#EF4444" },
];

export const TRADES_BY_STRUCTURE = [
  { name: "BOS",   value: 17, color: "#3B82F6" },
  { name: "CHoCH", value: 10, color: "#A855F7" },
];

export const TOP_ENTRY_MODEL = [
  { name: "TE Delay +2", netR: 11.8 },
  { name: "TE Delay +3", netR: 8.7 },
  { name: "TE Next",     netR: 5.2 },
  { name: "TE Same",     netR: 3.1 },
  { name: "Baseline",    netR: -1.2 },
];

// ----- Deep Dive (London) data -----
export const DEEP_DIVE_LONDON = {
  session: "London",
  range: "07:00 – 10:00 UTC",
  metrics: {
    netR: 2.1, wr: 33.3, expectancy: 0.52, pf: 1.96, dd: -1.1, trades: 4, avgR: 0.52, avgTime: "1h 24m",
  },
  equity: [
    { t: "07:00", v: 0 },{ t: "07:15", v: -0.1 },{ t: "07:30", v: 0.3 },{ t: "07:45", v: 0.2 },
    { t: "08:00", v: 0.6 },{ t: "08:15", v: 0.8 },{ t: "08:30", v: 1.0 },{ t: "08:45", v: 1.4 },
    { t: "09:00", v: 1.5 },{ t: "09:15", v: 1.7 },{ t: "09:30", v: 1.9 },{ t: "09:45", v: 2.0 },{ t: "10:00", v: 2.1 },
  ],
  allSessionsEquity: [
    { t: "07:00", v: 0 },{ t: "07:15", v: 0.1 },{ t: "07:30", v: 0.4 },{ t: "07:45", v: 0.6 },
    { t: "08:00", v: 0.8 },{ t: "08:15", v: 0.9 },{ t: "08:30", v: 1.1 },{ t: "08:45", v: 1.3 },
    { t: "09:00", v: 1.5 },{ t: "09:15", v: 1.6 },{ t: "09:30", v: 1.7 },{ t: "09:45", v: 1.8 },{ t: "10:00", v: 1.9 },
  ],
  breakdown: [
    { cat: "Direction",     best: "Long",        bestR: 1.45,  worst: "Short",      worstR: -0.32 },
    { cat: "Structure",     best: "BOS",         bestR: 1.62,  worst: "CHoCH",      worstR: 0.48 },
    { cat: "Entry Model",   best: "TE Delay +2", bestR: 1.20,  worst: "Baseline",   worstR: -0.18 },
    { cat: "Trigger Delay", best: "Delay +2",    bestR: 1.20,  worst: "Same",       worstR: -0.22 },
    { cat: "R Target",      best: "2R",          bestR: 0.78,  worst: "3R",         worstR: -0.20 },
    { cat: "Stop Buffer",   best: "0%",          bestR: 1.02,  worst: "1.0%",       worstR: -0.32 },
    { cat: "BE / Trailing", best: "Trailing",    bestR: 0.92,  worst: "None",       worstR: -0.40 },
    { cat: "Cancellation",  best: "—",           bestR: 0,     worst: "First Tag",  worstR: -0.55 },
  ],
};

export const DIRECTION_LAB = {
  longs: {
    netR: 12.41, trades: 18, wr: 55.6, pf: 2.13, dd: -3.21,
    bestStructure: { label: "BOS", value: 9.73 },
    worstStructure: { label: "CHoCH", value: -1.23 },
    bestEntry: { label: "TE Delay +2", value: 8.21 },
    bestDelay: { label: "Delay +2", value: 8.21 },
    fastStopouts: { count: 4, pct: 22.2 },
    equity: [0, 1, 2.4, 3.1, 4.2, 5.8, 6.9, 7.5, 8.4, 9.8, 10.6, 11.4, 12.4].map((v, i) => ({ t: i, v })),
  },
  shorts: {
    netR: -10.33, trades: 9, wr: 33.3, pf: 0.72, dd: -5.42,
    bestStructure: { label: "BOS", value: -1.12 },
    worstStructure: { label: "CHoCH", value: -8.98 },
    bestEntry: { label: "TE Next", value: -3.22 },
    bestDelay: { label: "Delay 0", value: -2.11 },
    fastStopouts: { count: 5, pct: 55.6 },
    equity: [0, -0.4, -1.2, -2.5, -3.6, -4.8, -5.7, -7.1, -7.8, -8.4, -9.1, -9.8, -10.33].map((v, i) => ({ t: i, v })),
  },
};

export const STRUCTURE_LAB = {
  bos: { netR: 13.41, trades: 17, wr: 63.0, pf: 2.28, dd: -3.11 },
  choch: { netR: 3.41, trades: 10, wr: 37.0, pf: 1.76, dd: -2.32 },
  matrix: [
    { dir: "Long",  struct: "BOS",   netR: 9.73, trades: 12, wr: 66.7, pf: 2.45, dd: -2.45 },
    { dir: "Short", struct: "BOS",   netR: 3.68, trades: 5,  wr: 60.0, pf: 1.92, dd: -1.32 },
    { dir: "Long",  struct: "CHoCH", netR: 1.23, trades: 6,  wr: 33.3, pf: 1.71, dd: -1.88 },
    { dir: "Short", struct: "CHoCH", netR: 2.19, trades: 4,  wr: 25.0, pf: 1.85, dd: -0.98 },
  ],
  overTime: Array.from({ length: 13 }, (_, i) => ({
    t: `${(7 + Math.floor(i / 4)).toString().padStart(2, "0")}:${((i % 4) * 15).toString().padStart(2, "0")}`,
    bos: [0, 0.4, 1.2, 2.1, 3.2, 4.5, 5.9, 7.5, 9.1, 10.4, 11.8, 12.6, 13.4][i],
    choch: [0, -0.2, 0.1, 0.5, 0.8, 1.1, 1.5, 1.9, 2.4, 2.7, 3.0, 3.2, 3.4][i],
  })),
};

export const ENTRY_MODELS = [
  { name: "Baseline",       long: { trades: 6, netR: 1.21,  wr: 50.0, pf: 1.45, exp: 0.20 }, short: { trades: 4, netR: -0.98, wr: 25.0, pf: 0.68, exp: -0.24 } },
  { name: "Penetration 10%",long: { trades: 7, netR: 2.34,  wr: 42.9, pf: 1.38, exp: -0.33 }, short: { trades: 3, netR: -1.20, wr: 25.0, pf: 0.62, exp: -0.30 } },
  { name: "Penetration 25%",long: { trades: 6, netR: 1.02,  wr: 50.0, pf: 1.22, exp: 0.13 }, short: { trades: 3, netR: -1.04, wr: 33.3, pf: 0.71, exp: -0.35 } },
  { name: "Penetration 50%",long: { trades: 5, netR: 0.42,  wr: 40.0, pf: 1.05, exp: 0.08 }, short: { trades: 2, netR: -0.78, wr: 0.0, pf: 0.0,   exp: -0.39 } },
  { name: "TE Same",        long: { trades: 6, netR: 3.11,  wr: 50.0, pf: 1.71, exp: 0.52 }, short: { trades: 2, netR: -0.22, wr: 50.0, pf: 0.89, exp: -0.11 } },
  { name: "TE Next",        long: { trades: 6, netR: 5.21,  wr: 66.7, pf: 2.18, exp: 0.87 }, short: { trades: 4, netR: -3.88, wr: 25.0, pf: 0.40, exp: -0.97 } },
  { name: "TE Delay +2",    long: { trades: 8, netR: 8.21,  wr: 62.5, pf: 2.67, exp: 1.03 }, short: { trades: 1, netR: -0.41, wr: 0.0,  pf: 0.0,  exp: -0.41 } },
  { name: "TE Delay +3",    long: { trades: 7, netR: 6.02,  wr: 57.1, pf: 2.31, exp: 0.86 }, short: { trades: 1, netR: -0.53, wr: 0.0,  pf: 0.0,  exp: -0.53 } },
];

export const HOURLY_DATA = [
  { hour: "07:00–07:30", trades: 5, netR: 1.21, wr: 60, pf: 1.89, avgR: 0.24, loss: 40 },
  { hour: "07:30–08:00", trades: 4, netR: 2.33, wr: 75, pf: 2.41, avgR: 0.58, loss: 25 },
  { hour: "08:00–08:30", trades: 4, netR: -0.53, wr: 25, pf: 0.61, avgR: -0.13, loss: 75 },
  { hour: "08:30–09:00", trades: 3, netR: 1.12, wr: 66.7, pf: 1.92, avgR: 0.37, loss: 33.3 },
  { hour: "09:00–09:30", trades: 3, netR: 1.29, wr: 66.7, pf: 1.78, avgR: 0.43, loss: 33.3 },
  { hour: "09:30–10:00", trades: 4, netR: -1.24, wr: 25, pf: 0.52, avgR: -0.31, loss: 75 },
];

export const DAY_OF_WEEK = [
  { day: "Mon", netR: 2.31 },
  { day: "Tue", netR: 3.21 },
  { day: "Wed", netR: 1.62 },
  { day: "Thu", netR: 2.78 },
  { day: "Fri", netR: 4.12 },
  { day: "Sat", netR: -0.82 },
  { day: "Sun", netR: -1.12 },
];

// Heatmap rows = day of week, cols = hour buckets
export const WR_HEATMAP = {
  hours: ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30"],
  rows: [
    { day: "Mon", values: [65, 70, 40, 55, 75, 30] },
    { day: "Tue", values: [80, 90, 60, 50, 65, 45] },
    { day: "Wed", values: [55, 60, 35, 45, 70, 50] },
    { day: "Thu", values: [70, 85, 25, 60, 80, 35] },
    { day: "Fri", values: [60, 75, 50, 70, 85, 55] },
    { day: "Sat", values: [40, 30, 20, 35, 50, 25] },
    { day: "Sun", values: [25, 35, 15, 40, 30, 20] },
  ],
};

export const OB_DATA = {
  origin: [
    { session: "London",      netR: 4.8 },
    { session: "New York",    netR: 3.6 },
    { session: "Asia",        netR: 2.1 },
    { session: "London Lull", netR: 0.9 },
    { session: "Outside",     netR: -1.2 },
    { session: "NY PM",       netR: -0.4 },
  ],
  detection: [
    { session: "London",      netR: 5.4 },
    { session: "New York",    netR: 3.1 },
    { session: "Asia",        netR: 1.8 },
    { session: "London Lull", netR: 0.6 },
    { session: "Outside",     netR: -1.5 },
    { session: "NY PM",       netR: -0.7 },
  ],
  width: [
    { bucket: "0 – 0.5R",  trades: 6,  pct: 22.2, netR: 4.12 },
    { bucket: "0.5 – 1R",  trades: 10, pct: 37.0, netR: 6.72 },
    { bucket: "1 – 1.5R",  trades: 6,  pct: 22.2, netR: -1.21 },
    { bucket: "1.5 – 2R",  trades: 3,  pct: 11.1, netR: -2.33 },
    { bucket: "> 2R",      trades: 2,  pct: 7.4,  netR: -4.51 },
  ],
  age: [
    { bucket: "0–4 candles",   trades: 9,  pct: 33.3, netR: 6.21 },
    { bucket: "5–10 candles",  trades: 11, pct: 40.7, netR: 5.12 },
    { bucket: "11–20 candles", trades: 5,  pct: 18.5, netR: -0.45 },
    { bucket: "> 20 candles",  trades: 2,  pct: 7.4,  netR: -2.11 },
  ],
  newsClean: [
    { name: "News OB",  value: 9,  color: "#F59E0B" },
    { name: "Clean OB", value: 18, color: "#22C55E" },
  ],
  meta: {
    avgWidth: "0.78R",
    fillRate: "62.9%",
    successRate: "48.1%",
  },
};

export const FAILURE_CARDS = [
  { name: "Fast Stopouts",     count: 5, pct: 18.5, netR: -3.21, spark: [0, -0.3, -0.8, -1.4, -2.1, -2.5, -3.0, -3.2] },
  { name: "First Failed Tag",  count: 4, pct: 14.8, netR: -2.14, spark: [0, -0.2, -0.6, -1.0, -1.4, -1.8, -2.0, -2.1] },
  { name: "OB Too Wide",       count: 3, pct: 11.1, netR: -1.89, spark: [0, -0.2, -0.5, -0.9, -1.3, -1.6, -1.8, -1.9] },
  { name: "News-Origin OB",    count: 2, pct: 7.4,  netR: -1.12, spark: [0, -0.1, -0.3, -0.5, -0.7, -0.9, -1.0, -1.1] },
  { name: "No Momentum",       count: 6, pct: 22.2, netR: -2.51, spark: [0, -0.3, -0.7, -1.2, -1.6, -2.0, -2.3, -2.5] },
  { name: "Range Conditions",  count: 4, pct: 14.8, netR: -1.42, spark: [0, -0.2, -0.4, -0.7, -1.0, -1.2, -1.3, -1.4] },
  { name: "Cancelled Pre-Entry", count: 3, pct: 11.1, netR: 0,   spark: [0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Session Expiry",    count: 2, pct: 7.4,  netR: -0.62, spark: [0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.6] },
];

export const CANCELLATION_REASONS = [
  { name: "Hit Stop Before Trigger", pct: 36.4, netR: -2.21 },
  { name: "No Momentum",             pct: 27.3, netR: -1.32 },
  { name: "Range Conditions",        pct: 18.2, netR: -0.76 },
  { name: "News Filter",             pct: 9.1,  netR: -0.41 },
  { name: "Other",                   pct: 9.1,  netR: -0.30 },
];

export const WORST_CLUSTER = {
  losses: 4,
  window: "07:45 – 08:25 UTC",
  netR: -3.12,
  trades: 4,
  cause: "Short / CHoCH / TE Next / Delay 0",
  spark: [0, -0.6, -1.2, -1.9, -2.4, -2.8, -3.0, -3.12],
};

// W/L sequence (each item = trade outcome). Used by Streaks tab.
export const WL_SEQUENCE = [
  "W","W","L","L","W","W","W","W","L","W",
  "W","L","L","L","L","W","W","W","W","L",
  "W","L","W","W","W","W","W",
];

export const STREAK_DISTRIBUTION = [
  { len: 1, wins: 5, losses: 6 },
  { len: 2, wins: 12, losses: 8 },
  { len: 3, wins: 9,  losses: 4 },
  { len: 4, wins: 6,  losses: 4 },
  { len: "5+", wins: 4, losses: 3 },
];

export const STREAK_SUMMARY = {
  longestWin: 4,
  longestLoss: 5,
  avgWin: 2.1,
  maxLossR: -3.21,
  zScore: -1.48,
  pValue: 0.14,
  verdict: "NOT RANDOM",
  netRWin: 6.21,
  netRLoss: -5.58,
};

export const SAMPLE_TRADE_HOVER = {
  id: "Trade #238",
  time: "07:52 UTC",
  session: "London",
  direction: "Long",
  structure: "BOS",
  entry: "TE Delay +2",
  delay: "+2",
  result: -1.0,
  exit: "Stop Loss (30m)",
  fastStopout: true,
};

// Impact on run "what-if" cards
export const SESSION_IMPACT_CARDS = [
  {
    scenario: "IF LONDON IS DISABLED",
    metrics: { netR: 26.6, trades: 23, wr: 47.8, pf: 2.32, dd: -3.0 },
    deltas:  { netR: 6.8, trades: -4,  wr: 14.6, pf: 0.36, dd: 3.5 },
  },
  {
    scenario: "IF ONLY LONGS ARE USED (IN LONDON)",
    metrics: { netR: 3.6, trades: 2, wr: 50.0, pf: "∞", dd: -0.6 },
    deltas:  { netR: 1.5, trades: -2, wr: 16.7, pf: "+∞", dd: 0.5 },
  },
  {
    scenario: "IF ONLY BOS IS USED (IN LONDON)",
    metrics: { netR: 5.4, trades: 6, wr: 66.0, pf: 2.80, dd: -1.0 },
    deltas:  { netR: 3.3, trades: 2, wr: 33.0, pf: 0.84, dd: 0.1 },
  },
];

export const ENTRY_MODEL_OPTIONS = [
  "Baseline",
  "Penetration 10%",
  "Penetration 25%",
  "Penetration 50%",
  "Triggered Edge Same",
  "Triggered Edge Next",
  "Triggered Edge Delay +2",
  "Triggered Edge Delay +3",
];
