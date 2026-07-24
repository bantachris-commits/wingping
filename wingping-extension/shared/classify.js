// WingPing — pure classification & matching logic (no chrome.* APIs here).
// Used by background.js and popup.js; easy to unit test in isolation.

export const DEFAULT_SETTINGS = {
  lat: 39.7392,
  lon: -104.9903,
  radiusNm: 5,           // "overhead" radius in nautical miles (1–250)
  pollSeconds: 30,       // chrome.alarms floor is 30s
  cooldownMinutes: 30,   // min time between re-alerts for the same aircraft
  ignoreGround: true,    // skip aircraft reporting on-ground
  maxStaleSeconds: 60,   // skip contacts not heard from recently
  notify: true,
  categories: {
    military: true,
    helicopter: true,
    jet: false           // jets are common near cities; off by default
  },
  watchlist: [],         // strings matched against hex / registration / callsign / type
  provider: "airplanes.live",        // data API
  mapProvider: "adsbexchange"        // where "view flight path" opens
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

// --- category matchers -----------------------------------------------------

// ICAO type designators that are rotorcraft (backstop for missing category).
const HELI_TYPES = new Set([
  "R22", "R44", "R66", "B06", "B407", "B412", "B429", "B430", "B47G",
  "EC20", "EC30", "EC35", "EC45", "EC55", "EC75", "EC120", "EC130",
  "AS50", "AS55", "AS65", "H60", "UH1", "UH1Y", "H47", "H53", "H64",
  "A109", "A119", "A139", "A169", "A189", "AW09", "S61", "S76", "S92",
  "MD50", "MD52", "MD60", "MI8", "MI17", "KA32", "LYNX", "PUMA", "TIGR",
  "V22", "H500", "H2", "R4", "GAZL", "EXPL", "ALO2", "ALO3", "B105",
  "B212", "B214", "B222", "B230", "B305", "B355", "B505", "EN28", "EN48"
]);

// Common jet type designators: airliners, bizjets, military fast movers.
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

// Callsign prefixes strongly associated with military ops (backstop for dbFlags).
const MIL_CALLSIGN_PREFIXES = [
  "RCH", "PAT", "EVAC", "SAM", "SPAR", "NAVY", "ARMY", "PACK", "DUKE",
  "HOIST", "TREK", "KING", "PEDRO", "JAKE", "TOPCT", "BOLT", "VIPER",
  "HAWG", "SNTRY", "REDEYE", "CNV", "RRR", "ASCOT", "CFC", "GAF", "FAF"
];

export function isMilitary(ac) {
  if ((ac.dbFlags ?? 0) & 1) return true;
  const cs = (ac.flight || "").trim().toUpperCase();
  return MIL_CALLSIGN_PREFIXES.some(p => cs.startsWith(p));
}

export function isHelicopter(ac) {
  if (ac.category === "A7") return true;
  return HELI_TYPES.has((ac.t || "").toUpperCase());
}

export function isJet(ac) {
  if (JET_TYPES.has((ac.t || "").toUpperCase())) return true;
  // Physics backstop: sustained >250 kt above 10,000 ft is essentially
  // always a turbine-powered aircraft.
  const alt = typeof ac.alt_baro === "number" ? ac.alt_baro : null;
  const gs = typeof ac.gs === "number" ? ac.gs : null;
  return alt !== null && gs !== null && alt > 10000 && gs > 250;
}

export const CATEGORY_MATCHERS = {
  military: { label: "MILITARY", test: isMilitary },
  helicopter: { label: "HELICOPTER", test: isHelicopter },
  jet: { label: "JET", test: isJet }
};

// --- watchlist --------------------------------------------------------------

// A watchlist entry matches an aircraft's hex, registration, callsign, or type.
export function watchlistHit(ac, watchlist) {
  if (!watchlist?.length) return null;
  const fields = [ac.hex, ac.r, (ac.flight || "").trim(), ac.t]
    .filter(Boolean)
    .map(s => s.toUpperCase());
  for (const raw of watchlist) {
    const entry = raw.trim().toUpperCase();
    if (entry && fields.includes(entry)) return raw.trim();
  }
  return null;
}

// --- top-level evaluation ---------------------------------------------------

// Returns null (no interest) or { categories: [...], watch: "N123AB"|null }.
export function evaluate(ac, settings) {
  const cats = Object.entries(CATEGORY_MATCHERS)
    .filter(([key, m]) => settings.categories?.[key] && m.test(ac))
    .map(([key]) => key);
  const watch = watchlistHit(ac, settings.watchlist);
  if (!cats.length && !watch) return null;
  return { categories: cats, watch };
}

export function isUsable(ac, settings) {
  if (!ac.hex) return false;
  if ((ac.seen ?? 0) > settings.maxStaleSeconds) return false;
  if (settings.ignoreGround && ac.alt_baro === "ground") return false;
  return true;
}

// --- formatting helpers -----------------------------------------------------

export function describe(ac) {
  const name = (ac.flight || "").trim() || ac.r || ac.hex.toUpperCase();
  const type = ac.t ? ` (${ac.t})` : "";
  return `${name}${type}`;
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

export function mapUrl(hex, settings) {
  const fn = MAP_PROVIDERS[settings.mapProvider] || MAP_PROVIDERS.adsbexchange;
  return fn(hex);
}
