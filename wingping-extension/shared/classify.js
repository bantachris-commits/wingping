// WingPing — pure classification & matching logic (no chrome.* APIs here).
// Used by background.js, popup.js, and options.js; unit-testable in isolation.

export const DEFAULT_SETTINGS = {
  lat: 39.7392,
  lon: -104.9903,
  radiusNm: 5,           // "overhead" radius in nautical miles (1–250)
  pollSeconds: 30,       // chrome.alarms floor is 30s
  cooldownMinutes: 30,   // min time between re-alerts for the same aircraft
  ignoreGround: true,    // skip aircraft reporting on-ground
  maxStaleSeconds: 60,   // skip contacts not heard from recently
  notify: true,
  nearestAirport: "",    // ICAO/IATA code used for the LiveATC radio link
  categories: {
    military: true,
    helicopter: true,
    jet: false,          // common near cities; off by default
    heavy: false,
    balloon: true,
    glider: false,
    drone: false,
    prop: false,
    emergency: true      // squawk 7500/7600/7700 — overrides exclusions
  },
  watchlist: [],         // always alert — hex / registration / callsign / type, trailing * wildcard
  exclusions: [],        // never alert — same matching rules, checked first
  provider: "airplanes.live",
  mapProvider: "adsbexchange"
};

export const API_PROVIDERS = {
  "airplanes.live": (lat, lon, nm) =>
    `https://api.airplanes.live/v2/point/${lat}/${lon}/${Math.min(nm, 250)}`,
  "adsb.lol": (lat, lon, nm) =>
    `https://api.adsb.lol/v2/point/${lat}/${lon}/${Math.min(nm, 250)}`
};

export const MAP_PROVIDERS = {
  adsbexchange:     hex => `https://globe.adsbexchange.com/?icao=${hex}`,
  "airplanes.live": hex => `https://globe.airplanes.live/?icao=${hex}`,
  "adsb.lol":       hex => `https://adsb.lol/?icao=${hex}`
};

export function atcUrl(airport) {
  const code = (airport || "").trim().toUpperCase();
  return code
    ? `https://www.liveatc.net/search/?icao=${encodeURIComponent(code)}`
    : "https://www.liveatc.net/";
}

// --- category matchers -------------------------------------------------------

const HELI_TYPES = new Set([
  "R22", "R44", "R66", "B06", "B407", "B412", "B429", "B430", "B47G",
  "EC20", "EC30", "EC35", "EC45", "EC55", "EC75", "EC120", "EC130",
  "AS50", "AS55", "AS65", "H60", "UH1", "UH1Y", "H47", "H53", "H64",
  "A109", "A119", "A139", "A169", "A189", "AW09", "S61", "S76", "S92",
  "MD50", "MD52", "MD60", "MI8", "MI17", "KA32", "LYNX", "PUMA", "TIGR",
  "V22", "H500", "GAZL", "EXPL", "ALO2", "ALO3", "B105",
  "B212", "B214", "B222", "B230", "B305", "B355", "B505", "EN28", "EN48"
]);

const JET_TYPES = new Set([
  // airliners
  "A19N", "A20N", "A21N", "A318", "A319", "A320", "A321", "A332", "A333",
  "A339", "A342", "A343", "A346", "A350", "A359", "A35K", "A380", "A388",
  "B712", "B721", "B722", "B731", "B732", "B733", "B734", "B735", "B736",
  "B737", "B738", "B739", "B37M", "B38M", "B39M", "B3XM", "B741", "B742",
  "B744", "B748", "B752", "B753", "B762", "B763", "B764", "B772", "B773",
  "B77L", "B77W", "B788", "B789", "B78X", "MD11", "MD80", "MD82", "MD83",
  "MD87", "MD88", "MD90", "CRJ2", "CRJ7", "CRJ9", "CRJX", "E135", "E145",
  "E170", "E175", "E190", "E195", "E290", "E295", "BCS1", "BCS3",
  // bizjets
  "C25A", "C25B", "C25C", "C25M", "C500", "C510", "C525", "C550", "C560",
  "C56X", "C650", "C680", "C68A", "C700", "C750", "CL30", "CL35", "CL60",
  "GL5T", "GL7T", "GLEX", "GLF3", "GLF4", "GLF5", "GLF6", "G280", "G150",
  "E50P", "E55P", "E545", "E550", "F2TH", "F900", "FA10", "FA20", "FA50",
  "FA7X", "FA8X", "H25A", "H25B", "H25C", "HDJT", "LJ31", "LJ35", "LJ40",
  "LJ45", "LJ60", "LJ70", "LJ75", "PC24", "PRM1", "SF50",
  // military fast movers
  "F15", "F16", "F18", "F22", "F35", "FA18", "A10", "B1", "B2", "B52",
  "T38", "HAWK", "EUFI", "TOR", "GRIP", "K35R", "C17", "C5M"
]);

const HEAVY_TYPES = new Set([
  "A124", "A225", "A332", "A333", "A339", "A342", "A343", "A346", "A359",
  "A35K", "A388", "B741", "B742", "B744", "B748", "B763", "B764", "B772",
  "B773", "B77L", "B77W", "B788", "B789", "B78X", "MD11", "C5M", "C17",
  "IL76", "K35R", "KC10", "DC10", "A400"
]);

// Common light GA piston/turboprop designators.
const PROP_TYPES = new Set([
  "C150", "C152", "C162", "C170", "C172", "C177", "C180", "C182", "C185",
  "C206", "C208", "C210", "C310", "C337", "C414", "C421", "P28A", "P28B",
  "P28R", "P28T", "P32R", "P32T", "PA18", "PA24", "PA34", "PA44", "PA46",
  "SR20", "SR22", "S22T", "DA20", "DA40", "DA42", "DA62", "BE33", "BE35",
  "BE36", "BE55", "BE58", "BE76", "B350", "BE9L", "BE20", "M20P", "M20T",
  "PC12", "TBM7", "TBM8", "TBM9", "RV4", "RV6", "RV7", "RV8", "RV9",
  "RV10", "RV12", "RV14", "GLST", "CH70", "AC11", "AA5", "DHC2", "DHC3", "DHC6"
]);

const GLIDER_TYPES = new Set([
  "GLID", "DISC", "DUOD", "LS4", "LS6", "LS8", "DG80", "DG1T", "AS21",
  "AS25", "AS30", "ARCP", "ARCE", "NIMB", "PK20", "SZ55", "SF25"
]);

const DRONE_TYPES = new Set(["MQ9", "RQ4", "MQ4C", "MQ1B", "M600", "S70O", "SHLD", "VTOL"]);

const MIL_CALLSIGN_PREFIXES = [
  "RCH", "PAT", "EVAC", "SAM", "SPAR", "NAVY", "ARMY", "PACK", "DUKE",
  "HOIST", "TREK", "KING", "PEDRO", "JAKE", "TOPCT", "BOLT", "VIPER",
  "HAWG", "SNTRY", "REDEYE", "CNV", "RRR", "ASCOT", "CFC", "GAF", "FAF"
];

const BALLOON_CALLSIGN_PREFIXES = ["HBAL", "HBL"];

export const EMERGENCY_SQUAWKS = { "7500": "HIJACK", "7600": "RADIO FAILURE", "7700": "EMERGENCY" };

const cs = ac => (ac.flight || "").trim().toUpperCase();
const typeOf = ac => (ac.t || "").toUpperCase();

export function isMilitary(ac) {
  if ((ac.dbFlags ?? 0) & 1) return true;
  return MIL_CALLSIGN_PREFIXES.some(p => cs(ac).startsWith(p));
}

export function isHelicopter(ac) {
  return ac.category === "A7" || HELI_TYPES.has(typeOf(ac));
}

export function isJet(ac) {
  if (JET_TYPES.has(typeOf(ac))) return true;
  // Physics backstop: sustained >250 kt above 10,000 ft ≈ turbine.
  const alt = typeof ac.alt_baro === "number" ? ac.alt_baro : null;
  const gs = typeof ac.gs === "number" ? ac.gs : null;
  return alt !== null && gs !== null && alt > 10000 && gs > 250;
}

export function isHeavy(ac) {
  return ac.category === "A5" || HEAVY_TYPES.has(typeOf(ac));
}

export function isBalloon(ac) {
  if (ac.category === "B2" || typeOf(ac) === "BALL") return true;
  return BALLOON_CALLSIGN_PREFIXES.some(p => cs(ac).startsWith(p));
}

export function isGlider(ac) {
  return ac.category === "B1" || GLIDER_TYPES.has(typeOf(ac));
}

export function isDrone(ac) {
  return ac.category === "B6" || DRONE_TYPES.has(typeOf(ac));
}

export function isProp(ac) {
  if (isHelicopter(ac) || isJet(ac) || isBalloon(ac) || isGlider(ac)) return false;
  return ac.category === "A1" || PROP_TYPES.has(typeOf(ac));
}

export function isEmergency(ac) {
  return Object.prototype.hasOwnProperty.call(EMERGENCY_SQUAWKS, ac.squawk);
}

export const CATEGORY_MATCHERS = {
  emergency:  { label: "EMERGENCY", test: isEmergency },
  military:   { label: "MILITARY", test: isMilitary },
  helicopter: { label: "HELICOPTER", test: isHelicopter },
  heavy:      { label: "HEAVY", test: isHeavy },
  balloon:    { label: "BALLOON", test: isBalloon },
  glider:     { label: "GLIDER", test: isGlider },
  drone:      { label: "DRONE", test: isDrone },
  jet:        { label: "JET", test: isJet },
  prop:       { label: "PROP/GA", test: isProp }
};

// --- watchlist & exclusion matching ------------------------------------------
// An entry matches hex, registration, callsign, or type. Trailing * = prefix.

function fieldsOf(ac) {
  return [ac.hex, ac.r, (ac.flight || "").trim(), ac.t]
    .filter(Boolean)
    .map(s => String(s).toUpperCase());
}

function entryMatches(raw, fields) {
  const e = String(raw).trim().toUpperCase();
  if (!e) return false;
  if (e.endsWith("*")) {
    const prefix = e.slice(0, -1);
    return prefix.length > 0 && fields.some(f => f.startsWith(prefix));
  }
  return fields.includes(e);
}

export function listHit(ac, list) {
  if (!list?.length) return null;
  const fields = fieldsOf(ac);
  for (const raw of list) if (entryMatches(raw, fields)) return String(raw).trim();
  return null;
}

export const watchlistHit = (ac, watchlist) => listHit(ac, watchlist);

// --- top-level evaluation ------------------------------------------------------
// Returns:
//   null                                   → no interest, plain traffic
//   { excluded: "LIFE*" }                  → suppressed by exclusion list
//   { categories: [...], watch, emergency } → alert
// Precedence: emergency beats exclusion; exclusion beats watchlist & categories.

export function evaluate(ac, settings) {
  const emergency = !!settings.categories?.emergency && isEmergency(ac);
  const excludedBy = listHit(ac, settings.exclusions);
  if (excludedBy && !emergency) return { excluded: excludedBy };

  const cats = Object.entries(CATEGORY_MATCHERS)
    .filter(([key, m]) => settings.categories?.[key] && m.test(ac))
    .map(([key]) => key);
  const watch = listHit(ac, settings.watchlist);
  if (!cats.length && !watch) return null;
  return { categories: cats, watch, emergency };
}

export function isUsable(ac, settings) {
  if (!ac.hex) return false;
  if ((ac.seen ?? 0) > settings.maxStaleSeconds) return false;
  if (settings.ignoreGround && ac.alt_baro === "ground") return false;
  return true;
}

// --- formatting & geometry helpers ---------------------------------------------

export function describe(ac) {
  const name = (ac.flight || "").trim() || ac.r || ac.hex.toUpperCase();
  const t = ac.t ? ` (${ac.t})` : "";
  return `${name}${t}`;
}

export function formatAlt(ac) {
  if (ac.alt_baro === "ground") return "on ground";
  if (typeof ac.alt_baro === "number") return `${ac.alt_baro.toLocaleString()} ft`;
  return "alt n/a";
}

export function distanceNm(ac, lat, lon) {
  if (typeof ac.lat !== "number" || typeof ac.lon !== "number") return null;
  const R = 3440.065; // earth radius in NM
  const dLat = (ac.lat - lat) * Math.PI / 180;
  const dLon = (ac.lon - lon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat * Math.PI / 180) * Math.cos(ac.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// True bearing from home to aircraft, degrees 0–360 (0 = north).
export function bearingDeg(ac, lat, lon) {
  if (typeof ac.lat !== "number" || typeof ac.lon !== "number") return null;
  const p1 = lat * Math.PI / 180, p2 = ac.lat * Math.PI / 180;
  const dL = (ac.lon - lon) * Math.PI / 180;
  const y = Math.sin(dL) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dL);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function mapUrl(hex, settings) {
  const fn = MAP_PROVIDERS[settings.mapProvider] || MAP_PROVIDERS.adsbexchange;
  return fn(hex);
}
